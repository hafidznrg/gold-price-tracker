// DATA-MODEL §4.2 — satu-satunya jalur normalisasi angka dan kunci.

const RUPIAH_PREFIX = /^(rp|idr)\.?\s*/i;
const THOUSANDS = /^\d{1,3}([.,]\d{3})*$/;

/**
 * `'Rp1.403.300'` → `1403300`. Menerima pemisah ribuan titik atau koma dan
 * akhiran sen `,00`. Melempar error untuk input yang tidak bisa dibaca dengan pasti.
 */
export function parseRupiah(input: string): number {
  let s = input.trim().replace(RUPIAH_PREFIX, '').replace(/\s+/g, '');
  // Akhiran sen gaya Indonesia: "1.403.300,00".
  s = s.replace(/,\d{2}$/, (m) => {
    if (m !== ',00') throw new Error(`parseRupiah: nilai sen tidak didukung: "${input}"`);
    return '';
  });
  if (!/^\d+$/.test(s) && !THOUSANDS.test(s)) {
    throw new Error(`parseRupiah: format tidak dikenal: "${input}"`);
  }
  const value = Number(s.replace(/[.,]/g, ''));
  if (!Number.isSafeInteger(value)) throw new Error(`parseRupiah: di luar jangkauan: "${input}"`);
  return value;
}

/**
 * `'0,5 Gram'` → `0.5`, `'0.05 gr'` → `0.05`, `'1.000 Gram'` → `1000`.
 * Koma selalu desimal; titik desimal kecuali berbentuk grup ribuan (`1.000`).
 */
export function parseWeight(input: string): number {
  const s = input
    .trim()
    .replace(/\s*(gram|gr|g)\.?$/i, '')
    .trim();
  let normalized: string;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, '');
  } else {
    normalized = s;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`parseWeight: format tidak dikenal: "${input}"`);
  }
  const value = Number(normalized);
  if (!(value > 0)) throw new Error(`parseWeight: berat harus > 0: "${input}"`);
  return canonicalWeightNumber(value);
}

/** Bulatkan ke 4 desimal agar 0.1 + 0.2 tidak menjadi kunci berbeda. */
function canonicalWeightNumber(weight: number): number {
  return Number(weight.toFixed(4));
}

/** Bentuk string kanonik `weight_g` untuk CSV dan kunci: `0.5`, `1`, `1000`, `0.05`. */
export function canonicalWeight(weight: number): string {
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new Error(`canonicalWeight: berat tidak valid: ${weight}`);
  }
  return String(canonicalWeightNumber(weight));
}

export interface PriceKeyFields {
  date: string;
  source: string;
  brand: string;
  product: string;
  variant: string;
  weight_g: number;
  location: string;
}

export interface MacroKeyFields {
  date: string;
  series: string;
  frequency: string;
}

export const PRICE_KEY_FIELDS = [
  'date',
  'source',
  'brand',
  'product',
  'variant',
  'weight_g',
  'location',
] as const satisfies readonly (keyof PriceKeyFields)[];

export const MACRO_KEY_FIELDS = [
  'date',
  'series',
  'frequency',
] as const satisfies readonly (keyof MacroKeyFields)[];

/** Kunci utama `PRICE_OBSERVATION` sebagai string, dipakai untuk merge dan `REVISION.row_key`. */
export function priceRowKey(row: PriceKeyFields): string {
  return [
    row.date,
    row.source,
    row.brand,
    row.product,
    row.variant,
    canonicalWeight(row.weight_g),
    row.location,
  ].join('|');
}

/** Kunci utama `MACRO_OBSERVATION`. */
export function macroRowKey(row: MacroKeyFields): string {
  return [row.date, row.series, row.frequency].join('|');
}
