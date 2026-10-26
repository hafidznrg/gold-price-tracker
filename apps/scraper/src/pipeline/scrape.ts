import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  jakartaDate,
  PriceSource,
  utcIso,
  type ErrorCode,
  type PriceRow,
  type ScraperId,
  type Slot,
  type Trigger,
} from '@gold/schema';
import { loadConfig, loadStatus } from '../config';
import { getScraper } from '../sources';
import type { ParseResult, RawPayload, SourceScraper } from '../sources/types';
import { ARTIFACT_FILES, type RawExtension, type ScrapeRun } from './artifact';
import { isExpectedDay } from './calendar';
import { errorCodeOf, errorMessageOf, ScrapeError } from './errors';
import { readPrices, sha256 } from './store';
import type { Candidate } from './upsert';
import { validate, type HeldBatch } from './validate';

// Job scrape (WORKFLOWS §2): fetch → parse → validasi satu sumber, lalu tulis artifact
// `out-{source}` (§2.1). Tidak pernah menulis ke data/. Kode keluar sesuai §2.3.

export const SCRAPE_EXIT = { OK: 0, FAILED: 1, STALE: 3 } as const;

export interface ScrapeOptions {
  root: string;
  source: ScraperId;
  slot: Slot;
  trigger: Trigger;
  out: string;
  runId: string;
  userAgent: string;
  now?: Date;
  /** Untuk uji: ganti modul sumber dari registry. */
  scraper?: SourceScraper;
  pauseMs?: number;
  retryDelayMs?: number;
}

const rawExtension = (raw: RawPayload): RawExtension =>
  raw.contentType === 'text/html' ? 'html' : 'json';

export async function scrape(opts: ScrapeOptions): Promise<ScrapeRun> {
  const now = opts.now ?? new Date();
  const startedAt = utcIso(now);
  const today = jakartaDate(now);
  const [config, status] = await Promise.all([loadConfig(opts.root), loadStatus(opts.root)]);
  const sourceConfig = config.sources.find((s) => s.id === opts.source);
  if (!sourceConfig) throw new Error(`sumber ${opts.source} tidak ada di config/sources.yml`);
  const scraper = opts.scraper ?? getScraper(opts.source);
  if (!scraper) throw new Error(`modul scraper ${opts.source} belum diimplementasikan`);
  if (scraper.kind !== 'prices') throw new Error(`scrape sumber makro belum didukung (Fase 2)`);
  const source = PriceSource.parse(opts.source);
  const expectedDay = isExpectedDay(sourceConfig.update_calendar, today, config.holidays);

  await mkdir(opts.out, { recursive: true });
  let raw: RawPayload | null = null;
  let rawMeta: ScrapeRun['raw'] = null;
  let parsed: ParseResult<PriceRow> | null = null;
  let failure: { code: ErrorCode; message: string } | null = null;
  let staleReason: string | null = null;
  let rows: Candidate[] = [];
  let held: HeldBatch[] = [];

  try {
    raw = await scraper.fetchRaw({
      root: opts.root,
      config: sourceConfig,
      runId: opts.runId,
      userAgent: opts.userAgent,
      now,
      pauseMs: opts.pauseMs,
      retryDelayMs: opts.retryDelayMs,
    });
  } catch (err) {
    failure = { code: errorCodeOf(err), message: errorMessageOf(err) };
  }

  if (raw) {
    const ext = rawExtension(raw);
    const file = `raw.${ext}.gz`;
    await writeFile(path.join(opts.out, file), gzipSync(raw.body));
    rawMeta = { file, ext, fetched_at: raw.fetchedAt, sha256: sha256(raw.body) };
    try {
      parsed = scraper.parse(raw) as ParseResult<PriceRow>;
    } catch (err) {
      const code = err instanceof ScrapeError ? err.code : 'PARSE_ERROR';
      failure = { code, message: errorMessageOf(err) };
    }
  }

  if (parsed) {
    const result = validate({
      source,
      parsed,
      catalog: config.catalog,
      existing: await readPrices(opts.root, source),
      today,
    });
    if (result.outcome === 'failed') {
      failure = { code: result.error_code, message: result.error_message };
    } else if (result.outcome === 'stale') {
      staleReason = result.reason;
    } else {
      rows = result.rows;
      held = result.held;
    }
  }

  const rowsParsed = parsed?.rows.length ?? 0;
  const rowsHeld = held.reduce((n, b) => n + b.rows.length, 0);
  const runStatus = failure
    ? 'failed'
    : staleReason
      ? 'stale'
      : rowsHeld > 0
        ? 'partial'
        : 'success';
  const exitCode =
    runStatus === 'failed'
      ? SCRAPE_EXIT.FAILED
      : runStatus === 'stale' && expectedDay && sourceConfig.stale_is_error_on_expected_day
        ? SCRAPE_EXIT.STALE
        : SCRAPE_EXIT.OK;

  const run: ScrapeRun = {
    run_id: opts.runId,
    source: opts.source,
    workflow: sourceConfig.workflow,
    trigger: opts.trigger,
    slot: opts.slot,
    started_at: startedAt,
    finished_at: utcIso(opts.now ?? new Date()),
    status: runStatus,
    error_code: failure?.code ?? null,
    error_message: failure?.message ?? staleReason,
    data_date: parsed?.dataDate ?? null,
    rows_parsed: rowsParsed,
    rows_held: rowsHeld,
    rows_rejected: rowsParsed - rows.length - rowsHeld,
    parser_version: scraper.parserVersion,
    expected_day: expectedDay,
    exit_code: exitCode,
    raw: rawMeta,
  };
  if (parsed?.historyPoints !== undefined) run.history_points = parsed.historyPoints;

  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  await Promise.all([
    writeFile(path.join(opts.out, ARTIFACT_FILES.run), json(run)),
    writeFile(path.join(opts.out, ARTIFACT_FILES.rows), json(rows)),
    writeFile(path.join(opts.out, ARTIFACT_FILES.held), json(held)),
  ]);
  return run;
}

/** Ringkasan satu baris untuk log job. */
export function describeRun(run: ScrapeRun): string {
  const head = `${run.source}: ${run.status}${run.error_code ? ` (${run.error_code})` : ''} · data_date ${run.data_date ?? '-'} · ${run.rows_parsed} baris, ${run.rows_held} ditahan`;
  return run.error_message ? `${head}\n  ${run.error_message}` : head;
}
