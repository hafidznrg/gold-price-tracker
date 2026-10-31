import type { MacroSeriesConfig } from './config';
import { addDaysIso, weekdayIso } from './dates';
import type { Frequency, Series } from './enums';
import type { MacroRow, PriceRow } from './rows';

// DATA-MODEL §6: metrik turunan, dihitung saat build dan tidak pernah disimpan.
// Semua fungsi murni; deret masukan diharapkan sudah unik per tanggal.

export const TROY_OUNCE_G = 31.1034768;

/** Toleransi *as-of join* dalam hari kalender (DATA-MODEL §6.2). */
export const FX_TOLERANCE_DAYS = 5;
export const PREMIUM_TOLERANCE_DAYS = 5;
export const CALCULATOR_TOLERANCE_DAYS = 7;

/** Ambang cakupan data harian untuk agregat (DATA-MODEL §6.3). */
export const DAILY_COVERAGE_MIN = 0.8;

export interface Point {
  date: string;
  value: number;
}

export type Concept = MacroSeriesConfig['concept'];

type MacroInput = Pick<MacroRow, 'date' | 'series' | 'frequency' | 'value'>;
type SeriesInput = Pick<MacroSeriesConfig, 'id' | 'concept' | 'precedence'>;

// ---------------------------------------------------------------------------
// §6.1 Rumus

type Prices = Pick<PriceRow, 'sell_price' | 'buyback_price'>;

/** `sell_price − buyback_price`; null bila salah satu kosong. */
export function spread(row: Prices): number | null {
  if (row.sell_price === null || row.buyback_price === null) return null;
  return row.sell_price - row.buyback_price;
}

export function spreadPct(row: Prices): number | null {
  const s = spread(row);
  return s === null ? null : (s / row.sell_price!) * 100;
}

/** Kenaikan harga yang dibutuhkan agar beli lalu jual kembali impas. */
export function breakEvenPct(row: Prices): number | null {
  const s = spread(row);
  return s === null ? null : (s / row.buyback_price!) * 100;
}

export function perGram(price: number, weightG: number): number {
  if (!(weightG > 0)) throw new Error(`weight_g harus positif: ${weightG}`);
  return price / weightG;
}

/** Harga emas dunia dalam Rp/gram. */
export function goldIdrGram(xauUsdOz: number, usdIdr: number): number {
  return (xauUsdOz * usdIdr) / TROY_OUNCE_G;
}

/** `value_t / value_base` untuk setiap titik. */
export function indexSeries(points: readonly Point[], base: number): Point[] {
  if (!(base > 0)) throw new Error(`nilai dasar indeks harus positif: ${base}`);
  return points.map((p) => ({ date: p.date, value: p.value / base }));
}

/** `index_end^(1/years) − 1`. */
export function cagr(indexEnd: number, years: number): number {
  if (!(years > 0)) throw new Error(`years harus positif: ${years}`);
  return indexEnd ** (1 / years) - 1;
}

/** Jarak dua tanggal dalam tahun (365,25 hari), untuk `cagr`. */
export function yearsBetween(from: string, to: string): number {
  return daysBetween(from, to) / 365.25;
}

/** `sell_price / gold_idr_gram − 1`. */
export function premium(sellPrice: number, goldIdrGramValue: number): number {
  return sellPrice / goldIdrGramValue - 1;
}

// ---------------------------------------------------------------------------
// §6.2 Penggabungan antar seri (as-of join, D-16)

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

export interface AsOfOptions {
  /** Selisih maksimum (hari kalender) antara tanggal acuan dan titik yang dipakai. */
  toleranceDays: number;
  /** `true`: titik harus **sebelum** tanggal acuan (< d), bukan ≤ d. */
  strict?: boolean;
}

/**
 * Titik terakhir ≤ `date` (atau < `date` bila `strict`) dalam toleransi; null bila tidak ada.
 * `points` harus terurut naik menurut tanggal.
 */
export function asOf(points: readonly Point[], date: string, opts: AsOfOptions): Point | null {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const d = points[mid]!.date;
    if (opts.strict ? d < date : d <= date) lo = mid + 1;
    else hi = mid;
  }
  const hit = points[lo - 1];
  if (!hit || daysBetween(hit.date, date) > opts.toleranceDays) return null;
  return hit;
}

