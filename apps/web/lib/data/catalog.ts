import type { Brand, MacroSource, PriceSource, Product, ScraperId, Series } from '@gold/schema';
import type {
  ColorToken,
  PriceField,
  PriceSeriesRef,
  ProductKind,
  SeriesFile,
  SeriesRef,
} from './types';

// Katalog series, label, dan warna. Hanya `import type` dari @gold/schema agar aman di klien.

const PRICE_SOURCE_IDS: readonly PriceSource[] = [
  'logammulia',
  'pegadaian',
  'ubslifestyle',
  'galeri24',
  'lotusarchi',
  'hrtagold',
];
const BRAND_IDS: readonly Brand[] = [
  'antam',
  'ubs',
  'galeri24',
  'pegadaian',
  'lotusarchi',
  'emasku',
];

/** Bentuk kanonik berat (`0.5`, `1`, `1000`, `0.01`), sama dengan `canonicalWeight` schema. */
export function weightKey(w: number): string {
  if (!Number.isFinite(w) || w <= 0) throw new Error(`berat tidak valid: ${w}`);
  return String(Number(w.toFixed(4)));
}

// ---------------------------------------------------------------------------
// Kunci series

const SEP = ':';

/** `logammulia:antam:gold_bar::1`, `ubslifestyle:ubs:gold_bar:2026:0.5`. */
export function seriesKey(ref: SeriesRef): string {
  return [ref.source, ref.brand, ref.product, ref.variant, weightKey(ref.w)].join(SEP);
}

export function parseSeriesKey(key: string): SeriesRef | null {
  const parts = key.split(SEP);
  if (parts.length !== 5) return null;
  const [source, brand, product, variant, w] = parts as [string, string, string, string, string];
  if (!PRICE_SOURCE_IDS.includes(source as PriceSource)) return null;
  if (!BRAND_IDS.includes(brand as Brand)) return null;
  if (!/^[a-z][a-z0-9_]*$/.test(product)) return null;
  if (variant !== '' && !/^[\w-]+$/.test(variant)) return null;
  const weight = Number(w);
  if (!(weight > 0) || weightKey(weight) !== w) return null;
  return { source: source as PriceSource, brand: brand as Brand, product, variant, w: weight };
}

/** Kunci series + jenis harga: `logammulia:antam:gold_bar::1:sell`. */
export function priceSeriesKey(ref: PriceSeriesRef): string {
  return `${seriesKey(ref)}${SEP}${ref.price}`;
}

export function parsePriceSeriesKey(key: string): PriceSeriesRef | null {
  const i = key.lastIndexOf(SEP);
  const price = key.slice(i + 1);
  if (price !== 'sell' && price !== 'buyback') return null;
  const ref = parseSeriesKey(key.slice(0, i));
  return ref ? { ...ref, price } : null;
}

/** Produk "utama" sebuah brand: file-nya cukup `{source}-{brand}`. */
const MAIN_PRODUCTS: readonly string[] = ['gold_bar', 'gold_savings'];

/** Nama file series (tanpa ekstensi): `logammulia-antam`, `pegadaian-pegadaian`. */
export function seriesFileId(ref: Pick<SeriesRef, 'source' | 'brand' | 'product'>): string {
  const base = `${ref.source}-${ref.brand}`;
  return MAIN_PRODUCTS.includes(ref.product) ? base : `${base}-${ref.product.replace(/_/g, '-')}`;
}

export function productKind(product: Product): ProductKind {
  return product === 'gold_savings' ? 'tabungan' : 'fisik';
}

// ---------------------------------------------------------------------------
// Membaca file series ringkas

export interface SeriesPoint {
  date: string;
  value: number;
}

/** Titik satu series (variant + w + jenis harga) dari file ringkas; nilai null dilewati. */
export function selectSeries(
  file: Pick<SeriesFile, 'rows'>,
  sel: { variant: string; w: number; price: PriceField },
): SeriesPoint[] {
  const w = weightKey(sel.w);
  const out: SeriesPoint[] = [];
  for (const [date, variant, rw, sell, buyback] of file.rows) {
    if (variant !== sel.variant || weightKey(rw) !== w) continue;
    const value = sel.price === 'sell' ? sell : buyback;
    if (value !== null) out.push({ date, value });
  }
  return out;
}

/** Kombinasi variant × w yang ada di file, terurut (variant naik, lalu berat naik). */
export function seriesInFile(file: Pick<SeriesFile, 'rows'>): { variant: string; w: number }[] {
  const seen = new Map<string, { variant: string; w: number }>();
  for (const [, variant, w] of file.rows) {
    seen.set(`${variant}|${weightKey(w)}`, { variant, w });
  }
  return [...seen.values()].sort((a, b) =>
    a.variant === b.variant ? a.w - b.w : a.variant < b.variant ? -1 : 1,
  );
}

