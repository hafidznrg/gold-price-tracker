import { readdir, readFile, unlink } from 'node:fs/promises';
import {
  jakartaDate,
  PriceRow,
  priceRowKey,
  PriceSource,
  QuarantineBatch,
  ScraperId,
  utcIso,
  type Revision,
} from '@gold/schema';
import { loadConfig } from '../config';
import type { IssueClient } from './notify';
import {
  absolute,
  appendRevisions,
  PATHS,
  readPrices,
  writeFileAtomic,
  writePrices,
} from './store';
import { cell, classify, indexByKey, PRICE_VALUE_FIELDS } from './upsert';
import { revalidateHeld } from './validate';

// WORKFLOWS §3.5 — putuskan satu batch karantina. `approve`: validasi ulang (kecuali aturan
// pemicu), upsert ke CSV, REVISION `quarantine_approved`. `reject`: tidak menulis baris.
// Keduanya memindahkan file ke `data/quarantine/_resolved/{source}/` dengan keputusan.

export type QuarantineDecisionInput = 'approve' | 'reject';

export class QuarantineError extends Error {}

export interface QuarantineOptions {
  root: string;
  /** Path relatif repo: `data/quarantine/{source}/{file}.json`. */
  path: string;
  decision: QuarantineDecisionInput;
  decidedBy: string;
  note?: string;
  /** Run yang memutuskan; dicatat di REVISION. */
  runId: string;
  now?: Date;
}

export interface QuarantineResult {
  source: ScraperId;
  file: string;
  resolved_path: string;
  decision: QuarantineDecisionInput;
  rows_inserted: number;
  rows_updated: number;
  rows_unchanged: number;
  revisions: number;
  /** File karantina lain sumber ini yang masih `pending`. */
  remaining: number;
  commit_message: string;
}

const PATH_RE = /^data\/quarantine\/([a-z0-9]+)\/([A-Za-z0-9._-]+\.json)$/;

/** Uraikan dan batasi `--path` ke folder karantina pending (tanpa `_resolved`, tanpa `..`). */
export function parseQuarantinePath(p: string): { source: ScraperId; file: string } {
  const m = PATH_RE.exec(p.trim().replace(/\\/g, '/'));
  const source = m ? ScraperId.safeParse(m[1]) : null;
  if (!m || !source?.success) {
    throw new QuarantineError(`--path harus data/quarantine/{source}/{file}.json: ${p}`);
  }
  return { source: source.data, file: m[2]! };
}

/** File `*.json` pending satu sumber. */
export async function pendingFiles(root: string, source: ScraperId): Promise<string[]> {
  try {
    const dir = absolute(root, PATHS.quarantine(source, ''));
    return (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function decideQuarantine(opts: QuarantineOptions): Promise<QuarantineResult> {
  const now = opts.now ?? new Date();
  const nowIso = utcIso(now);
  const { source, file } = parseQuarantinePath(opts.path);
  const rel = PATHS.quarantine(source, file);
  let text: string;
  try {
    text = await readFile(absolute(opts.root, rel), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new QuarantineError(`${rel} tidak ada (sudah diputuskan?)`);
    }
    throw err;
  }
  const batch = QuarantineBatch.parse(JSON.parse(text));
  if (batch.decision !== 'pending') {
    throw new QuarantineError(`${rel}: decision sudah ${batch.decision}`);
  }
  if (batch.source !== source) {
    throw new QuarantineError(`${rel}: source di file (${batch.source}) ≠ folder (${source})`);
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const revisions: Revision[] = [];

  if (opts.decision === 'approve') {
    const priceSource = PriceSource.safeParse(source);
    if (!priceSource.success) {
      throw new QuarantineError(`approve untuk sumber makro ${source} belum didukung (Fase 2)`);
    }
    const rows = batch.rows.map((r) => PriceRow.parse(r));
    const [config, existing] = await Promise.all([
      loadConfig(opts.root),
      readPrices(opts.root, priceSource.data),
    ]);
    const problems = revalidateHeld(batch.reason_code, rows, config.catalog, existing);
    if (problems.length > 0) {
      throw new QuarantineError(
        `${rel} tidak bisa disetujui:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      );
    }

    const index = indexByKey(existing);
    const years = new Set<string>();
    for (const row of rows) {
      const c = classify(index, row);
      if (c.kind === 'unchanged') {
        unchanged++;
        continue;
      }
      // Baris tetap membawa scraped_at/run_id run yang mengamatinya; persetujuan tercatat di
      // REVISION dan file _resolved.
      index.set(priceRowKey(row), row);
      years.add(row.date.slice(0, 4));
      if (c.kind === 'insert') inserted++;
      else updated++;
      const fields = c.kind === 'update' ? c.changed : PRICE_VALUE_FIELDS;
      for (const field of fields) {
        const oldValue = c.kind === 'update' ? cell(c.current[field]) : '';
        const newValue = cell(row[field]);
        if (oldValue === newValue) continue;
        revisions.push({
          table: 'price',
          row_key: priceRowKey(row),
          field,
          old_value: oldValue,
          new_value: newValue,
          run_id: opts.runId,
          revised_at: nowIso,
          reason: 'quarantine_approved',
        });
      }
    }
    if (years.size > 0) await writePrices(opts.root, priceSource.data, [...index.values()], years);
    await appendRevisions(opts.root, jakartaDate(now).slice(0, 4), revisions);
  }

  const resolved = QuarantineBatch.parse({
    ...batch,
    decision: opts.decision === 'approve' ? 'approved' : 'rejected',
    decided_at: nowIso,
    decided_by: opts.decidedBy,
    ...(opts.note ? { note: opts.note } : {}),
  });
  const resolvedPath = PATHS.resolved(`${source}/${file}`);
  await writeFileAtomic(
    absolute(opts.root, resolvedPath),
    JSON.stringify(resolved, null, 2) + '\n',
  );
  await unlink(absolute(opts.root, rel));

  const counts = opts.decision === 'approve' ? ` +${inserted} ~${updated}` : '';
  return {
    source,
    file,
    resolved_path: resolvedPath,
    decision: opts.decision,
    rows_inserted: inserted,
    rows_updated: updated,
    rows_unchanged: unchanged,
    revisions: revisions.length,
    remaining: (await pendingFiles(opts.root, source)).length,
    commit_message: `data: karantina ${opts.decision} ${source}/${file}${counts}`,
  };
}

/**
 * Langkah kedua workflow, setelah push berhasil: tutup Issue `quarantine` sumber itu bila
 * tidak ada batch pending lagi, selain itu berkomentar. Tidak ada Issue terbuka = tidak apa-apa.
 */
export async function resolveQuarantineIssue(
  client: IssueClient,
  opts: {
    source: ScraperId;
    file: string;
    decision: QuarantineDecisionInput;
    decidedBy: string;
    note?: string;
    remaining: number;
    runUrl: string;
  },
): Promise<'closed' | 'commented' | 'none'> {
  const open = await client.findOpen('quarantine', opts.source);
  if (!open) return 'none';
  const body = [
    `\`${opts.file}\`: **${opts.decision}** oleh @${opts.decidedBy}${opts.note ? ` — ${opts.note}` : ''}.`,
    opts.remaining > 0
      ? `\nMasih ada ${opts.remaining} batch pending untuk ${opts.source}.`
      : `\nTidak ada batch pending lagi untuk ${opts.source}.`,
    `\nRun: ${opts.runUrl}`,
  ].join('');
  if (opts.remaining > 0) {
    await client.comment(open.number, body);
    return 'commented';
  }
  await client.close(open.number, body);
  return 'closed';
}
