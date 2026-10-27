import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  jakartaDate,
  priceRowKey,
  PriceRow,
  PriceSource,
  QuarantineBatch,
  RunRecord,
  utcIso,
  type ErrorCode,
  type Origin,
  type Revision,
  type RunStatus,
  type ScraperId,
  type Slot,
  type SourceStatusEntry,
  type SourceStatusFile,
  type Trigger,
  type Workflow,
} from '@gold/schema';
import { ARTIFACT_FILES, readArtifact, type Artifact, type ScrapeRun } from './artifact';
import {
  absolute,
  appendRevisions,
  lastRawSha,
  PATHS,
  rawPath,
  readPrices,
  readStatusFile,
  sha256,
  appendRuns,
  writeFileAtomic,
  writePrices,
  writeStatusFile,
} from './store';
import { cell, classify, indexByKey, type Candidate } from './upsert';

// DATA-MODEL §5 — job merge: upsert CSV, raw delta (dedupe sha256), karantina, RUN, REVISION,
// status.json, lalu summary.json + pesan commit untuk job commit & notify (WORKFLOWS §2.1).

export interface MergeOptions {
  root: string;
  /** Folder berisi satu subfolder artifact per sumber (`out/out-{source}/` atau `out/{source}/`). */
  inDir: string;
  /** Sumber dari `plan`; yang artifact-nya hilang dicatat `failed/UNKNOWN`. */
  expected: readonly ScraperId[];
  runId: string;
  origin: Origin;
  dryRun: boolean;
  now?: Date;
  /** Tanggal Jakarta sasaran dari `plan` untuk pesan commit (D-27); kosong = tanggal `now`. */
  date?: string;
  /** Konteks untuk RUN sintetis bila artifact hilang. */
  fallback?: { workflow: Workflow; trigger: Trigger };
}

export interface SourceResult {
  source: ScraperId;
  status: RunStatus;
  error_code: ErrorCode | null;
  error_message: string | null;
  data_date: string | null;
  slot: Slot;
  expected_day: boolean;
  exit_code: number;
  rows_inserted: number;
  rows_updated: number;
  rows_unchanged: number;
  rows_held: number;
  rows_rejected: number;
  revisions: number;
  quarantine_paths: string[];
  consecutive_failures: number;
}

export interface MergeSummary {
  run_id: string;
  merged_at: string;
  dry_run: boolean;
  merge_ok: boolean;
  commit_message: string;
  /** Path relatif root yang berubah (atau akan berubah bila `dry_run`). */
  changed_paths: string[];
  results: SourceResult[];
}

async function findArtifacts(inDir: string): Promise<Artifact[]> {
  const entries = await readdir(inDir, { withFileTypes: true }).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  });
  const artifacts: Artifact[] = [];
  for (const e of entries
    .filter((x) => x.isDirectory())
    .sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const dir = path.join(inDir, e.name);
    const files = await readdir(dir);
    if (files.includes(ARTIFACT_FILES.run)) artifacts.push(await readArtifact(dir));
  }
  const seen = new Set<string>();
  for (const a of artifacts) {
    if (seen.has(a.run.source)) throw new Error(`artifact ganda untuk sumber ${a.run.source}`);
    seen.add(a.run.source);
  }
  return artifacts;
}

/** RUN untuk sumber yang job scrape-nya mati sebelum mengunggah artifact (WORKFLOWS §2.1). */
function missingRun(source: ScraperId, opts: MergeOptions, slot: Slot, now: string): ScrapeRun {
  return {
    run_id: opts.runId,
    source,
    workflow: opts.fallback?.workflow ?? 'scrape-retail',
    trigger: opts.fallback?.trigger ?? 'workflow_dispatch',
    slot,
    started_at: now,
    finished_at: now,
    status: 'failed',
    error_code: 'UNKNOWN',
    error_message: 'artifact out-{source} tidak ada: job scrape berhenti sebelum mengunggah hasil',
    data_date: null,
    rows_parsed: 0,
    rows_held: 0,
    rows_rejected: 0,
    parser_version: 'unknown',
    expected_day: true,
    exit_code: 1,
    raw: null,
  };
}

const complete = (row: Candidate, scrapedAt: string, runId: string, origin: Origin): PriceRow =>
  PriceRow.parse({ ...row, scraped_at: scrapedAt, run_id: runId, origin });

