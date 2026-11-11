import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  jakartaDate,
  PriceSource,
  SpotSnapshot,
  utcIso,
  type ErrorCode,
  type MacroRow,
  type PriceRow,
  type ScraperId,
  type Series,
  type Slot,
  type Trigger,
} from '@gold/schema';
import { loadConfig } from '../config';
import { getScraper } from '../sources';
import type { ParseResult, RawPayload, SourceScraper } from '../sources/types';
import { ARTIFACT_FILES, rawBytes, rawExtension, type ScrapeRun } from './artifact';
import { isExpectedDay } from './calendar';
import { errorCodeOf, errorMessageOf, ScrapeError } from './errors';
import { readMacro, readPrices, sha256 } from './store';
import type { MacroCandidate } from './upsert';
import { validate, validateMacro } from './validate';

// Job scrape (WORKFLOWS §2): fetch → parse → validasi satu sumber, lalu tulis artifact
// `out-{source}` (§2.1). Tidak pernah menulis ke data/. Kode keluar sesuai §2.3. Sumber makro
// (`kind: 'macro'`, §3.3) menghasilkan artifact `run.kind = 'macro'`: V-01, V-08/V-09, V-11
// (`validateMacro`); xaus juga membawa `spot.json`. Tidak ada status `stale` untuk makro.

export const SCRAPE_EXIT = { OK: 0, FAILED: 1, STALE: 3 } as const;

export interface ScrapeOptions {
  root: string;
  source: ScraperId;
  slot: Slot;
  trigger: Trigger;
  out: string;
  runId: string;
  /** Tanggal Jakarta sasaran dari `plan` (D-27); kosong = tanggal `now`. */
  date?: string;
  userAgent: string;
  now?: Date;
  /** Untuk uji: ganti modul sumber dari registry. */
  scraper?: SourceScraper;
  pauseMs?: number;
  retryDelayMs?: number;
}

const SPOT_SERIES = ['usd_idr_jisdor', 'usd_idr_ecb'] as const satisfies readonly Series[];

/** Kurs USD/IDR terbaru di data/macro: tanggal terbaru menang, JISDOR menang bila sama. */
async function latestUsdIdr(root: string): Promise<MacroRow | null> {
  let best: MacroRow | null = null;
  for (const series of SPOT_SERIES) {
    const last = (await readMacro(root, series)).filter((r) => r.frequency === 'D').at(-1);
    if (last && (!best || last.date > best.date)) best = last;
  }
  return best;
}

/**
 * D-41: run terjadwal yang terlambat sampai lewat tengah malam WIB (D-27), dan sumber sudah
 * menampilkan tanggal sesudah tanggal sasaran. Snapshot tanggal sasaran tidak bisa diambil lagi,
 * jadi `stale` ini dicatat sebagai slot terlewat (kode 0, tanpa alarm), bukan kegagalan sumber.
 */
export function missedSlot(dataDate: string | null | undefined, target: string, now: Date) {
  return !!dataDate && dataDate > target && jakartaDate(now) > target;
}