/** Titik satu seri pada satu frekuensi, terurut naik. */
export function macroPoints(
  rows: readonly MacroInput[],
  series: Series,
  frequency: Frequency,
): Point[] {
  return rows
    .filter((r) => r.series === series && r.frequency === frequency)
    .map((r) => ({ date: r.date, value: r.value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Seri sebuah konsep, diurutkan menurut `precedence` (terkecil dulu). */
export function seriesForConcept(configs: readonly SeriesInput[], concept: Concept): Series[] {
  return configs
    .filter((c) => c.concept === concept)
    .sort((a, b) => a.precedence - b.precedence)
    .map((c) => c.id);
}

export interface FxPoint extends Point {
  series: Series;
}

/**
 * Pencari kurs harian: seri `usd_idr` dengan `precedence` terkecil yang punya nilai
 * pada tanggal terakhir ≤ d dalam toleransi 5 hari.
 */
export function usdIdrLookup(
  rows: readonly MacroInput[],
  configs: readonly SeriesInput[],
): (date: string) => FxPoint | null {
  const candidates = seriesForConcept(configs, 'usd_idr').map((series) => ({
    series,
    points: macroPoints(rows, series, 'D'),
  }));
  return (date) => {
    for (const { series, points } of candidates) {
      const hit = asOf(points, date, { toleranceDays: FX_TOLERANCE_DAYS });
      if (hit) return { ...hit, series };
    }
    return null;
  };
}

export interface GoldIdrGramPoint extends Point {
  xau_usd_oz: number;
  usd_idr: number;
  usd_idr_series: Series;
  usd_idr_date: string;
}

/** Seri harian Rp/gram spot: setiap tanggal emas US$/oz dipasangkan dengan kurs ≤ tanggal itu. */
export function goldIdrGramSeries(
  rows: readonly MacroInput[],
  configs: readonly SeriesInput[],
): GoldIdrGramPoint[] {
  const fx = usdIdrLookup(rows, configs);
  const out: GoldIdrGramPoint[] = [];
  for (const series of seriesForConcept(configs, 'gold_usd')) {
    for (const p of macroPoints(rows, series, 'D')) {
      const rate = fx(p.date);
      if (!rate) continue;
      out.push({
        date: p.date,
        value: goldIdrGram(p.value, rate.value),
        xau_usd_oz: p.value,
        usd_idr: rate.value,
        usd_idr_series: rate.series,
        usd_idr_date: rate.date,
      });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface PremiumPoint extends Point {
  /** Tanggal Rp/gram spot yang dipakai (selalu < tanggal harga). */
  spot_date: string;
}

/**
 * Premi harga ritel terhadap spot pada tanggal `date`. Spot diambil dari tanggal terakhir
 * **< date** (Antam menetapkan harga pagi dari penutupan sebelumnya), toleransi 5 hari.
 */
export function premiumAt(
  sellPrice: number,
  date: string,
  spot: readonly Point[],
): PremiumPoint | null {
  const hit = asOf(spot, date, { toleranceDays: PREMIUM_TOLERANCE_DAYS, strict: true });
  if (!hit) return null;
  return { date, value: premium(sellPrice, hit.value), spot_date: hit.date };
}

/** `premium_antam` sepanjang waktu dari baris Logam Mulia Antam 1 g. */
export function premiumAntamSeries(
  prices: readonly Pick<
    PriceRow,
    'date' | 'source' | 'brand' | 'product' | 'weight_g' | 'sell_price'
  >[],
  spot: readonly Point[],
): PremiumPoint[] {
  const out: PremiumPoint[] = [];
  for (const r of prices) {
    if (r.source !== 'logammulia' || r.brand !== 'antam' || r.product !== 'gold_bar') continue;
    if (r.weight_g !== 1 || r.sell_price === null) continue;
    const p = premiumAt(r.sell_price, r.date, spot);
    if (p) out.push(p);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Kalkulator: harga pada tanggal X = nilai terakhir ≤ X, toleransi 7 hari. UI menampilkan `date` hasil. */
export function priceOn(points: readonly Point[], date: string): Point | null {
  return asOf(points, date, { toleranceDays: CALCULATOR_TOLERANCE_DAYS });
}

type MatchRow = Pick<PriceRow, 'date' | 'source' | 'brand' | 'product' | 'variant' | 'weight_g'>;

/** Tahun produksi terbaru di antara baris (buyback UBS, "tahun berjalan"); null bila tidak ada. */
export function newestYearVariant(rows: readonly Pick<PriceRow, 'variant'>[]): string | null {
  const years = rows.map((r) => r.variant).filter((v) => /^\d{4}$/.test(v));
  return years.length === 0 ? null : years.sort().at(-1)!;
}

/**
 * Spread lintas sumber: satu baris per sumber dengan `brand + product + weight_g` dan tanggal
 * yang sama. Sumber dengan beberapa `variant` (UBS) memakai `variant` pilihan, atau default
 * tahun produksi terbaru di sumber itu pada tanggal itu.
 */
export function matchAcrossSources<R extends MatchRow>(
  rows: readonly R[],
  key: Pick<PriceRow, 'date' | 'brand' | 'product' | 'weight_g'> & { variant?: string },
): Map<PriceRow['source'], R> {
  const bySource = new Map<PriceRow['source'], R[]>();
  for (const r of rows) {
    if (r.date !== key.date || r.brand !== key.brand) continue;
    if (r.product !== key.product || r.weight_g !== key.weight_g) continue;
    bySource.set(r.source, [...(bySource.get(r.source) ?? []), r]);
  }
  const out = new Map<PriceRow['source'], R>();
  for (const [source, list] of bySource) {
    if (list.length === 1) {
      out.set(source, list[0]!);
      continue;
    }
    const variant = key.variant ?? newestYearVariant(list);
    const hit = list.find((r) => r.variant === variant);
    if (hit) out.set(source, hit);
  }
  return out;
}

export interface FilledPoint extends Point {
  /** `true` bila nilai disalin dari titik sebelumnya — wajib diberi penanda di tampilan. */
  filled: boolean;
  /** Tanggal titik asal nilai. */
  from_date: string;
}

/**
 * *Forward-fill* untuk tampilan saja: setiap tanggal di `dates` mendapat titik terakhir ≤ tanggal
 * itu, berpenanda `filled` bila bukan titik asli. Tanggal sebelum titik pertama (atau melewati
 * `maxDays`) dilewati. Hasilnya tidak pernah ditulis ke data.
 */
export function forwardFill(
  points: readonly Point[],
  dates: readonly string[],
  maxDays = Number.POSITIVE_INFINITY,
): FilledPoint[] {
  const out: FilledPoint[] = [];
  for (const date of dates) {
    const hit = asOf(points, date, { toleranceDays: maxDays });
    if (hit) out.push({ date, value: hit.value, filled: hit.date !== date, from_date: hit.date });
  }
  return out;
}

// ---------------------------------------------------------------------------
// §6.3 Resolusi frekuensi untuk agregat tahunan/bulanan

export type Granularity = 'year' | 'month';

export interface AggregatePoint {
  /** `YYYY` atau `YYYY-MM`. */
  period: string;
  value: number;
  /** Seri dan frekuensi sumber nilai, untuk tooltip. */
  series: Series;
  frequency: Frequency;
  /** Jumlah titik yang dirata-ratakan. */
  points: number;
  /** Cakupan hari kerja data `D` (0–1); null bila nilai berasal dari `M`/`A`. */
  coverage: number | null;
}

export interface AggregateOptions {
  /**
   * Tanggal akhir data (inklusif). Periode berjalan dipotong di sini sehingga cakupannya
   * dihitung terhadap hari kerja yang sudah lewat. Default: tanggal terakhir yang diwakili
   * `rows` (baris `M`/`A` mewakili sampai akhir bulan/tahunnya).
   */
  until?: string;
}

function periodOf(date: string, granularity: Granularity): string {
  return granularity === 'year' ? date.slice(0, 4) : date.slice(0, 7);
}

function periodBounds(period: string, granularity: Granularity): [string, string] {
  if (granularity === 'year') return [`${period}-01-01`, `${period}-12-31`];
  const start = `${period}-01`;
  const [y, m] = period.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return [start, addDaysIso(next, -1)];
}

/** Tanggal terakhir yang diwakili baris: `D` = tanggalnya, `M` = akhir bulan, `A` = akhir tahun. */
function coveredUntil(row: MacroInput): string {
  if (row.frequency === 'D') return row.date;
  const granularity = row.frequency === 'M' ? 'month' : 'year';
  return periodBounds(periodOf(row.date, granularity), granularity)[1];
}

/** Hari kerja (Senin–Jumat) di `[from, to]`. */
export function weekdaysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    const w = weekdayIso(d);
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Agregat per tahun atau bulan untuk satu konsep. Per periode, tingkat pertama yang tersedia:
 *
 * 1. rata-rata data `D` bila cakupannya ≥ 80% hari kerja (Senin–Jumat) periode itu;
 * 2. rata-rata data `M` (per tahun: bila mencakup ≥ 80% bulan periode itu; per bulan: nilai bulan itu);
 * 3. nilai `A` tahun itu.
 *
 * Di setiap tingkat seri dicoba menurut `precedence` (`usd_idr`: JISDOR → ECB → tahunan).
 * Periode tanpa nilai di ketiga tingkat tidak muncul.
 */
export function aggregate(
  rows: readonly MacroInput[],
  configs: readonly SeriesInput[],
  concept: Concept,
  granularity: Granularity,
  opts: AggregateOptions = {},
): AggregatePoint[] {
  const seriesList = seriesForConcept(configs, concept);
  const relevant = rows.filter((r) => seriesList.includes(r.series));
  if (relevant.length === 0) return [];
  const until = opts.until ?? relevant.map(coveredUntil).sort().at(-1)!;

  // Kelompokkan nilai per (seri, frekuensi, periode tujuan).
  const groups = new Map<string, { date: string; value: number }[]>();
  const periods = new Set<string>();
  for (const r of relevant) {
    if (r.date > until) continue;
    // Nilai `A` berlaku untuk setiap bulan di tahunnya.
    const targets =
      granularity === 'month' && r.frequency === 'A'
        ? Array.from(
            { length: 12 },
            (_, i) => `${r.date.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`,
          )
        : [periodOf(r.date, granularity)];
    for (const period of targets) {
      if (periodBounds(period, granularity)[0] > until) continue;
      const k = `${r.series}|${r.frequency}|${period}`;
      groups.set(k, [...(groups.get(k) ?? []), { date: r.date, value: r.value }]);
      periods.add(period);
    }
  }

  const out: AggregatePoint[] = [];
  for (const period of [...periods].sort()) {
    const [start, end] = periodBounds(period, granularity);
    const last = end < until ? end : until;
    const point = resolvePeriod(groups, seriesList, period, granularity, start, last);
    if (point) out.push(point);
  }
  return out;
}

function resolvePeriod(
  groups: ReadonlyMap<string, readonly Point[]>,
  seriesList: readonly Series[],
  period: string,
  granularity: Granularity,
  start: string,
  last: string,
): AggregatePoint | null {
  const get = (series: Series, f: Frequency) => groups.get(`${series}|${f}|${period}`) ?? [];

  const workdays = weekdaysBetween(start, last);
  for (const series of seriesList) {
    const daily = get(series, 'D');
    if (daily.length === 0 || workdays === 0) continue;
    // Titik akhir pekan (jarang) ikut dirata-ratakan, tetapi tidak menambah cakupan.
    const onWorkdays = daily.filter((p) => ![0, 6].includes(weekdayIso(p.date))).length;
    const coverage = Math.min(1, onWorkdays / workdays);
    if (coverage < DAILY_COVERAGE_MIN) continue;
    const value = mean(daily.map((p) => p.value));
    return { period, value, series, frequency: 'D', points: daily.length, coverage };
  }

  const months = granularity === 'year' ? Number(last.slice(5, 7)) : 1;
  for (const series of seriesList) {
    const monthly = get(series, 'M');
    if (monthly.length === 0 || monthly.length / months < DAILY_COVERAGE_MIN) continue;
    return {
      period,
      value: mean(monthly.map((p) => p.value)),
      series,
      frequency: 'M',
      points: monthly.length,
      coverage: null,
    };
  }

  for (const series of seriesList) {
    const annual = get(series, 'A');
    if (annual.length === 0) continue;
    return { period, value: annual[0]!.value, series, frequency: 'A', points: 1, coverage: null };
  }
  return null;
}
