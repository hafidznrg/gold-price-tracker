import { canonicalWeight, priceRowKey, type PriceRow } from '@gold/schema';
import type { ParsedRow } from '../sources/types';

// DATA-MODEL §5 — klasifikasi berbasis nilai (D-14). Dipakai validate (V-11) dan merge.

export type Candidate = ParsedRow<PriceRow>;

/** Kolom nilai: hanya perubahan di sini yang dihitung sebagai update. */
export const PRICE_VALUE_FIELDS = ['sell_price', 'buyback_price', 'source_updated_at'] as const;
export type PriceValueField = (typeof PRICE_VALUE_FIELDS)[number];

export type Classification =
  | { kind: 'insert' }
  | { kind: 'unchanged'; current: PriceRow }
  | { kind: 'update'; current: PriceRow; changed: PriceValueField[] };

export function indexByKey(rows: readonly PriceRow[]): Map<string, PriceRow> {
  return new Map(rows.map((r) => [priceRowKey(r), r]));
}

export function classify(existing: ReadonlyMap<string, PriceRow>, row: Candidate): Classification {
  const current = existing.get(priceRowKey(row));
  if (!current) return { kind: 'insert' };
  const changed = PRICE_VALUE_FIELDS.filter((f) => current[f] !== row[f]);
  return changed.length === 0
    ? { kind: 'unchanged', current }
    : { kind: 'update', current, changed };
}

/** Kunci seri = kunci utama tanpa `date` (untuk V-05: nilai terakhir seri yang sama). */
export function seriesKey(row: Omit<Candidate, 'date'> | Omit<PriceRow, 'date'>): string {
  return [
    row.source,
    row.brand,
    row.product,
    row.variant,
    canonicalWeight(row.weight_g),
    row.location,
  ].join('|');
}

/** Nilai sel untuk `REVISION.old_value`/`new_value`: null = string kosong (sama seperti CSV). */
export function cell(value: string | number | null): string {
  return value === null ? '' : String(value);
}
