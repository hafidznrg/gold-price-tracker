import type { Frequency, Series } from '@gold/schema';
import { jakartaDateOf } from './format';
import type { AnnualRow, LatestSpot } from './data';

// Logika murni halaman Kelipatan (P4-08, FR-32): nilai tahunan menurut agregasi, indeks ke tahun
// dasar, titik spot hari ini, CAGR, dan sumbu log. Tanpa React/ECharts dan tanpa nilai dari
// @gold/schema (hanya tipe; aman untuk bundel klien). `cagr`/`yearsBetween`/TROY_OUNCE_G adalah
// salinan `derive.ts` (DATA-MODEL §6.1); kesetaraannya dijaga uji di kelipatan.test.ts.

export const TROY_OUNCE_G = 31.1034768;

export type Aggregation = 'avg' | 'end';
export type ConceptId = 'idr' | 'usd' | 'fx' | 'lm';

export const BASE_YEARS = [1996, 2000, 2005, 2010, 2015, 2020] as const;
export const DEFAULT_BASE_YEAR = 1996;
export const DEFAULT_AGGREGATION: Aggregation = 'avg';
/** Antam LM 1 g tercatat sejak Jan 2010 (D-29). */
export const LM_FIRST_YEAR = 2010;

export const AGGREGATIONS: { value: Aggregation; label: string }[] = [
  { value: 'avg', label: 'Rata-rata tahunan' },
  { value: 'end', label: 'Penutupan akhir tahun' },
];

// ---------------------------------------------------------------------------
// Parameter URL

export function decodeBaseYear(param: string | null | undefined): number {
  const y = Number(param);
  return (BASE_YEARS as readonly number[]).includes(y) ? y : DEFAULT_BASE_YEAR;
}

export function decodeAggregation(param: string | null | undefined): Aggregation {
  return param === 'end' ? 'end' : 'avg';
}

// ---------------------------------------------------------------------------
// Rumus (salinan derive.ts)

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/** `index_end^(1/years) − 1`; null bila rentang tidak positif. */
export function cagr(indexEnd: number, years: number): number | null {
  return years > 0 ? indexEnd ** (1 / years) - 1 : null;
}