/** Harga per gram (harga apa adanya ÷ `w`), dibulatkan ke 2 desimal. Null tetap null. */
export function perGramPrice(price: number | null, w: number): number | null {
  if (price === null) return null;
  if (!(w > 0)) throw new Error(`berat harus positif: ${w}`);
  return Math.round((price / w) * 100) / 100;
}

/**
 * File series yang buyback-nya satu harga per gram untuk semua ukuran keping (D-39): Logam Mulia dan
 * Lotus Archi (lotusarchi.com, D-65) menetapkan satu harga buyback per gram, dan data hanya mencatat baris 1 g. Buyback berat lain
 * dihitung di web (buyback 1 g × berat), tidak ditulis ke CSV.
 */
export const PER_GRAM_BUYBACK_FILES: ReadonlySet<string> = new Set([
  'logammulia-antam',
  'lotusarchi-lotusarchi',
]);

export function hasPerGramBuyback(file: string): boolean {
  return PER_GRAM_BUYBACK_FILES.has(file);
}

/** Buyback keping `w` gram dari buyback 1 g (D-39), dibulatkan ke rupiah. Null tetap null. */
export function buybackFromGram(buyback1g: number | null, w: number): number | null {
  return buyback1g === null ? null : Math.round(buyback1g * w);
}

// ---------------------------------------------------------------------------
// Label (wording mockup)

export const SOURCE_LABELS: Record<PriceSource, string> = {
  logammulia: 'Logam Mulia',
  pegadaian: 'Pegadaian',
  ubslifestyle: 'UBS Lifestyle',
  galeri24: 'Galeri24',
  lotusarchi: 'Lotus Archi',
  hrtagold: 'EMASKU (Hartadinata)',
};

/** Domain untuk atribusi "Sumber: …". */
export const SOURCE_DOMAINS: Record<PriceSource, string> = {
  logammulia: 'logammulia.com',
  pegadaian: 'pegadaian.co.id',
  ubslifestyle: 'ubslifestyle.com',
  galeri24: 'galeri24.co.id',
  lotusarchi: 'lotusarchi.com',
  hrtagold: 'hrtagold.id',
};

export const BRAND_LABELS: Record<Brand, string> = {
  antam: 'Antam',
  ubs: 'UBS',
  galeri24: 'Galeri24',
  pegadaian: 'Pegadaian',
  lotusarchi: 'Lotus Archi',
  emasku: 'EMASKU',
};

export const PRODUCT_LABELS: Record<string, string> = {
  gold_bar: 'Emas batangan',
  gold_savings: 'Tabungan Emas',
};

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  fisik: 'Emas fisik',
  tabungan: 'Tabungan emas',
};

/** Pilihan filter Hari ini, urut mockup. */
export const PRODUCT_FILTERS: readonly { value: ProductKind | 'semua'; label: string }[] = [
  { value: 'semua', label: 'Semua' },
  { value: 'fisik', label: 'Emas fisik' },
  { value: 'tabungan', label: 'Tabungan emas' },
];

export function productLabel(product: Product): string {
  return PRODUCT_LABELS[product] ?? product;
}

/** Nama tampilan kartu: brand, atau nama produk untuk produk milik penerbit (Tabungan Emas). */
export function displayBrand(ref: Pick<SeriesRef, 'brand' | 'product'>): string {
  return ref.product === 'gold_savings' ? 'Tabungan Emas' : BRAND_LABELS[ref.brand];
}

/**
 * Keterangan varian untuk label: "produksi YYYY" hanya untuk variant tahun (4 digit, sama dengan
 * `isYearVariant` schema), `non_pegadaian` = "non-Pegadaian" (buyback keping yang dibeli di luar
 * Pegadaian/Galeri24), `''` tanpa keterangan. Varian lain tidak pernah ditulis "produksi …".
 */
export function variantLabel(variant: string): string {
  if (variant === '') return '';
  if (/^\d{4}$/.test(variant)) return `produksi ${variant}`;
  if (variant === 'non_pegadaian') return 'non-Pegadaian';
  if (variant === 'prime') return 'Prime';
  return variant.replace(/_/g, ' ');
}

/** "Antam · Logam Mulia", "Tabungan Emas · Pegadaian". */
export function seriesGroupLabel(ref: Pick<SeriesRef, 'source' | 'brand' | 'product'>): string {
  // Lotus Archi di situs resminya: "Lotus Archi · Lotus Archi" menyesatkan, tulis domainnya.
  if (ref.source === 'lotusarchi') return `${displayBrand(ref)} · ${SOURCE_DOMAINS[ref.source]}`;
  // EMASKU di situs Hartadinata: "EMASKU · EMASKU (Hartadinata)" berulang, pakai nama modul.
  if (ref.source === 'hrtagold') return `${displayBrand(ref)} · ${SCRAPER_LABELS.hrtagold}`;
  return `${displayBrand(ref)} · ${SOURCE_LABELS[ref.source]}`;
}

