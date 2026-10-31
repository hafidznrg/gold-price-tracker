import type { PriceRow } from '@gold/schema';
import type { ParsedRow } from '../sources/types';

/**
 * Buang tanggal yang sudah punya baris 1 g hasil scrape harian (varian apa pun), agar backfill
 * tidak membuat seri 1 g kedua di tanggal yang sama (D-28).
 */
export function selectUncovered(
  rows: ParsedRow<PriceRow>[],
  existing: readonly PriceRow[],
): ParsedRow<PriceRow>[] {
  const scraped = new Set(
    existing.filter((r) => r.origin === 'scrape' && r.weight_g === 1).map((r) => r.date),
  );
  return rows.filter((r) => !scraped.has(r.date));
}
