import type { Series } from '@gold/schema';

// Path file di public/data/, relatif terhadap akar data (`/data/` di situs).

export const DATA_BASE_URL = '/data';

export const LATEST_PATH = 'latest.json';
export const META_PATH = 'meta.json';

export function seriesJsonPath(file: string): string {
  return `series/${file}.json`;
}

export function seriesCsvPath(file: string): string {
  return `csv/${file}.csv`;
}

export function macroJsonPath(series: Series): string {
  return `macro/${series}.json`;
}

export function macroCsvPath(series: Series): string {
  return `csv/${series}.csv`;
}

/** URL publik untuk path relatif (`csv/x.csv` → `/data/csv/x.csv`). */
export function dataUrl(path: string): string {
  return `${DATA_BASE_URL}/${path}`;
}

export const GOLD_IDR_GRAM_PATH = 'derived/gold-idr-gram.json';
export const ANNUAL_PATH = 'derived/annual.json';
export const PREMIUM_ANTAM_PATH = 'derived/premium-antam.json';