/** Label satuan kartu Hari ini. */
export function unitLabel(ref: Pick<SeriesRef, 'source' | 'product'>): string {
  if (ref.product === 'gold_savings') return 'Harga jual · per gram';
  return ref.source === 'logammulia' ? 'Harga dasar · keping 1 g' : 'Harga jual · keping 1 g';
}

export const PRICE_FIELD_LABELS: Record<PriceField, string> = {
  sell: 'Harga jual',
  buyback: 'Buyback',
};

export const MACRO_SERIES_LABELS: Record<Series, string> = {
  xau_usd_oz: 'Emas dunia XAU/USD',
  usd_idr_jisdor: 'USD/IDR JISDOR',
  usd_idr_ecb: 'USD/IDR ECB',
  usd_idr_annual: 'USD/IDR tahunan',
};

/** Label pendek (daftar "Pembaruan terakhir"). */
export const MACRO_SERIES_SHORT_LABELS: Record<Series, string> = {
  xau_usd_oz: 'XAU/USD',
  usd_idr_jisdor: 'JISDOR',
  usd_idr_ecb: 'ECB',
  usd_idr_annual: 'Kurs tahunan',
};

export const MACRO_SOURCE_LABELS: Record<MacroSource, string> = {
  xaus: 'xaus.com',
  bi: 'Bank Indonesia',
  ecb: 'ECB via Frankfurter',
  worldbank: 'World Bank Pink Sheet',
  wdi: 'World Bank WDI',
};

// ---------------------------------------------------------------------------
// Warna brand (token Tailwind di globals.css)

export function colorToken(ref: Pick<SeriesRef, 'brand' | 'product'>): ColorToken {
  if (ref.product === 'gold_savings') return 'tab';
  switch (ref.brand) {
    case 'antam':
      return 'antam';
    case 'ubs':
      return 'ubs';
    case 'galeri24':
      return 'g24';
    case 'pegadaian':
      return 'tab';
    case 'lotusarchi':
      return 'lotus';
    case 'emasku':
      return 'emasku';
  }
}

/** Seri pembanding dunia bukan brand (D-52): emas dunia `spot`, kurs `muted`. */
export const MACRO_COLORS: Record<Series, ColorToken> = {
  xau_usd_oz: 'spot',
  usd_idr_jisdor: 'muted',
  usd_idr_ecb: 'muted',
  usd_idr_annual: 'muted',
};

/** `var(--antam)` untuk SVG/ECharts. */
export function colorVar(token: ColorToken): string {
  return `var(--${token})`;
}

/** Kelas Tailwind literal (supaya terdeteksi pemindai kelas). */
export const COLOR_CLASSES: Record<ColorToken, { text: string; bg: string; border: string }> = {
  antam: { text: 'text-antam', bg: 'bg-antam', border: 'border-antam' },
  ubs: { text: 'text-ubs', bg: 'bg-ubs', border: 'border-ubs' },
  g24: { text: 'text-g24', bg: 'bg-g24', border: 'border-g24' },
  lotus: { text: 'text-lotus', bg: 'bg-lotus', border: 'border-lotus' },
  emasku: { text: 'text-emasku', bg: 'bg-emasku', border: 'border-emasku' },
  tab: { text: 'text-tab', bg: 'bg-tab', border: 'border-tab' },
  spot: { text: 'text-spot', bg: 'bg-spot', border: 'border-spot' },
  gold: { text: 'text-gold', bg: 'bg-gold', border: 'border-gold' },
  muted: { text: 'text-muted', bg: 'bg-muted', border: 'border-muted' },
};

// ---------------------------------------------------------------------------
// Urutan tampilan

/** Label modul scraper (status sumber). */
export const SCRAPER_LABELS: Record<ScraperId, string> = {
  logammulia: 'Logam Mulia',
  pegadaian: 'Pegadaian',
  ubslifestyle: 'UBS Lifestyle',
  xaus: 'XAU/USD',
  jisdor: 'JISDOR',
  worldbank: 'World Bank Pink Sheet',
  galeri24: 'Galeri24',
  lotusarchi: 'Lotus Archi',
  hrtagold: 'HRTA Gold',
};

/** Urutan file series di kartu Hari ini dan halaman Data (mockup). */
export const FILE_ORDER: readonly string[] = [
  'logammulia-antam',
  'ubslifestyle-ubs',
  'galeri24-galeri24',
  'galeri24-lotusarchi',
  'hrtagold-emasku',
  'lotusarchi-lotusarchi',
  'galeri24-antam',
  'galeri24-ubs',
  'pegadaian-galeri24',
  'pegadaian-antam',
  'pegadaian-ubs',
  'pegadaian-lotusarchi',
  'pegadaian-pegadaian',
];

/** Pembanding urutan id file: `FILE_ORDER` dulu, sisanya alfabetis. */
export function compareFileIds(a: string, b: string): number {
  const ia = FILE_ORDER.indexOf(a);
  const ib = FILE_ORDER.indexOf(b);
  if (ia !== ib) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib) || 0;
  return a < b ? -1 : a > b ? 1 : 0;
}
