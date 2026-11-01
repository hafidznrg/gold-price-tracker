import type { Series } from '@gold/schema';
import { LATEST_PATH, META_PATH, dataUrl, macroJsonPath, seriesJsonPath } from './paths';
import type { LatestFile, MacroFile, MetaFile, SeriesFile } from './types';

// Loader klien: fetch dari /data/... (static export). Hasil di-cache per path selama sesi;
// permintaan yang gagal dihapus dari cache agar bisa dicoba lagi.

const cache = new Map<string, Promise<unknown>>();

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(dataUrl(path), init);
  if (!res.ok) throw new Error(`Gagal memuat ${dataUrl(path)}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function cached<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetchJson<T>(path).catch((err: unknown) => {
      cache.delete(path);
      throw err;
    });
    cache.set(path, p);
  }
  return p;
}

export function fetchLatest(): Promise<LatestFile> {
  return cached<LatestFile>(LATEST_PATH);
}

export function fetchMeta(): Promise<MetaFile> {
  return cached<MetaFile>(META_PATH);
}

/** `file` = id file series, mis. `logammulia-antam` (lihat `seriesFileId`). */
export function fetchSeries(file: string): Promise<SeriesFile> {
  return cached<SeriesFile>(seriesJsonPath(file));
}

/** Seri makro; null bila belum ada data (HTTP 404). */
export async function fetchMacro(series: Series): Promise<MacroFile | null> {
  try {
    return await cached<MacroFile>(macroJsonPath(series));
  } catch (err) {
    if (err instanceof Error && err.message.includes('HTTP 404')) return null;
    throw err;
  }
}

/** Untuk uji: kosongkan cache. */
export function clearDataCache(): void {
  cache.clear();
}