function nextStatus(
  prev: SourceStatusEntry | undefined,
  run: RunRecord,
  historyPoints: number | undefined,
  now: string,
): SourceStatusEntry {
  const ok = run.status === 'success' || run.status === 'partial';
  const lastDataDate =
    ok && run.data_date && (!prev?.last_data_date || run.data_date > prev.last_data_date)
      ? run.data_date
      : (prev?.last_data_date ?? null);
  const entry: SourceStatusEntry = {
    last_run_id: run.run_id,
    last_status: run.status,
    last_success_at: ok ? run.finished_at : (prev?.last_success_at ?? null),
    last_data_date: lastDataDate,
    consecutive_failures:
      run.status === 'failed'
        ? (prev?.consecutive_failures ?? 0) + 1
        : ok
          ? 0
          : (prev?.consecutive_failures ?? 0),
    updated_at: now,
  };
  const points = ok && historyPoints !== undefined ? historyPoints : prev?.history_points;
  if (points !== undefined) entry.history_points = points;
  return entry;
}

function quarantineFile(dataDate: string, runId: string, reason: string, many: boolean) {
  return `${dataDate}-${runId}${many ? `-${reason.toLowerCase()}` : ''}.json`;
}

const SYMBOL: Record<RunStatus, string> = {
  success: '✓',
  partial: '⚠',
  stale: '…',
  failed: '✗',
  skipped: '–',
};

export function commitMessage(date: string, results: readonly SourceResult[]): string {
  const parts = results.map((r) => {
    const counts =
      r.status === 'success' || r.status === 'partial'
        ? ` +${r.rows_inserted} ~${r.rows_updated}${r.rows_held ? ` !${r.rows_held}` : ''}`
        : '';
    return `${r.source}${SYMBOL[r.status]}${counts}`;
  });
  return `data: ${date} ${parts.join(' ')}`.trimEnd();
}