export async function scrape(opts: ScrapeOptions): Promise<ScrapeRun> {
  const now = opts.now ?? new Date();
  const startedAt = utcIso(now);
  const today = opts.date ?? jakartaDate(now);
  const config = await loadConfig(opts.root);
  const sourceConfig = config.sources.find((s) => s.id === opts.source);
  if (!sourceConfig) throw new Error(`sumber ${opts.source} tidak ada di config/sources.yml`);
  const scraper = opts.scraper ?? getScraper(opts.source);
  if (!scraper) throw new Error(`modul scraper ${opts.source} belum diimplementasikan`);
  const macro = scraper.kind === 'macro';
  const expectedDay = isExpectedDay(sourceConfig.update_calendar, today, config.holidays);

  await mkdir(opts.out, { recursive: true });
  let raw: RawPayload | null = null;
  let rawMeta: ScrapeRun['raw'] = null;
  let parsed: ParseResult<PriceRow | MacroRow> | null = null;
  let failure: { code: ErrorCode; message: string } | null = null;
  let staleReason: string | null = null;
  let missed = false;
  let rows: unknown[] = [];
  let held: { rows: unknown[] }[] = [];
  let spot: SpotSnapshot | null = null;

  try {
    raw = await scraper.fetchRaw({
      root: opts.root,
      config: sourceConfig,
      runId: opts.runId,
      userAgent: opts.userAgent,
      now,
      date: today,
      pauseMs: opts.pauseMs,
      retryDelayMs: opts.retryDelayMs,
    });
  } catch (err) {
    failure = { code: errorCodeOf(err), message: errorMessageOf(err) };
  }

  if (raw) {
    const ext = rawExtension(raw);
    const file = `raw.${ext}.gz`;
    const bytes = rawBytes(raw);
    await writeFile(path.join(opts.out, file), gzipSync(bytes));
    rawMeta = { file, ext, fetched_at: raw.fetchedAt, sha256: sha256(bytes) };
    try {
      parsed = scraper.parse(raw);
    } catch (err) {
      const code = err instanceof ScrapeError ? err.code : 'PARSE_ERROR';
      failure = { code, message: errorMessageOf(err) };
    }
  }

  if (parsed && macro) {
    const candidates = parsed.rows as MacroCandidate[];
    const touched = [...new Set(candidates.map((r) => r.series))];
    const result = validateMacro({
      rows: candidates,
      existing: (await Promise.all(touched.map((s) => readMacro(opts.root, s)))).flat(),
      today,
    });
    if (result.outcome === 'failed') {
      failure = { code: result.error_code, message: result.error_message };
    } else {
      rows = result.rows;
      held = result.held;
      const usdIdr = parsed.spot ? await latestUsdIdr(opts.root) : null;
      if (parsed.spot && usdIdr) {
        spot = SpotSnapshot.parse({
          fetched_at: parsed.spot.fetched_at,
          xau_usd_oz: parsed.spot.xau_usd_oz,
          usd_idr: usdIdr.value,
          usd_idr_series: usdIdr.series,
          usd_idr_date: usdIdr.date,
          source: 'xaus',
          stale: parsed.spot.stale,
        });
      }
    }
  } else if (parsed) {
    const result = validate({
      source: PriceSource.parse(opts.source),
      parsed: parsed as ParseResult<PriceRow>,
      catalog: config.catalog,
      existing: await readPrices(opts.root, PriceSource.parse(opts.source)),
      today,
      acceptPreviousDay: sourceConfig.accept_previous_day,
      runDate: jakartaDate(now),
    });
    if (result.outcome === 'failed') {
      failure = { code: result.error_code, message: result.error_message };
    } else if (result.outcome === 'stale') {
      staleReason = result.reason;
      if (missedSlot(parsed.dataDate, today, now)) {
        missed = true;
        staleReason += ` · terlewat: run terlambat sampai ${jakartaDate(now)}, sumber sudah berganti tanggal (D-41)`;
      }
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
      : runStatus === 'stale' &&
          expectedDay &&
          !missed &&
          sourceConfig.stale_is_error_on_expected_day
        ? SCRAPE_EXIT.STALE
        : SCRAPE_EXIT.OK;

  const run: ScrapeRun = {
    run_id: opts.runId,
    source: opts.source,
    ...(macro ? { kind: 'macro' as const } : {}),
    workflow: sourceConfig.workflow,
    trigger: opts.trigger,
    slot: opts.slot,
    started_at: startedAt,
    finished_at: utcIso(opts.now ?? new Date()),
    status: runStatus,
    error_code: failure?.code ?? null,
    error_message: failure?.message ?? staleReason ?? parsed?.note ?? null,
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
    ...(spot ? [writeFile(path.join(opts.out, ARTIFACT_FILES.spot), json(spot))] : []),
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
