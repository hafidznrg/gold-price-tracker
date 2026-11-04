import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  readMacroCsv,
  readPriceCsv,
  RunRecord,
  SourceStatusFile,
  SpotSnapshot,
  writeMacroCsv,
  writePriceCsv,
  type MacroRow,
  type PriceRow,
  type PriceSource,
  type Revision,
  type ScraperId,
  type Series,
} from '@gold/schema';

// Tata letak `data/` (DATA-MODEL §1). Semua path yang dicatat di data (RUN.raw_paths,
// summary) relatif terhadap root repo dengan pemisah `/`.

export const rel = (...parts: string[]) => parts.join('/');
export const absolute = (root: string, relative: string) => path.join(root, ...relative.split('/'));

export const PATHS = {
  prices: (source: PriceSource, year: string) => rel('data', 'prices', source, `${year}.csv`),
  pricesDir: (source: PriceSource) => rel('data', 'prices', source),
  macro: (series: Series) => rel('data', 'macro', `${series}.csv`),
  spot: rel('data', 'macro', 'spot.json'),
  runs: (year: string) => rel('data', 'meta', 'runs', `${year}.jsonl`),
  revisions: (year: string) => rel('data', 'meta', 'revisions', `${year}.jsonl`),
  status: rel('data', 'meta', 'status.json'),
  rawDir: (source: ScraperId) => rel('data', 'raw', source),
  quarantine: (source: ScraperId, file: string) => rel('data', 'quarantine', source, file),
  resolved: (file: string) => rel('data', 'quarantine', '_resolved', file),
};

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** Tulis file (buat folder induk); `.tmp` + rename agar file tidak pernah setengah tertulis. */
export async function writeFileAtomic(file: string, content: string | Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

export const sha256 = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');

// ── PRICE_OBSERVATION ───────────────────────────────────────────────────────

/** Semua baris harga satu sumber (semua partisi tahun). */
export async function readPrices(root: string, source: PriceSource): Promise<PriceRow[]> {
  const dir = absolute(root, PATHS.pricesDir(source));
  const files = (await listDir(dir)).filter((f) => /^\d{4}\.csv$/.test(f));
  const parts = await Promise.all(
    files.map(async (f) => {
      try {
        return readPriceCsv(await readFile(path.join(dir, f), 'utf8'));
      } catch (err) {
        throw new Error(`${PATHS.prices(source, f.slice(0, 4))}: ${(err as Error).message}`);
      }
    }),
  );
  return parts.flat();
}

/** Tulis ulang partisi tahun yang disebut `years`; baris lain dibiarkan. */
export async function writePrices(
  root: string,
  source: PriceSource,
  rows: readonly PriceRow[],
  years: Iterable<string>,
): Promise<string[]> {
  const written: string[] = [];
  for (const year of [...new Set(years)].sort()) {
    const file = PATHS.prices(source, year);
    const content = writePriceCsv(rows.filter((r) => r.date.startsWith(`${year}-`)));
    if ((await readText(absolute(root, file))) === content) continue;
    await writeFileAtomic(absolute(root, file), content);
    written.push(file);
  }
  return written;
}

// ── MACRO_OBSERVATION, SPOT_SNAPSHOT ────────────────────────────────────────

/** Semua baris satu seri makro (satu file, tanpa partisi tahun). */
export async function readMacro(root: string, series: Series): Promise<MacroRow[]> {
  const text = await readText(absolute(root, PATHS.macro(series)));
  if (text === null) return [];
  try {
    return readMacroCsv(text);
  } catch (err) {
    throw new Error(`${PATHS.macro(series)}: ${(err as Error).message}`);
  }
}

/** Tulis ulang `data/macro/{series}.csv` (terurut menurut kunci); false bila isinya sama. */
export async function writeMacro(
  root: string,
  series: Series,
  rows: readonly MacroRow[],
): Promise<boolean> {
  const file = PATHS.macro(series);
  const content = writeMacroCsv(rows.filter((r) => r.series === series));
  if ((await readText(absolute(root, file))) === content) return false;
  await writeFileAtomic(absolute(root, file), content);
  return true;
}

/** Tulis `data/macro/spot.json` (ditimpa setiap run makro yang membawa spot). */
export async function writeSpot(root: string, spot: SpotSnapshot): Promise<void> {
  const body = SpotSnapshot.parse(spot);
  await writeFileAtomic(absolute(root, PATHS.spot), JSON.stringify(body, null, 2) + '\n');
}

// ── RUN, REVISION (jsonl) ───────────────────────────────────────────────────

const jsonl = (records: readonly unknown[]) =>
  records.map((r) => JSON.stringify(r) + '\n').join('');

/**
 * Tambah RUN. Baris dengan `run_id` + `source` yang sudah tercatat dipertahankan: merge ulang
 * artifact yang sama tidak menggandakan RUN dan tidak menimpa hitungan merge pertama.
 */
export async function appendRuns(root: string, year: string, records: readonly RunRecord[]) {
  const file = absolute(root, PATHS.runs(year));
  const text = (await readText(file)) ?? '';
  const key = (r: Pick<RunRecord, 'run_id' | 'source'>) => `${r.run_id}|${r.source}`;
  const seen = new Set(
    text
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => key(RunRecord.parse(JSON.parse(l)))),
  );
  const fresh = records.filter((r) => !seen.has(key(r)));
  if (fresh.length > 0) await writeFileAtomic(file, text + jsonl(fresh));
}

export async function appendRevisions(root: string, year: string, records: readonly Revision[]) {
  if (records.length === 0) return;
  const file = absolute(root, PATHS.revisions(year));
  await writeFileAtomic(file, ((await readText(file)) ?? '') + jsonl(records));
}

// ── SOURCE_STATUS ───────────────────────────────────────────────────────────

export async function readStatusFile(root: string): Promise<SourceStatusFile> {
  const text = await readText(absolute(root, PATHS.status));
  return text === null ? {} : SourceStatusFile.parse(JSON.parse(text));
}

export async function writeStatusFile(root: string, status: SourceStatusFile) {
  const sorted = Object.fromEntries(Object.entries(status).sort(([a], [b]) => (a < b ? -1 : 1)));
  await writeFileAtomic(absolute(root, PATHS.status), JSON.stringify(sorted, null, 2) + '\n');
}

// ── RAW_SNAPSHOT ────────────────────────────────────────────────────────────

/** `2026-10-26T03:31:40Z` → `data/raw/{source}/2026-10/2026-10-26T033140Z-{sha8}.{ext}.gz` */
export function rawPath(source: ScraperId, fetchedAt: string, sha: string, ext: string): string {
  const stamp = fetchedAt.replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '');
  return rel(PATHS.rawDir(source), fetchedAt.slice(0, 7), `${stamp}-${sha.slice(0, 8)}.${ext}.gz`);
}

/** sha256 isi snapshot mentah terakhir sumber ini, atau `null` bila belum ada. */
export async function lastRawSha(root: string, source: ScraperId): Promise<string | null> {
  const dir = absolute(root, PATHS.rawDir(source));
  for (const month of (await listDir(dir)).reverse()) {
    const files = (await listDir(path.join(dir, month))).filter((f) => f.endsWith('.gz'));
    const last = files.at(-1);
    if (last) return sha256(gunzipSync(await readFile(path.join(dir, month, last))));
  }
  return null;
}