export function yearsBetween(from: string, to: string): number {
  return daysBetween(from, to) / 365.25;
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Nilai tahunan menurut agregasi

/** Seri dan frekuensi sumber nilai satu tahun (DATA-MODEL §6.3), untuk kolom "Sumber". */
export interface YearSource {
  series: Series;
  frequency: Frequency;
  /** Tanggal titik penutupan (hanya agregasi `end`). */
  date: string | null;
}

export interface YearRow {
  year: number;
  /** Posisi tanggal titik di sumbu X (ISO). */
  x: string;
  /** Tahun berjalan: nilainya sampai `until`, bukan setahun penuh. */
  partial: boolean;
  usd: number | null;
  fx: number | null;
  /** Rp/gram: rata-rata bulanan (avg) atau US$/oz × kurs ÷ 31,1035 pada penutupan (end). */
  idr: number | null;
  /** Antam LM 1 g jual (Rp per 1 g). */
  lm: number | null;
  usdSrc: YearSource | null;
  fxSrc: YearSource | null;
  /** Jumlah bulan yang dirata-ratakan untuk Rp/gram (avg). */
  idrMonths: number | null;
}

export function goldIdrGram(xauUsdOz: number, usdIdr: number): number {
  return (xauUsdOz * usdIdr) / TROY_OUNCE_G;
}

/** Tanggal titik tahun di sumbu X: tengah tahun (avg) atau 31 Des (end); tahun berjalan menyesuaikan `until`. */
export function yearX(year: number, agg: Aggregation, until: string | null): string {
  const partial = until !== null && Number(until.slice(0, 4)) === year;
  if (agg === 'end') return partial ? until : `${year}-12-31`;
  if (!partial) return `${year}-07-01`;
  return addDays(`${year}-01-01`, Math.round(daysBetween(`${year}-01-01`, until) / 2));
}

export function yearRows(
  rows: readonly AnnualRow[],
  agg: Aggregation,
  until: string | null,
): YearRow[] {
  return rows.map((r): YearRow => {
    const partial = until !== null && Number(until.slice(0, 4)) === r.year;
    const usdEnd = r.year_end?.gold_usd ?? null;
    const fxEnd = r.year_end?.usd_idr ?? null;
    const src = (v: typeof r.gold_usd, end: typeof usdEnd): YearSource | null =>
      v
        ? {
            series: v.series,
            frequency: v.frequency,
            date: agg === 'end' ? (end?.date ?? null) : null,
          }
        : null;
    if (agg === 'avg') {
      return {
        year: r.year,
        x: yearX(r.year, agg, until),
        partial,
        usd: r.gold_usd?.value ?? null,
        fx: r.usd_idr?.value ?? null,
        idr: r.idr_gram?.value ?? null,
        lm: r.antam_lm?.avg ?? null,
        usdSrc: src(r.gold_usd, usdEnd),
        fxSrc: src(r.usd_idr, fxEnd),
        idrMonths: r.idr_gram?.months ?? null,
      };
    }
    const usd = usdEnd?.value ?? null;
    const fx = fxEnd?.value ?? null;
    return {
      year: r.year,
      x: yearX(r.year, agg, until),
      partial,
      usd,
      fx,
      idr: usd !== null && fx !== null ? goldIdrGram(usd, fx) : null,
      lm: r.antam_lm?.end ?? null,
      usdSrc: src(r.gold_usd, usdEnd),
      fxSrc: src(r.usd_idr, fxEnd),
      idrMonths: null,
    };
  });
}

const SERIES_NAMES: Record<Series, string> = {
  xau_usd_oz: 'xaus',
  usd_idr_jisdor: 'JISDOR',
  usd_idr_ecb: 'ECB',
  usd_idr_annual: 'WDI',
};
const GOLD_MONTHLY_NAME = 'World Bank';
const FREQUENCY_WORDS: Record<Frequency, string> = { D: 'harian', M: 'bulanan', A: 'tahunan' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** "xaus · harian", "World Bank · bulanan", "WDI · tahunan"; untuk penutupan: tanggal/bulan titik yang dipakai. */
export function sourceLabel(src: YearSource | null, agg: Aggregation): string {
  if (!src) return '—';
  const name =
    src.series === 'xau_usd_oz' && src.frequency !== 'D'
      ? GOLD_MONTHLY_NAME
      : SERIES_NAMES[src.series];
  if (agg === 'avg') return `${name} · ${FREQUENCY_WORDS[src.frequency]}`;
  if (!src.date) return `${name} · ${FREQUENCY_WORDS[src.frequency]}`;
  const d = Number(src.date.slice(8, 10));
  const m = MONTHS[Number(src.date.slice(5, 7)) - 1] ?? '';
  if (src.frequency === 'D') return `${name} · harian, ${d} ${m}`;
  if (src.frequency === 'M') return `${name} · rata-rata ${m}`;
  return `${name} · rata-rata tahun (bukan penutupan)`;
}

// ---------------------------------------------------------------------------
// Titik spot hari ini

export interface SpotPoint {
  /** Hari kalender WIB pengambilan spot (untuk teks). */
  date: string;
  /** Posisi di sumbu X: `date`, digeser ke sehari setelah titik tahunan terakhir bila tidak lebih akhir. */
  x: string;
  usd: number;
  fx: number;
  idr: number;
}

export function spotPoint(spot: LatestSpot | null, lastX: string | null): SpotPoint | null {
  if (!spot) return null;
  const snap = spot.snapshot;
  const date = jakartaDateOf(new Date(snap.fetched_at));
  const x = lastX !== null && date <= lastX ? addDays(lastX, 1) : date;
  return { date, x, usd: snap.xau_usd_oz, fx: snap.usd_idr, idr: spot.idr_gram };
}

// ---------------------------------------------------------------------------
// Model grafik

export interface KLine {
  id: ConceptId;
  /** `[tanggal ISO, kelipatan]` sejak tahun dasar. */
  points: [string, number][];
  /** Kelipatan di titik spot hari ini; null bila tidak ada spot. */
  spot: [string, number] | null;
  /** Kelipatan terakhir (spot bila ada, jika tidak titik tahunan terakhir). */
  last: number | null;
  /** CAGR tahunan dari titik dasar ke titik terakhir. */
  cagr: number | null;
  /** Tahun yang dijadikan nilai 1 (Antam: bisa lebih akhir dari tahun dasar). */
  baseYear: number;
}

export interface KelipatanModel {
  rows: YearRow[];
  lines: Record<ConceptId, KLine | null>;
  spot: SpotPoint | null;
}

const KEY: Record<ConceptId, 'idr' | 'usd' | 'fx' | 'lm'> = {
  idr: 'idr',
  usd: 'usd',
  fx: 'fx',
  lm: 'lm',
};

/**
 * Garis satu konsep, diindeks ke `baseYear` (`index_t = value_t / value_base`, §6.1). Garis Antam
 * diindeks ke tahun dasar bila ≥ 2010, jika tidak ke tahun pertamanya (2010).
 */
export function buildLine(
  id: ConceptId,
  rows: readonly YearRow[],
  baseYear: number,
  spot: SpotPoint | null,
): KLine | null {
  const key = KEY[id];
  const base = id === 'lm' ? Math.max(baseYear, LM_FIRST_YEAR) : baseYear;
  const baseRow = rows.find((r) => r.year === base);
  const baseValue = baseRow?.[key] ?? null;
  if (!baseRow || baseValue === null || !(baseValue > 0)) return null;
  const points = rows
    .filter((r) => r.year >= base && r[key] !== null)
    .map((r): [string, number] => [r.x, r[key]! / baseValue]);
  if (points.length === 0) return null;
  const spotValue = id === 'lm' || !spot ? null : spot[id];
  const spotK: [string, number] | null =
    spot && spotValue !== null ? [spot.x, spotValue / baseValue] : null;
  const end = spotK ?? points.at(-1)!;
  return {
    id,
    points,
    spot: spotK,
    last: end[1],
    cagr: cagr(end[1], yearsBetween(baseRow.x, end[0])),
    baseYear: base,
  };
}

export function buildModel(
  annual: readonly AnnualRow[],
  until: string | null,
  spotSnapshot: LatestSpot | null,
  baseYear: number,
  agg: Aggregation,
): KelipatanModel {
  const rows = yearRows(annual, agg, until);
  const lastX = rows.filter((r) => r.idr !== null).at(-1)?.x ?? null;
  const spot = spotPoint(spotSnapshot, lastX);
  return {
    rows,
    spot,
    lines: {
      idr: buildLine('idr', rows, baseYear, spot),
      usd: buildLine('usd', rows, baseYear, spot),
      fx: buildLine('fx', rows, baseYear, spot),
      lm: buildLine('lm', rows, baseYear, spot),
    },
  };
}

// ---------------------------------------------------------------------------
// Sumbu log

const LOG_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000] as const;

/** Batas dan tick sumbu Y log (×1, ×2, ×5, ×10 …) yang memuat semua nilai. */
export function logAxis(values: readonly number[]): { min: number; max: number; ticks: number[] } {
  const finite = values.filter((v) => Number.isFinite(v) && v > 0);
  if (finite.length === 0) return { min: 0.5, max: 10, ticks: [0.5, 1, 2, 5, 10] };
  const lo = Math.min(...finite) * 0.9;
  const hi = Math.max(...finite) * 1.15;
  const min = [...LOG_STEPS].reverse().find((s) => s <= lo) ?? LOG_STEPS[0];
  const max = LOG_STEPS.find((s) => s >= hi) ?? LOG_STEPS.at(-1)!;
  return { min, max, ticks: LOG_STEPS.filter((s) => s >= min && s <= max) };
}
