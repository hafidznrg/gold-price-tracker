import type { Brand, PriceSource, Product } from '@gold/schema';
import {
  colorToken,
  perGramPrice,
  productKind,
  selectSeries,
  weightKey,
  type ColorToken,
  type MetaFile,
  type PriceField,
  type ProductKind,
  type SeriesFile,
  type SeriesPoint,
} from './data';
import { RANGE_PRESETS, rangeToDates, type RangeValue } from './range';
import { findGaps } from './spread';

// Logika murni Explorer (P3-06): format kunci di URL, pilihan series, pembentukan titik,
// celah, dan ringkasan rentang. Tanpa React/ECharts agar bisa diuji.

export const MAX_SERIES = 8;
const DAY_MS = 86_400_000;
const PRICES: readonly PriceField[] = ['sell', 'buyback'];
const SOURCES: readonly PriceSource[] = ['logammulia', 'pegadaian', 'ubslifestyle'];
const BRANDS: readonly Brand[] = ['antam', 'ubs', 'galeri24', 'pegadaian'];

// ---------------------------------------------------------------------------
// Kunci di URL
//
//   ?s=logammulia-antam-1-sell,pegadaian-pegadaian-0.01-sell&r=1T
//   ?r=2026-01-01..2026-10-31          (rentang kustom)
//
// Satu series = `{source}-{brand}-{berat}-{sell|buyback}`. Produk dan variant (tahun produksi
// UBS) tidak ditulis: keduanya ditentukan dari katalog. `s=-` = tanpa series;
// `s` kosong = bawaan; `r` kosong = 1T.

export interface SeriesPick {
  source: PriceSource;
  brand: Brand;
  w: number;
  price: PriceField;
}

export const DEFAULT_PICKS: SeriesPick[] = [
  { source: 'logammulia', brand: 'antam', w: 1, price: 'sell' },
  { source: 'logammulia', brand: 'antam', w: 1, price: 'buyback' },
  { source: 'ubslifestyle', brand: 'ubs', w: 1, price: 'buyback' },
  { source: 'pegadaian', brand: 'galeri24', w: 1, price: 'sell' },
  { source: 'pegadaian', brand: 'pegadaian', w: 0.01, price: 'sell' },
];
export const DEFAULT_RANGE: RangeValue = '1T';

export function encodePick(p: SeriesPick): string {
  return `${p.source}-${p.brand}-${weightKey(p.w)}-${p.price}`;
}

export function decodePick(key: string): SeriesPick | null {
  const parts = key.split('-');
  if (parts.length !== 4) return null;
  const [source, brand, w, price] = parts as [string, string, string, string];
  if (!SOURCES.includes(source as PriceSource) || !BRANDS.includes(brand as Brand)) return null;
  if (!PRICES.includes(price as PriceField)) return null;
  const weight = Number(w);
  if (!(weight > 0) || !Number.isFinite(weight) || weightKey(weight) !== w) return null;
  return {
    source: source as PriceSource,
    brand: brand as Brand,
    w: weight,
    price: price as PriceField,
  };
}

export function samePicks(a: SeriesPick[], b: SeriesPick[]): boolean {
  return a.length === b.length && a.every((p, i) => encodePick(p) === encodePick(b[i]!));
}

/** Parameter `s` → daftar pilihan. Kunci rusak/duplikat diabaikan; tak ada yang sah → bawaan. */
export function decodePicks(param: string | null | undefined): SeriesPick[] {
  if (!param) return DEFAULT_PICKS;
  if (param === '-') return [];
  const seen = new Set<string>();
  const out: SeriesPick[] = [];
  for (const k of param.split(',')) {
    const p = decodePick(k.trim());
    if (!p) continue;
    const id = encodePick(p);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(p);
    if (out.length >= MAX_SERIES) break;
  }
  return out.length > 0 ? out : DEFAULT_PICKS;
}

export function encodePicks(picks: SeriesPick[]): string {
  return picks.length === 0 ? '-' : picks.map(encodePick).join(',');
}

function isIsoDate(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
  );
}

export function decodeRange(param: string | null | undefined): RangeValue {
  if (!param) return DEFAULT_RANGE;
  const preset = RANGE_PRESETS.find((p) => p === param);
  if (preset) return preset;
  const [from, to, extra] = param.split('..');
  if (from && to && extra === undefined && isIsoDate(from) && isIsoDate(to) && from <= to) {
    return { from, to };
  }
  return DEFAULT_RANGE;
}

export function encodeRange(r: RangeValue): string {
  return typeof r === 'string' ? r : `${r.from}..${r.to}`;
}

// ---------------------------------------------------------------------------
// Pilihan series dari meta.json

/** Satu kombinasi source × brand × product × berat yang bisa dipilih. */
export interface ExplorerOption {
  id: string;
  source: PriceSource;
  brand: Brand;
  product: Product;
  kind: ProductKind;
  file: string;
  w: number;
  /** Variant dibaca berurutan, yang awal menang: tahun produksi UBS berjalan lalu `''` (D-28). */
  variants: string[];
  /** Tanggal data pertama per jenis harga; null = sumber tidak menampilkan. */
  first: Record<PriceField, string | null>;
}

