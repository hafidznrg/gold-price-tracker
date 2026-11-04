import type { MacroRow } from '@gold/schema';
import { worldbank as job, parsePinkSheet } from '../backfill/worldbank';
import type { ParseResult, SourceScraper } from './types';

// TECH-SPEC §5.6 / WORKFLOWS §3.3 — rata-rata bulanan emas World Bank dalam scrape-macro.
// `plan` hanya memilih sumber ini bila rata-rata bulan lalu belum ada. Fetch dan parse memakai
// ulang job backfill (halaman → tautan hash → XLSX, P2-06); bedanya hanya jendela baris:
// seluruh Pink Sheet (±360 bulan) tidak di-upsert tiap bulan, cukup beberapa bulan terakhir,
// sehingga revisi World Bank atas bulan-bulan yang baru lewat tetap tertangkap (REVISION)
// tanpa memicu V-11 pada histori lama.

/** Bulan terbaru di file + bulan-bulan sebelumnya yang ikut di-upsert. */
export const RECENT_MONTHS = 3;

export function parse(raw: Parameters<typeof parsePinkSheet>[0]): ParseResult<MacroRow> {
  const all = parsePinkSheet(raw);
  return { ...all, rows: all.rows.slice(-RECENT_MONTHS) };
}

export const worldbank: SourceScraper<MacroRow> = {
  id: 'worldbank',
  kind: 'macro',
  parserVersion: 'worldbank@1.0.0',
  fetchRaw: (ctx) => job.fetchRaw(ctx),
  parse,
};
