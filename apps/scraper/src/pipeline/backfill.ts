import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { utcIso, type ErrorCode, type PriceRow } from '@gold/schema';
import type { BackfillJob } from '../backfill/types';
import { loadConfig } from '../config';
import type { ParseResult, RawPayload } from '../sources/types';
import { ARTIFACT_FILES, type RawExtension, type ScrapeRun } from './artifact';
import { errorCodeOf, errorMessageOf, ScrapeError } from './errors';
import { sha256 } from './store';
import type { Candidate } from './upsert';
import { validateBackfill, type HeldBatch } from './validate';

// Job backfill (WORKFLOWS §3.4): fetch → parse → saring rentang → validasi backfill, lalu tulis
// artifact dengan kontrak yang sama seperti scrape (§2.1) agar `merge --origin backfill`
// memakainya. Tidak pernah menulis ke data/. Kode keluar: 0 sukses/partial, 1 gagal.

export interface BackfillOptions {
  root: string;
  job: BackfillJob;
  out: string;
  runId: string;
  userAgent: string;
  from?: string;
  to?: string;
  now?: Date;
  pauseMs?: number;
  retryDelayMs?: number;
}

const rawExtension = (raw: RawPayload): RawExtension =>
  raw.contentType === 'text/html' ? 'html' : 'json';

const inRange = (date: string, from?: string, to?: string) =>
  (!from || date >= from) && (!to || date <= to);

export async function backfill(opts: BackfillOptions): Promise<ScrapeRun> {
  const now = opts.now ?? new Date();
  const config = await loadConfig(opts.root);
  const { job } = opts;

  await mkdir(opts.out, { recursive: true });
  let raw: RawPayload | null = null;
  let rawMeta: ScrapeRun['raw'] = null;
  let parsed: ParseResult<PriceRow> | null = null;
  let failure: { code: ErrorCode; message: string } | null = null;
  let rows: Candidate[] = [];
  let held: HeldBatch[] = [];

  try {
    raw = await job.fetchRaw({
      root: opts.root,
      runId: opts.runId,
      userAgent: opts.userAgent,
      now,
      from: opts.from,
      to: opts.to,
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
      parsed = job.parse(raw);
    } catch (err) {
      const code = err instanceof ScrapeError ? err.code : 'PARSE_ERROR';
      failure = { code, message: errorMessageOf(err) };
    }
  }

  if (parsed) {
    const selected = parsed.rows.filter((r) => inRange(r.date, opts.from, opts.to));
    const result = validateBackfill(selected, config.catalog);
    if (result.outcome === 'failed') {
      failure = { code: result.error_code, message: result.error_message };
    } else if (result.outcome === 'ok') {
      rows = result.rows;
      held = result.held;
    }
  }

  const rowsParsed = parsed?.rows.length ?? 0;
  const rowsHeld = held.reduce((n, b) => n + b.rows.length, 0);
  const status = failure ? 'failed' : rowsHeld > 0 ? 'partial' : 'success';
  const dates = [...rows, ...held.flatMap((b) => b.rows)].map((r) => r.date).sort();

  const run: ScrapeRun = {
    run_id: opts.runId,
    source: job.source,
    workflow: 'backfill',
    trigger: 'workflow_dispatch',
    slot: 'backfill',
    started_at: utcIso(now),
    finished_at: utcIso(opts.now ?? new Date()),
    status,
    error_code: failure?.code ?? null,
    error_message: failure?.message ?? null,
    data_date: dates.at(-1) ?? null,
    rows_parsed: rowsParsed,
    rows_held: rowsHeld,
    // Baris di luar rentang dan baris yang tidak ditulis karena gagal dihitung ditolak.
    rows_rejected: rowsParsed - rows.length - rowsHeld,
    parser_version: job.parserVersion,
    expected_day: false,
    exit_code: status === 'failed' ? 1 : 0,
    raw: rawMeta,
  };

  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
  await Promise.all([
    writeFile(path.join(opts.out, ARTIFACT_FILES.run), json(run)),
    writeFile(path.join(opts.out, ARTIFACT_FILES.rows), json(rows)),
    writeFile(path.join(opts.out, ARTIFACT_FILES.held), json(held)),
  ]);
  return run;
}

/** Ringkasan satu baris untuk log job. */
export function describeBackfill(run: ScrapeRun, from?: string, to?: string): string {
  const range = from || to ? ` · rentang ${from ?? '…'}–${to ?? '…'}` : '';
  const head = `${run.source} (backfill): ${run.status}${run.error_code ? ` (${run.error_code})` : ''}${range} · ${run.rows_parsed} baris, ${run.rows_held} ditahan, ${run.rows_rejected} ditolak/di luar rentang`;
  return run.error_message ? `${head}\n  ${run.error_message}` : head;
}