export function optionId(o: Pick<SeriesPick, 'source' | 'brand' | 'w'>): string {
  return `${o.source}-${o.brand}-${weightKey(o.w)}`;
}

export function explorerOptions(meta: Pick<MetaFile, 'series'>): ExplorerOption[] {
  const groups = new Map<string, MetaFile['series']>();
  for (const s of meta.series) {
    const k = optionId(s) + `-${s.product}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const min = (xs: (string | null)[]) =>
    xs.filter((x): x is string => x !== null).sort()[0] ?? null;
  const out: ExplorerOption[] = [];
  for (const rows of groups.values()) {
    const r0 = rows[0]!;
    const year = rows
      .map((r) => r.variant)
      .filter((v) => v !== '')
      .sort()
      .at(-1);
    const variants = (year ? [year, ''] : ['']).filter((v) => rows.some((r) => r.variant === v));
    const used = rows.filter((r) => variants.includes(r.variant));
    out.push({
      id: optionId(r0),
      source: r0.source,
      brand: r0.brand,
      product: r0.product,
      kind: productKind(r0.product),
      file: r0.file,
      w: r0.w,
      variants,
      first: {
        sell: min(used.map((r) => r.first_sell_date)),
        buyback: min(used.map((r) => r.first_buyback_date)),
      },
    });
  }
  return out;
}

/** Pilihan → opsi katalog; null bila tidak ada atau jenis harga tidak tersedia. */
export function resolvePick(p: SeriesPick, options: ExplorerOption[]): ExplorerOption | null {
  const o = options.find((x) => x.id === optionId(p));
  return o && o.first[p.price] !== null ? o : null;
}

// ---------------------------------------------------------------------------
// Titik series

/**
 * Titik satu series dari file ringkas. Beberapa variant digabung (yang awal menang). Tabungan Emas
 * dibagi berat → rupiah per gram; emas fisik apa adanya per keping.
 */
export function seriesPoints(
  file: Pick<SeriesFile, 'rows'>,
  o: Pick<ExplorerOption, 'variants' | 'w' | 'product'>,
  price: PriceField,
): SeriesPoint[] {
  const by = new Map<string, number>();
  for (const v of [...o.variants].reverse()) {
    for (const p of selectSeries(file, { variant: v, w: o.w, price })) by.set(p.date, p.value);
  }
  const perGram = o.product === 'gold_savings';
  return [...by]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, value]) => ({
      date,
      value: perGram ? (perGramPrice(value, o.w) as number) : value,
    }));
}

/**
 * Titik untuk grafik: tiap celah (≥ 2 hari terbit tanpa data, lihat `findGaps`) diberi satu titik
 * `null` di hari pertamanya supaya garis terputus, dan dilaporkan sebagai rentang celah.
 */
export function chartPoints(
  points: SeriesPoint[],
  isExpected?: (date: string) => boolean,
): {
  points: [string, number | null][];
  gaps: { from: string; to: string }[];
} {
  const gaps = findGaps(
    points.map((p) => p.date),
    2,
    isExpected,
  );
  const out: [string, number | null][] = points.map((p) => [p.date, p.value]);
  for (const g of gaps) out.push([g.from, null]);
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { points: out, gaps };
}

/** Gabung rentang celah dari beberapa series; duplikat dibuang. */
export function mergeGaps(all: { from: string; to: string }[][]): { from: string; to: string }[] {
  const seen = new Map<string, { from: string; to: string }>();
  for (const g of all.flat()) seen.set(`${g.from}|${g.to}`, g);
  return [...seen.values()].sort((a, b) => (a.from < b.from ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Ringkasan rentang

export interface RangeStat {
  count: number;
  first: SeriesPoint;
  last: SeriesPoint;
  min: SeriesPoint;
  max: SeriesPoint;
  changeAbs: number;
  changePct: number;
  /** Hari kalender tanpa data antara titik pertama dan terakhir dalam rentang. */
  missingDays: number;
  /** Series baru mulai setelah awal rentang. */
  startsLate: boolean;
}

export function rangeStats(
  points: SeriesPoint[],
  from: string | null,
  to: string,
): RangeStat | null {
  const inRange = points.filter((p) => (from === null || p.date >= from) && p.date <= to);
  const first = inRange[0];
  const last = inRange.at(-1);
  if (!first || !last) return null;
  let min = first;
  let max = first;
  for (const p of inRange) {
    if (p.value < min.value) min = p;
    if (p.value > max.value) max = p;
  }
  const span = Math.round((Date.parse(last.date) - Date.parse(first.date)) / DAY_MS) + 1;
  return {
    count: inRange.length,
    first,
    last,
    min,
    max,
    changeAbs: last.value - first.value,
    changePct: first.value === 0 ? 0 : ((last.value - first.value) / first.value) * 100,
    missingDays: span - inRange.length,
    startsLate: from !== null && first.date > from,
  };
}

/** Rentang efektif: batas bawah `Semua` dibuka ke tanggal data paling awal. */
export function effectiveRange(
  range: RangeValue,
  lastDate: string,
  minDate: string | null,
): { from: string | null; to: string } {
  const r = rangeToDates(range, lastDate);
  return { from: r.from ?? minDate, to: r.to };
}

export function optionColor(o: Pick<ExplorerOption, 'brand' | 'product'>): ColorToken {
  return colorToken(o);
}
