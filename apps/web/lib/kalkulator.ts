import { COMPARE_DEFS, findOption, type CompareDef } from './bandingkan';
import type { SeriesPoint } from './data';
import { chartPoints, type ExplorerOption } from './explorer';
import { asOf as asOfPoint, type Point } from './forward-fill';
import { formatNumber } from './format';

// Logika murni halaman Kalkulator (P4-06; FR-31): pilihan sumber beli/jual yang ada di data,
// keadaan di URL, harga beli pada tanggal X (nilai terakhir ≤ X, toleransi 7 hari), hasil
// untung/rugi, titik impas, dan titik grafik. Tanpa React/ECharts dan tanpa nilai dari
// @gold/schema (aman untuk bundel klien).

/** Sama dengan CALCULATOR_TOLERANCE_DAYS di @gold/schema (kesetaraan diuji). */
export const CALCULATOR_TOLERANCE_DAYS = 7;
/** CAGR hanya ditampilkan bila masa simpan sedikitnya ini (hari); lebih pendek menyesatkan. */
export const CAGR_MIN_DAYS = 30;
export const MAX_QTY = 100_000;
export const DEFAULT_BUY_ID = 'lm-antam';
export const DEFAULT_WEIGHT = 1;
export const DEFAULT_QTY = 1;

const DAY_MS = 86_400_000;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function isIsoDate(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
  );
}

