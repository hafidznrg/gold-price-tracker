import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { utcIso, type PriceRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { parse as parsePegadaian } from '../sources/pegadaian';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import type { PriceBackfillJob } from './types';

// P6-08 — histori Lotus Archi (brand opsional Pegadaian, P6-07) dari arsip raw Pegadaian
// (`data/raw/pegadaian/**/*.json.gz`, sejak Okt 2026). Job lokal: `--input` = folder arsip.
// Setiap snapshot di-parse ulang dengan parser Pegadaian terbaru; hanya baris `lotusarchi` yang
// ditulis. Raw bisa berupa respons tabel saja (lama) atau `{ table, savings }`.

type Row = ParsedRow<PriceRow>;

interface Snapshot {
  name: string;
  body: string;
}

const BRAND = 'lotusarchi';

async function listGz(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listGz(full)));
    else if (e.name.endsWith('.json.gz')) out.push(full);
  }
  return out;
}

/** Arsip hasil run job ini sendiri (kunci `snapshots` di tingkat atas) harus dilewati. */
function isMergedArchive(text: string): boolean {
  try {
    const json = JSON.parse(text) as unknown;
    return typeof json === 'object' && json !== null && 'snapshots' in json;
  } catch {
    return false;
  }
}

export function parseSnapshots(raw: RawPayload): ParseResult<PriceRow> {
  let snapshots: Snapshot[];
  try {
    snapshots = (JSON.parse(raw.body) as { snapshots: Snapshot[] }).snapshots;
    if (!Array.isArray(snapshots)) throw new Error('snapshots bukan array');
  } catch (err) {
    throw new ScrapeError('PARSE_ERROR', `arsip gabungan tidak valid: ${(err as Error).message}`);
  }

  let skipped = 0;
  // Kunci tanggal × gramasi → baris dengan `source_updated_at` terbesar.
  const best = new Map<string, Row>();
  for (const s of snapshots) {
    let rows: Row[];
    try {
      rows = parsePegadaian({
        body: s.body,
        contentType: 'application/json',
        fetchedAt: raw.fetchedAt,
      }).rows;
    } catch (err) {
      if (err instanceof ScrapeError) {
        skipped++;
        continue;
      }
      throw err;
    }
    for (const row of rows) {
      if (row.brand !== BRAND) continue;
      const key = `${row.date}|${row.weight_g}`;
      const prev = best.get(key);
      if (!prev || (row.source_updated_at ?? '') > (prev.source_updated_at ?? '')) {
        best.set(key, row);
      }
    }
  }

  const rows = [...best.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.weight_g - b.weight_g,
  );
  const dates = new Set(rows.map((r) => r.date));
  return {
    rows,
    dataDate: [...dates].sort().at(-1) ?? null,
    sourceUpdatedAt: null,
    stale: null,
    note: `${snapshots.length} snapshot dibaca, ${skipped} dilewati (gagal parse), ${rows.length} baris ${BRAND} di ${dates.size} tanggal`,
  };
}

/** Buang tanggal yang sudah punya baris `lotusarchi` (asal apa pun), pola D-28. */
export function selectUncoveredBrand(
  rows: ParsedRow<PriceRow>[],
  existing: readonly PriceRow[],
): ParsedRow<PriceRow>[] {
  const covered = new Set(existing.filter((r) => r.brand === BRAND).map((r) => r.date));
  return rows.filter((r) => !covered.has(r.date));
}

export const pegadaianRawBrand: PriceBackfillJob = {
  id: 'pegadaian-raw-brand',
  source: 'pegadaian',
  parserVersion: 'pegadaian-raw-brand@1.0.0',
  localOnly: true,
  async fetchRaw(ctx) {
    if (!ctx.input) {
      throw new ScrapeError(
        'FETCH_HTTP',
        '--input wajib: folder arsip raw, mis. data/raw/pegadaian',
      );
    }
    const snapshots: Snapshot[] = [];
    const files = (await listGz(ctx.input)).sort((a, b) =>
      path.basename(a).localeCompare(path.basename(b)),
    );
    for (const file of files) {
      let body: string;
      try {
        body = gunzipSync(await readFile(file)).toString('utf8');
      } catch (err) {
        throw new ScrapeError('PARSE_ERROR', `${file}: ${(err as Error).message}`);
      }
      if (isMergedArchive(body)) continue; // rerun-safe
      snapshots.push({ name: path.relative(ctx.input, file).split(path.sep).join('/'), body });
    }
    return {
      body: JSON.stringify({ snapshots }),
      contentType: 'application/json',
      fetchedAt: utcIso(),
    };
  },
  parse: parseSnapshots,
  select: selectUncoveredBrand,
};
