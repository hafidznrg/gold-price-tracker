import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Series } from '@gold/schema';
import { LATEST_PATH, META_PATH, macroJsonPath, seriesJsonPath } from './paths';
import type { LatestFile, MacroFile, MetaFile, SeriesFile } from './types';

// Loader build-time (server component saat static export): baca public/data/ hasil prebuild.
// Jangan diimpor dari komponen klien ('use client') — memakai node:fs.

/** `next build` dijalankan dengan cwd = apps/web. `GOLD_WEB_DATA_DIR` untuk menimpa. */
export function publicDataDir(): string {
  return process.env.GOLD_WEB_DATA_DIR ?? path.join(process.cwd(), 'public', 'data');
}

function readJson<T>(rel: string): T {
  const file = path.join(publicDataDir(), rel);
  if (!existsSync(file)) {
    throw new Error(`${file} belum ada — jalankan \`pnpm --filter web prebuild\` dulu`);
  }
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function readLatest(): LatestFile {
  return readJson<LatestFile>(LATEST_PATH);
}

export function readMeta(): MetaFile {
  return readJson<MetaFile>(META_PATH);
}

export function readSeriesFile(file: string): SeriesFile {
  return readJson<SeriesFile>(seriesJsonPath(file));
}

/** null bila seri makro belum ada datanya. */
export function readMacroFile(series: Series): MacroFile | null {
  const rel = macroJsonPath(series);
  return existsSync(path.join(publicDataDir(), rel)) ? readJson<MacroFile>(rel) : null;
}