/** Tanggal yang sama satu tahun sebelumnya (29 Feb → 28 Feb). */
export function yearAgo(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export function defById(id: string | null | undefined): CompareDef | null {
  return COMPARE_DEFS.find((d) => d.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Pilihan yang ada di data

/** Berat emas fisik yang dijual (ada harga jual) oleh sedikitnya satu sumber, urut naik. */
function physicalWeights(options: readonly ExplorerOption[]): number[] {
  const set = new Set<number>();
  for (const d of COMPARE_DEFS) {
    if (d.linear) continue;
    for (const o of options) {
      if (o.source === d.source && o.brand === d.brand && o.product === d.product) {
        if (o.first.sell !== null) set.add(o.w);
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** Gramasi yang bisa dibeli di sumber ini; Tabungan Emas (linear) melayani semua berat fisik. */
export function weightsFor(d: CompareDef, options: readonly ExplorerOption[]): number[] {
  if (d.linear) return findOption(d, 1, options)?.first.sell ? physicalWeights(options) : [];
  const set = new Set<number>();
  for (const o of options) {
    if (o.source === d.source && o.brand === d.brand && o.product === d.product) {
      if (o.first.sell !== null) set.add(o.w);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** Sumber yang punya harga jual (bisa dipilih sebagai tempat beli). */
export function buyDefs(options: readonly ExplorerOption[]): CompareDef[] {
  return COMPARE_DEFS.filter((d) => weightsFor(d, options).length > 0);
}

/**
 * Tempat menjual kembali: brand dan produk yang sama dengan tempat beli (emas Antam hanya dibeli
 * kembali sebagai Antam, tabungan sebagai tabungan). Urut mengikuti `COMPARE_DEFS`.
 */
export function sellCandidates(buy: CompareDef): CompareDef[] {
  return COMPARE_DEFS.filter((d) => d.brand === buy.brand && d.product === buy.product);
}

/** Ada buyback untuk berat ini? (Buyback Logam Mulia hanya 1 g; batangan Pegadaian tidak ada.) */
export function sellAvailable(d: CompareDef, w: number, options: readonly ExplorerOption[]) {
  const o = findOption(d, w, options);
  return o !== null && o.first.buyback !== null;
}

// ---------------------------------------------------------------------------
// Keadaan di URL: ?d=2025-11-07&b=lm-antam&w=1&q=1&s=lm-antam   (bawaan tidak ditulis)

export interface CalcState {
  /** Tanggal beli `YYYY-MM-DD`. */
  date: string;
  buyId: string;
  w: number;
  qty: number;
  /** null = tak ada sumber buyback untuk kombinasi ini. */
  sellId: string | null;
}

export interface CalcContext {
  options: readonly ExplorerOption[];
  /** Tanggal data terbaru. */
  asOf: string;
}

export interface RawState {
  d?: string | null;
  b?: string | null;
  w?: string | null;
  q?: string | null;
  s?: string | null;
}

/** Bawaan: beli 1 tahun lalu, Antam LM 1 g, 1 keping, jual ke buyback Antam LM. */
export function defaultDate(asOf: string): string {
  return yearAgo(asOf);
}

/**
 * Rapikan keadaan mentah: kombinasi yang tidak ada di data diganti pilihan terdekat yang sah.
 * Tanggal setelah data terbaru dipotong ke data terbaru.
 */
export function normalizeState(
  raw: {
    date?: string | null;
    buyId?: string | null;
    w?: number | null;
    qty?: number | null;
    sellId?: string | null;
  },
  ctx: CalcContext,
): CalcState {
  const date = raw.date && isIsoDate(raw.date) ? raw.date : defaultDate(ctx.asOf);
  const buys = buyDefs(ctx.options);
  const buy =
    buys.find((d) => d.id === raw.buyId) ?? buys.find((d) => d.id === DEFAULT_BUY_ID) ?? buys[0];
  const qty =
    raw.qty && Number.isInteger(raw.qty) && raw.qty >= 1 ? Math.min(raw.qty, MAX_QTY) : DEFAULT_QTY;
  if (!buy) {
    return {
      date: date > ctx.asOf ? ctx.asOf : date,
      buyId: DEFAULT_BUY_ID,
      w: DEFAULT_WEIGHT,
      qty,
      sellId: null,
    };
  }
  const weights = weightsFor(buy, ctx.options);
  const w =
    raw.w && weights.includes(raw.w)
      ? raw.w
      : weights.includes(DEFAULT_WEIGHT)
        ? DEFAULT_WEIGHT
        : weights[0]!;
  const sells = sellCandidates(buy).filter((d) => sellAvailable(d, w, ctx.options));
  const sell = sells.find((d) => d.id === raw.sellId) ?? sells[0] ?? null;
  return {
    date: date > ctx.asOf ? ctx.asOf : date,
    buyId: buy.id,
    w,
    qty,
    sellId: sell?.id ?? null,
  };
}

export function decodeState(raw: RawState, ctx: CalcContext): CalcState {
  const w = Number(raw.w);
  const q = Number(raw.q);
  return normalizeState(
    {
      date: raw.d,
      buyId: raw.b,
      w: raw.w && Number.isFinite(w) ? w : null,
      qty: raw.q && Number.isFinite(q) ? q : null,
      sellId: raw.s,
    },
    ctx,
  );
}

/**
 * Keadaan → parameter URL; nilai bawaan menjadi null (tidak ditulis). Sumber jual yang sama
 * dengan pilihan otomatis (sumber pertama yang punya buyback) juga tidak ditulis.
 */
export function encodeState(
  s: CalcState,
  ctx: CalcContext,
): Required<Record<keyof RawState, string | null>> {
  const autoSell = normalizeState({ ...s, sellId: null }, ctx).sellId;
  return {
    d: s.date === defaultDate(ctx.asOf) ? null : s.date,
    b: s.buyId === DEFAULT_BUY_ID ? null : s.buyId,
    w: s.w === DEFAULT_WEIGHT ? null : String(s.w),
    q: s.qty === DEFAULT_QTY ? null : String(s.qty),
    s: s.sellId === null || s.sellId === autoSell ? null : s.sellId,
  };
}

// ---------------------------------------------------------------------------
// Harga

/**
 * Harga per keping dari titik series. Tabungan Emas (`linear`) tercatat per gram (D-30) →
 * keping berat `w` = per gram × w, dibulatkan ke rupiah.
 */
export function piecePoints(points: readonly SeriesPoint[], linear: boolean, w: number): Point[] {
  return points.map((p) => ({ date: p.date, value: linear ? Math.round(p.value * w) : p.value }));
}

/** Harga pada tanggal `date`: nilai terakhir ≤ `date` dalam toleransi 7 hari (DATA-MODEL §6.2). */
export function priceOn(points: readonly Point[], date: string): Point | null {
  return asOfPoint(points, date, CALCULATOR_TOLERANCE_DAYS);
}

export type BuyQuote =
  | { ok: true; date: string; price: number; daysOff: number }
  | {
      ok: false;
      /** `empty` tak ada data; `before` tanggal sebelum data pertama; `gap` ada celah > toleransi;
       *  `after` tanggal jauh setelah data terakhir. */
      reason: 'empty' | 'before' | 'gap' | 'after';
      /** Tanggal data pertama / terakhir; null bila kosong. */
      first: string | null;
      last: string | null;
      /** Tanggal terdekat yang punya harga (untuk saran "Pakai tanggal ini"). */
      suggest: string | null;
    };

export function buyQuote(points: readonly Point[], date: string): BuyQuote {
  const hit = priceOn(points, date);
  if (hit)
    return { ok: true, date: hit.date, price: hit.value, daysOff: daysBetween(hit.date, date) };
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last)
    return { ok: false, reason: 'empty', first: null, last: null, suggest: null };
  if (date < first.date) {
    return { ok: false, reason: 'before', first: first.date, last: last.date, suggest: first.date };
  }
  const prev = [...points].reverse().find((p) => p.date <= date);
  return {
    ok: false,
    reason: date > last.date ? 'after' : 'gap',
    first: first.date,
    last: last.date,
    suggest: prev?.date ?? first.date,
  };
}

/** Harga buyback terbaru ("nilai sekarang"); null bila tak ada data. */
export function latestPoint(points: readonly Point[]): Point | null {
  return points.at(-1) ?? null;
}

// ---------------------------------------------------------------------------
// Hasil

export interface Outcome {
  qty: number;
  buyDate: string;
  buyPrice: number;
  sellDate: string;
  sellPrice: number;
  modal: number;
  value: number;
  profit: number;
  /** Persen terhadap modal. */
  profitPct: number;
  holdDays: number;
  /** Pertumbuhan tahunan majemuk (pecahan, 0,05 = 5%); null bila masa simpan < 30 hari. */
  cagr: number | null;
  /** Buyback per keping yang dibutuhkan untuk impas = harga beli. */
  breakEvenPrice: number;
  /** Kenaikan buyback (%) dari harga sekarang agar impas; ≤ 0 bila sudah di atas impas. */
  breakEvenGapPct: number;
}

export function outcome(
  buy: { date: string; price: number },
  sell: { date: string; price: number },
  qty: number,
): Outcome {
  const modal = qty * buy.price;
  const value = qty * sell.price;
  const holdDays = daysBetween(buy.date, sell.date);
  const cagr =
    holdDays >= CAGR_MIN_DAYS && modal > 0 && value > 0
      ? Math.pow(value / modal, 365 / holdDays) - 1
      : null;
  return {
    qty,
    buyDate: buy.date,
    buyPrice: buy.price,
    sellDate: sell.date,
    sellPrice: sell.price,
    modal,
    value,
    profit: value - modal,
    profitPct: modal > 0 ? ((value - modal) / modal) * 100 : 0,
    holdDays,
    cagr,
    breakEvenPrice: buy.price,
    breakEvenGapPct: sell.price > 0 ? (buy.price / sell.price - 1) * 100 : 0,
  };
}

/** "12 hari", "8 bulan", "2,5 tahun". */
export function formatHold(days: number): string {
  if (days < 45) return `${Math.max(0, days)} hari`;
  if (days < 730) return `${Math.round(days / 30.4)} bulan`;
  return `${formatNumber(Math.round((days / 365.25) * 10) / 10, 1).replace(',0', '')} tahun`;
}

// ---------------------------------------------------------------------------
// Titik impas

export interface BreakEven {
  /** Buyback per keping yang dibutuhkan. */
  price: number;
  /** Buyback terbaru sudah ≥ harga beli. */
  reached: boolean;
  /** Awal rangkaian terakhir hari-hari dengan buyback ≥ harga beli sampai kini (jika `reached`). */
  since: string | null;
  /** Tanggal terakhir buyback ≥ harga beli setelah tanggal beli; null = tak pernah. */
  lastAbove: string | null;
  /** Data buyback baru mulai jauh setelah tanggal beli: tanggal impas sebelum itu tak diketahui. */
  truncated: boolean;
  firstDate: string | null;
}

/** `sellPoints` = buyback per keping, terurut naik. Hanya titik ≥ tanggal beli yang dipakai. */
export function breakEven(
  sellPoints: readonly Point[],
  buyDate: string,
  buyPrice: number,
): BreakEven {
  const pts = sellPoints.filter((p) => p.date >= buyDate);
  const first = pts[0] ?? null;
  const out: BreakEven = {
    price: buyPrice,
    reached: false,
    since: null,
    lastAbove: null,
    truncated: first !== null && daysBetween(buyDate, first.date) > CALCULATOR_TOLERANCE_DAYS,
    firstDate: first?.date ?? null,
  };
  let runStart: string | null = null;
  for (const p of pts) {
    if (p.value >= buyPrice) {
      runStart ??= p.date;
      out.lastAbove = p.date;
    } else {
      runStart = null;
    }
  }
  const last = pts.at(-1);
  if (last && last.value >= buyPrice) {
    out.reached = true;
    out.since = runStart;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Grafik

export interface CalcChart {
  /** Nilai jual (qty × buyback) sejak tanggal beli; celah diberi satu `null` per celah. */
  value: [string, number | null][];
  /** Garis modal datar dari titik pertama sampai terakhir. */
  modal: [string, number][];
  gaps: { from: string; to: string }[];
  first: string | null;
  last: string | null;
}

export function chartModel(
  sellPoints: readonly Point[],
  qty: number,
  buyDate: string,
  modal: number,
  isExpected?: (date: string) => boolean,
): CalcChart {
  const pts = sellPoints
    .filter((p) => p.date >= buyDate)
    .map((p) => ({ date: p.date, value: p.value * qty }));
  const first = pts[0]?.date ?? null;
  const last = pts.at(-1)?.date ?? null;
  const { points, gaps } = chartPoints(pts, isExpected);
  return {
    value: points,
    modal:
      first && last
        ? [
            [first, modal],
            [last, modal],
          ]
        : [],
    gaps,
    first,
    last,
  };
}
