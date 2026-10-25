import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import {
  canonicalWeight,
  MACRO_KEY_FIELDS,
  PRICE_KEY_FIELDS,
  type MacroKeyFields,
  type PriceKeyFields,
} from './normalize';
import { MacroRow, PriceRow } from './rows';

// DATA-MODEL §4.1: UTF-8 tanpa BOM, koma, LF, header wajib, kutip hanya bila perlu,
// null = string kosong, baris diurutkan menurut kunci utama.

/** Urutan kolom CSV harga — persis DATA-MODEL §3.1. */
export const PRICE_COLUMNS = [
  'date',
  'source',
  'brand',
  'product',
  'variant',
  'weight_g',
  'location',
  'sell_price',
  'buyback_price',
  'source_updated_at',
  'scraped_at',
  'run_id',
  'origin',
] as const satisfies readonly (keyof PriceRow)[];

/** Urutan kolom CSV makro — persis DATA-MODEL §3.2. */
export const MACRO_COLUMNS = [
  'date',
  'series',
  'frequency',
  'value',
  'unit',
  'source',
  'scraped_at',
  'run_id',
  'origin',
] as const satisfies readonly (keyof MacroRow)[];

const MACRO_DECIMALS = 6;

function compareKeys<T>(fields: readonly (keyof T)[]) {
  return (a: T, b: T): number => {
    for (const f of fields) {
      const x = a[f];
      const y = b[f];
      if (x === y) continue;
      if (typeof x === 'number' && typeof y === 'number') return x - y;
      return String(x) < String(y) ? -1 : 1;
    }
    return 0;
  };
}

export const comparePriceRows = compareKeys<PriceKeyFields>(PRICE_KEY_FIELDS);
export const compareMacroRows = compareKeys<MacroKeyFields>(MACRO_KEY_FIELDS);

function toCell(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Bentuk desimal makro: maks. 6 angka desimal, tanpa nol di belakang, tanpa notasi eksponen. */
export function formatMacroValue(value: number): string {
  return String(Number(value.toFixed(MACRO_DECIMALS)));
}

function write(columns: readonly string[], records: string[][]): string {
  return stringify(records, { header: true, columns: [...columns], record_delimiter: '\n' });
}

export function writePriceCsv(rows: readonly PriceRow[]): string {
  const sorted = [...rows].sort(comparePriceRows);
  return write(
    PRICE_COLUMNS,
    sorted.map((r) =>
      PRICE_COLUMNS.map((c) => (c === 'weight_g' ? canonicalWeight(r.weight_g) : toCell(r[c]))),
    ),
  );
}

export function writeMacroCsv(rows: readonly MacroRow[]): string {
  const sorted = [...rows].sort(compareMacroRows);
  return write(
    MACRO_COLUMNS,
    sorted.map((r) =>
      MACRO_COLUMNS.map((c) => (c === 'value' ? formatMacroValue(r.value) : toCell(r[c]))),
    ),
  );
}

function readRecords(text: string, columns: readonly string[]): Record<string, string>[] {
  if (text.trim() === '') return [];
  const records = parse(text, { columns: true, skip_empty_lines: true, bom: false }) as Record<
    string,
    string
  >[];
  const header = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'));
  if (header !== columns.join(',')) {
    throw new Error(
      `Header CSV tidak sesuai skema.\n  ada:      ${header}\n  harapan:  ${columns}`,
    );
  }
  return records;
}

const nullable = (s: string): string | null => (s === '' ? null : s);
const nullableInt = (s: string): number | null => (s === '' ? null : Number(s));

/** Baca dan validasi CSV harga. Melempar error dengan nomor baris bila ada baris tidak valid. */
export function readPriceCsv(text: string): PriceRow[] {
  return readRecords(text, PRICE_COLUMNS).map((r, i) => {
    const parsed = PriceRow.safeParse({
      date: r.date,
      source: r.source,
      brand: r.brand,
      product: r.product,
      variant: r.variant ?? '',
      weight_g: Number(r.weight_g),
      location: r.location ?? '',
      sell_price: nullableInt(r.sell_price ?? ''),
      buyback_price: nullableInt(r.buyback_price ?? ''),
      source_updated_at: nullable(r.source_updated_at ?? ''),
      scraped_at: r.scraped_at,
      run_id: r.run_id,
      origin: r.origin,
    });
    if (!parsed.success) throw new Error(`Baris CSV ${i + 2} tidak valid: ${parsed.error.message}`);
    return parsed.data;
  });
}

export function readMacroCsv(text: string): MacroRow[] {
  return readRecords(text, MACRO_COLUMNS).map((r, i) => {
    const parsed = MacroRow.safeParse({ ...r, value: Number(r.value) });
    if (!parsed.success) throw new Error(`Baris CSV ${i + 2} tidak valid: ${parsed.error.message}`);
    return parsed.data;
  });
}
