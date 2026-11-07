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
import { forwardFill } from './forward-fill';
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

// ---------------------------------------------------------------------------
// Tampilan: mode nilai, agregasi, isi celah (P4-01..03; FR-27, FR-28, FR-35)
//
//   &m=gram|idx|pct   mode nilai (kosong = nominal)
//   &agg=w|m          agregasi mingguan / bulanan (kosong = harian)
//   &band=1           pita min–maks (hanya berlaku bila agregasi bukan harian)
//   &ffill=1          isi celah (forward-fill, hanya tampilan)

export type ValueMode = 'nominal' | 'gram' | 'index' | 'pct';
export type Aggregation = 'd' | 'w' | 'm';

export interface ViewOptions {
  mode: ValueMode;
  agg: Aggregation;
  band: boolean;
  ffill: boolean;
}

export const DEFAULT_VIEW: ViewOptions = { mode: 'nominal', agg: 'd', band: false, ffill: false };

const MODE_CODES: Record<ValueMode, string | null> = {
  nominal: null,
  gram: 'gram',
  index: 'idx',
  pct: 'pct',
};
const AGG_CODES: Record<Aggregation, string | null> = { d: null, w: 'w', m: 'm' };

export function decodeMode(param: string | null | undefined): ValueMode {
  const hit = (Object.keys(MODE_CODES) as ValueMode[]).find((k) => MODE_CODES[k] === param);
  return param ? (hit ?? 'nominal') : 'nominal';
}
export const encodeMode = (m: ValueMode): string | null => MODE_CODES[m];

export function decodeAgg(param: string | null | undefined): Aggregation {
  const hit = (Object.keys(AGG_CODES) as Aggregation[]).find((k) => AGG_CODES[k] === param);
  return param ? (hit ?? 'd') : 'd';
}
export const encodeAgg = (a: Aggregation): string | null => AGG_CODES[a];

export const decodeFlag = (param: string | null | undefined): boolean => param === '1';
export const encodeFlag = (on: boolean): string | null => (on ? '1' : null);