export async function merge(opts: MergeOptions): Promise<MergeSummary> {
  const now = opts.now ?? new Date();
  const nowIso = utcIso(now);
  const today = opts.date ?? jakartaDate(now);
  const artifacts = await findArtifacts(opts.inDir);
  const slot = artifacts[0]?.run.slot ?? 'manual';
  const present = new Set(artifacts.map((a) => a.run.source));
  const items: { run: ScrapeRun; artifact: Artifact | null }[] = [
    ...artifacts.map((a) => ({ run: a.run, artifact: a })),
    ...opts.expected
      .filter((s) => !present.has(s))
      .map((s) => ({ run: missingRun(s, opts, slot, nowIso), artifact: null })),
  ].sort((a, b) => (a.run.source < b.run.source ? -1 : 1));

  const status: SourceStatusFile = await readStatusFile(opts.root);
  const changed = new Set<string>();
  const runs: RunRecord[] = [];
  const revisions: Revision[] = [];
  const results: SourceResult[] = [];
  const writes: (() => Promise<void>)[] = [];
  const later = (fn: () => Promise<void>) => writes.push(fn);

  for (const { run, artifact } of items) {
    // Raw ditulis untuk semua status, kecuali isinya sama dengan snapshot terakhir (DATA-MODEL §5).
    const rawPaths: string[] = [];
    if (artifact && run.raw) {
      const gz = await readFile(path.join(artifact.dir, run.raw.file));
      if (sha256(gunzipSync(gz)) !== run.raw.sha256) {
        throw new Error(`${run.source}: sha256 ${run.raw.file} tidak cocok dengan run.json`);
      }
      if ((await lastRawSha(opts.root, run.source)) !== run.raw.sha256) {
        const target = rawPath(run.source, run.raw.fetched_at, run.raw.sha256, run.raw.ext);
        rawPaths.push(target);
        later(() => writeFileAtomic(absolute(opts.root, target), gz));
      }
    }

    const revisionsBefore = revisions.length;
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let held = 0;
    const quarantinePaths: string[] = [];
    let runStatus = run.status;
    const writesData = artifact && (run.status === 'success' || run.status === 'partial');

    if (writesData) {
      const source = PriceSource.parse(run.source);
      const existing = await readPrices(opts.root, source);
      const index = indexByKey(existing);
      const touchedYears = new Set<string>();
      for (const row of artifact.rows) {
        const c = classify(index, row);
        if (c.kind === 'unchanged') {
          unchanged++;
          continue;
        }
        const next = complete(row, nowIso, opts.runId, opts.origin);
        index.set(priceRowKey(next), next);
        touchedYears.add(next.date.slice(0, 4));
        if (c.kind === 'insert') {
          inserted++;
          continue;
        }
        updated++;
        for (const field of c.changed) {
          revisions.push({
            table: 'price',
            row_key: priceRowKey(next),
            field,
            old_value: cell(c.current[field]),
            new_value: cell(next[field]),
            run_id: opts.runId,
            revised_at: nowIso,
            reason: 'source_changed',
          });
        }
      }
      if (touchedYears.size > 0) {
        const all = [...index.values()];
        for (const y of touchedYears) changed.add(PATHS.prices(source, y));
        later(async () => {
          await writePrices(opts.root, source, all, touchedYears);
        });
      }

      const many = artifact.held.length > 1;
      for (const batch of artifact.held) {
        const file = PATHS.quarantine(
          run.source,
          quarantineFile(run.data_date ?? today, opts.runId, batch.reason_code, many),
        );
        const body = QuarantineBatch.parse({
          run_id: opts.runId,
          source: run.source,
          reason_code: batch.reason_code,
          rows: batch.rows.map((r) => complete(r, nowIso, opts.runId, opts.origin)),
          decision: 'pending',
        });
        held += batch.rows.length;
        quarantinePaths.push(file);
        changed.add(file);
        later(() =>
          writeFileAtomic(absolute(opts.root, file), JSON.stringify(body, null, 2) + '\n'),
        );
      }
      runStatus = held > 0 ? 'partial' : 'success';
    }

    const rejected = writesData ? run.rows_rejected : run.rows_parsed;
    const record = RunRecord.parse({
      run_id: run.run_id,
      source: run.source,
      workflow: run.workflow,
      trigger: run.trigger,
      slot: run.slot,
      started_at: run.started_at,
      finished_at: run.finished_at,
      status: runStatus,
      error_code: run.error_code,
      error_message: run.error_message,
      data_date: run.data_date,
      rows_parsed: inserted + updated + unchanged + held + rejected,
      rows_inserted: inserted,
      rows_updated: updated,
      rows_unchanged: unchanged,
      rows_held: held,
      rows_rejected: rejected,
      raw_paths: rawPaths,
      parser_version: run.parser_version,
    });
    runs.push(record);
    rawPaths.forEach((p) => changed.add(p));
    status[run.source] = nextStatus(status[run.source], record, run.history_points, nowIso);

    results.push({
      source: run.source,
      status: record.status,
      error_code: record.error_code,
      error_message: record.error_message,
      data_date: record.data_date,
      slot: record.slot,
      expected_day: run.expected_day,
      exit_code: run.exit_code,
      rows_inserted: inserted,
      rows_updated: updated,
      rows_unchanged: unchanged,
      rows_held: held,
      rows_rejected: rejected,
      revisions: revisions.length - revisionsBefore,
      quarantine_paths: quarantinePaths,
      consecutive_failures: status[run.source]!.consecutive_failures,
    });
  }

  if (!opts.dryRun) {
    for (const write of writes) await write();
    if (runs.length > 0) {
      const byYear = new Map<string, RunRecord[]>();
      for (const r of runs) {
        const y = jakartaDate(new Date(r.started_at)).slice(0, 4);
        byYear.set(y, [...(byYear.get(y) ?? []), r]);
      }
      for (const [y, records] of byYear) await appendRuns(opts.root, y, records);
      await appendRevisions(opts.root, today.slice(0, 4), revisions);
      await writeStatusFile(opts.root, status);
    }
  }
  if (runs.length > 0) {
    changed.add(PATHS.runs(today.slice(0, 4)));
    changed.add(PATHS.status);
    if (revisions.length > 0) changed.add(PATHS.revisions(today.slice(0, 4)));
  }

  return {
    run_id: opts.runId,
    merged_at: nowIso,
    dry_run: opts.dryRun,
    merge_ok: true,
    commit_message: commitMessage(today, results),
    changed_paths: [...changed].sort(),
    results,
  };
}