/** Titik tampilan: satu per hari (harian) atau per periode (penutupan), dengan penanda dan pita. */
export interface ViewPoint {
  date: string;
  value: number;
  /** Min/maks nilai dalam periode (hanya agregasi mingguan/bulanan). */
  min: number | null;
  max: number | null;
  /** Tanggal titik asal bila nilai hasil forward-fill; null = titik asli. */
  filledFrom: string | null;
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function nextMonthStart(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/** Kunci periode: harian = tanggalnya; mingguan = Senin pekan itu; bulanan = `YYYY-MM`. */
export function periodOf(date: string, agg: Aggregation): string {
  if (agg === 'd') return date;
  if (agg === 'm') return date.slice(0, 7);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

/** Hari pertama dan terakhir kalender sebuah periode. */
export function periodSpan(key: string, agg: Aggregation): [string, string] {
  if (agg === 'd') return [key, key];
  if (agg === 'w') return [key, addDays(key, 6)];
  return [`${key}-01`, addDays(nextMonthStart(key), -1)];
}

function nextPeriod(key: string, agg: Aggregation): string {
  if (agg === 'w') return addDays(key, 7);
  if (agg === 'm') return nextMonthStart(key).slice(0, 7);
  return addDays(key, 1);
}

/**
 * Titik → titik tampilan. Mingguan/bulanan memakai **penutupan periode** (titik terakhir yang ada
 * dalam periode, bertanggal hari datanya) dan menyimpan min–maks seluruh titik dalam periode.
 * `points` terurut naik.
 */
export function aggregateClose(points: readonly SeriesPoint[], agg: Aggregation): ViewPoint[] {
  if (agg === 'd') {
    return points.map((p) => ({
      date: p.date,
      value: p.value,
      min: null,
      max: null,
      filledFrom: null,
    }));
  }
  const out: ViewPoint[] = [];
  let key = '';
  for (const p of points) {
    const k = periodOf(p.date, agg);
    const cur = out.at(-1);
    if (k === key && cur) {
      cur.date = p.date;
      cur.value = p.value;
      cur.min = Math.min(cur.min!, p.value);
      cur.max = Math.max(cur.max!, p.value);
    } else {
      key = k;
      out.push({ date: p.date, value: p.value, min: p.value, max: p.value, filledFrom: null });
    }
  }
  return out;
}

/**
 * *Forward-fill* untuk tampilan: harian → hari terbit (`isExpected`) tanpa data di antara titik
 * pertama dan terakhir; mingguan/bulanan → periode tanpa titik sama sekali (bertanggal hari
 * terakhir periode). Tidak pernah memperpanjang sebelum titik pertama atau sesudah titik terakhir.
 */
export function fillGaps(
  points: readonly ViewPoint[],
  agg: Aggregation,
  isExpected: (date: string) => boolean = () => true,
): ViewPoint[] {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return [...points];
  const have = new Set(points.map((p) => periodOf(p.date, agg)));
  const dates: string[] = [];
  const end = periodOf(last.date, agg);
  for (let k = nextPeriod(periodOf(first.date, agg), agg); k < end; k = nextPeriod(k, agg)) {
    if (have.has(k)) continue;
    if (agg === 'd') {
      if (isExpected(k)) dates.push(k);
    } else dates.push(periodSpan(k, agg)[1]);
  }
  if (dates.length === 0) return [...points];
  const filled = forwardFill(
    points.map((p) => ({ date: p.date, value: p.value })),
    dates,
  ).map((f): ViewPoint => ({
    date: f.date,
    value: f.value,
    min: null,
    max: null,
    filledFrom: f.from_date,
  }));
  return [...points, ...filled].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Pembagi "per gram": Tabungan Emas sudah per gram (lihat `seriesPoints`), emas fisik ÷ berat. */
export function gramDivisor(o: Pick<ExplorerOption, 'product' | 'w'>): number {
  return o.product === 'gold_savings' ? 1 : o.w;
}

/**
 * Terapkan mode nilai. `nominal` apa adanya; `gram` ÷ `divisor`; `index`/`pct` memakai titik
 * pertama yang terlihat di `[from, to]` sebagai dasar (=100 / 0%) untuk series ini. Tanpa titik di
 * rentang (atau dasar ≤ 0) → kosong. Titik di luar rentang tetap ikut, relatif terhadap dasar yang
 * sama, agar zoom/geser tidak memotong garis.
 */
export function applyMode(
  points: readonly ViewPoint[],
  mode: ValueMode,
  divisor: number,
  from: string | null,
  to: string,
): ViewPoint[] {
  if (mode === 'nominal') return [...points];
  const map = (f: (v: number) => number) =>
    points.map((p) => ({
      ...p,
      value: f(p.value),
      min: p.min === null ? null : f(p.min),
      max: p.max === null ? null : f(p.max),
    }));
  if (mode === 'gram') return map((v) => v / divisor);
  const base = points.find((p) => (from === null || p.date >= from) && p.date <= to)?.value;
  if (base === undefined || !(base > 0)) return [];
  return mode === 'index' ? map((v) => (v / base) * 100) : map((v) => (v / base - 1) * 100);
}

/**
 * Celah untuk agregasi: celah harian yang memuat satu periode utuh (mingguan/bulanan), dipotong
 * ke periode-periode utuh itu. Celah yang lebih pendek dari satu periode hilang di dalam penutupan.
 */
export function viewGaps(
  gaps: readonly { from: string; to: string }[],
  agg: Aggregation,
): { from: string; to: string }[] {
  if (agg === 'd') return [...gaps];
  const out: { from: string; to: string }[] = [];
  for (const g of gaps) {
    let k = periodOf(g.from, agg);
    if (periodSpan(k, agg)[0] < g.from) k = nextPeriod(k, agg);
    let from: string | null = null;
    let to: string | null = null;
    for (; periodSpan(k, agg)[1] <= g.to; k = nextPeriod(k, agg)) {
      from ??= periodSpan(k, agg)[0];
      to = periodSpan(k, agg)[1];
    }
    if (from && to) out.push({ from, to });
  }
  return out;
}

/** Titik grafik dari titik tampilan; tanpa isi celah, tiap celah diberi satu `null` di hari pertamanya. */
export function viewChartPoints(
  points: readonly ViewPoint[],
  gaps: readonly { from: string; to: string }[],
  ffill: boolean,
): [string, number | null][] {
  const out: [string, number | null][] = points.map((p) => [p.date, p.value]);
  if (!ffill) for (const g of gaps) out.push([g.from, null]);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Catatan tooltip untuk titik hasil forward-fill: tanggal asal nilainya. */
export function fillNotes(points: readonly ViewPoint[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of points) if (p.filledFrom) out[p.date] = `isi dari ${p.filledFrom}`;
  return out;
}
