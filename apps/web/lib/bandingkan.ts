import type { Brand, PriceSource, Product } from '@gold/schema';
import {
  displayBrand,
  perGramPrice,
  SOURCE_LABELS,
  weightKey,
  type ColorToken,
  type LatestFile,
  type PremiumAntamTuple,
  type SeriesFile,
} from './data';
import {
  aggregateClose,
  applyMode,
  gramDivisor,
  seriesPoints,
  viewChartPoints,
  type ExplorerOption,
} from './explorer';
import { findGaps, spreadPct } from './spread';

// Logika murni halaman Bandingkan (P4-05, P4-09; FR-30, FR-33): pencocokan series antar sumber
// pada berat yang sama, titik grafik per gram / indeks, tabel hari ini, dan statistik premi.
// Tanpa React/ECharts dan tanpa nilai dari @gold/schema (aman untuk bundel klien).

// ---------------------------------------------------------------------------
// Series yang dibandingkan

export interface CompareDef {
  id: string;
  /** Nama tampilan brand ("Antam", "Tabungan Emas"). */
  brandName: string;
  sourceName: string;
  /** "Antam · Logam Mulia". */
  label: string;
  source: PriceSource;
  brand: Brand;
  product: Product;
  /** Id file series (`logammulia-antam`). */
  file: string;
  color: ColorToken;
  /** Putus-putus = harga di Pegadaian (konvensi mockup). */
  dashed: boolean;
  /** Harganya linear terhadap berat (Tabungan Emas): satu series melayani semua gramasi. */
  linear: boolean;
}

function def(
  id: string,
  source: PriceSource,
  brand: Brand,
  product: Product,
  color: ColorToken,
  dashed: boolean,
  linear = false,
): CompareDef {
  const brandName = displayBrand({ brand, product });
  const sourceName = SOURCE_LABELS[source];
  return {
    id,
    brandName,
    sourceName,
    label: `${brandName} · ${sourceName}`,
    source,
    brand,
    product,
    file: `${source}-${brand}`,
    color,
    dashed,
    linear,
  };
}

/** Enam series, urut mockup. */
export const COMPARE_DEFS: readonly CompareDef[] = [
  def('lm-antam', 'logammulia', 'antam', 'gold_bar', 'antam', false),
  def('pg-antam', 'pegadaian', 'antam', 'gold_bar', 'antam', true),
  def('ubsl-ubs', 'ubslifestyle', 'ubs', 'gold_bar', 'ubs', false),
  def('pg-ubs', 'pegadaian', 'ubs', 'gold_bar', 'ubs', true),
  def('pg-g24', 'pegadaian', 'galeri24', 'gold_bar', 'g24', false),
  def('tab', 'pegadaian', 'pegadaian', 'gold_savings', 'tab', false, true),
];

export const DEFAULT_WEIGHT = 1;
export type CompareMode = 'gram' | 'index';
export const DEFAULT_MODE: CompareMode = 'gram';

/** Opsi katalog satu series pada berat `w`; null bila sumber tidak menjual berat itu. */
export function findOption(
  d: CompareDef,
  w: number,
  options: readonly ExplorerOption[],
): ExplorerOption | null {
  return (
    options.find(
      (o) =>
        o.source === d.source &&
        o.brand === d.brand &&
        o.product === d.product &&
        (d.linear || o.w === w),
    ) ?? null
  );
}

/** Hanya opsi yang dipakai halaman ini (mengurangi muatan props). */
export function compareOptions(options: readonly ExplorerOption[]): ExplorerOption[] {
  return options.filter((o) =>
    COMPARE_DEFS.some(
      (d) => d.source === o.source && d.brand === o.brand && d.product === o.product,
    ),
  );
}

/**
 * Gramasi yang bisa dipilih: berat emas fisik yang dijual oleh sedikitnya dua series (kalau
 * hanya satu, tak ada yang dibandingkan). Tabungan Emas melayani semua berat.
 */
export function compareWeights(options: readonly ExplorerOption[]): number[] {
  const count = new Map<number, number>();
  for (const d of COMPARE_DEFS) {
    if (d.linear) continue;
    for (const o of options) {
      if (o.source === d.source && o.brand === d.brand && o.product === d.product) {
        count.set(o.w, (count.get(o.w) ?? 0) + 1);
      }
    }
  }
  return [...count]
    .filter(([, n]) => n >= 2)
    .map(([w]) => w)
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// URL: ?w=5&m=idx&r=6B   (bawaan: 1 g, per gram, 1T tidak ditulis)

export function decodeWeight(param: string | null | undefined, weights: readonly number[]): number {
  const w = Number(param);
  return param && weights.includes(w) ? w : DEFAULT_WEIGHT;
}
export const encodeWeight = (w: number): string | null =>
  w === DEFAULT_WEIGHT ? null : weightKey(w);

export function decodeCompareMode(param: string | null | undefined): CompareMode {
  return param === 'idx' ? 'index' : DEFAULT_MODE;
}
export const encodeCompareMode = (m: CompareMode): string | null => (m === 'index' ? 'idx' : null);

// ---------------------------------------------------------------------------
// Garis grafik

export interface CompareLine {
  /** Titik grafik: tiap celah diberi satu `null` di hari pertamanya (garis terputus). */
  points: [string, number | null][];
  gaps: { from: string; to: string }[];
  /** Tanggal titik pertama di rentang; null = tak ada data. */
  first: string | null;
}

/**
 * Garis satu series pada rentang `[from, to]`. Per gram: harga ÷ berat (Tabungan Emas sudah per
 * gram). Indeks: titik pertama di rentang = 100. Series yang mulai belakangan mulai dari tanggal
 * pertamanya. Celah dihitung dari hari terbit sumber (`isExpected`).
 */
export function compareLine(
  opt: ExplorerOption,
  file: Pick<SeriesFile, 'rows'>,
  mode: CompareMode,
  from: string | null,
  to: string,
  isExpected?: (date: string) => boolean,
): CompareLine {
  const raw = seriesPoints(file, opt, 'sell');
  const vp = applyMode(
    aggregateClose(raw, 'd'),
    mode === 'index' ? 'index' : 'gram',
    gramDivisor(opt),
    from,
    to,
  ).filter((p) => (from === null || p.date >= from) && p.date <= to);
  const gaps = findGaps(
    vp.map((p) => p.date),
    2,
    isExpected,
  );
  return { points: viewChartPoints(vp, gaps, false), gaps, first: vp[0]?.date ?? null };
}

// ---------------------------------------------------------------------------
// Tabel hari ini

export interface TodayCell {
  /** Rupiah apa adanya per keping (emas fisik) atau per gram (Tabungan Emas). */
  sell: number | null;
  buyback: number | null;
  date: string;
  at: string | null;
}

/** Kunci sel: berat (`weightKey`) untuk emas fisik, `linear` untuk Tabungan Emas. */
export type TodayCells = Record<string, Record<string, TodayCell>>;

/**
 * Harga terbaru semua series dari latest.json. Beberapa variant (tahun produksi UBS) digabung:
 * yang awal menang, kolom kosong diisi variant berikutnya. Hanya series yang masih `current`.
 */
export function todayCells(latest: LatestFile): TodayCells {
  const out: TodayCells = {};
  for (const d of COMPARE_DEFS) {
    const rows = latest.series
      .filter(
        (s) =>
          s.file === d.file &&
          s.source === d.source &&
          s.brand === d.brand &&
          s.product === d.product &&
          s.current,
      )
      .sort((a, b) => (a.variant < b.variant ? 1 : a.variant > b.variant ? -1 : 0));
    const cells: Record<string, TodayCell> = {};
    for (const s of rows) {
      const key = d.linear ? 'linear' : weightKey(s.w);
      const sell = d.linear ? perGramPrice(s.sell, s.w) : s.sell;
      const buyback = d.linear ? perGramPrice(s.buyback, s.w) : s.buyback;
      const cur = cells[key];
      if (!cur) cells[key] = { sell, buyback, date: s.date, at: s.source_updated_at };
      else {
        cur.sell ??= sell;
        cur.buyback ??= buyback;
      }
    }
    out[d.id] = cells;
  }
  return out;
}

export interface TodayRow {
  def: CompareDef;
  /** Harga jual untuk berat terpilih (Tabungan Emas = harga per gram × berat). */
  sell: number;
  perGram: number;
  buyback: number | null;
  /** Spread jual–buyback dalam persen; null bila buyback tidak ditampilkan sumber. */
  spreadPct: number | null;
  /** Selisih harga per gram terhadap yang termurah, persen (0 untuk yang termurah). */
  diffPct: number;
  cheapest: boolean;
  date: string;
  at: string | null;
}

/** Baris tabel hari ini untuk berat `w`, urut harga per gram termurah. */
export function todayRows(cells: TodayCells, w: number): TodayRow[] {
  const raw: Omit<TodayRow, 'diffPct' | 'cheapest'>[] = [];
  for (const d of COMPARE_DEFS) {
    const c = cells[d.id]?.[d.linear ? 'linear' : weightKey(w)];
    if (!c || c.sell === null) continue;
    const sell = d.linear ? Math.round(c.sell * w) : c.sell;
    const buyback = c.buyback === null ? null : d.linear ? Math.round(c.buyback * w) : c.buyback;
    raw.push({
      def: d,
      sell,
      perGram: d.linear ? c.sell : sell / w,
      buyback,
      spreadPct: spreadPct(sell, buyback),
      date: c.date,
      at: c.at,
    });
  }
  raw.sort((a, b) => a.perGram - b.perGram);
  const min = raw[0]?.perGram ?? 0;
  return raw.map((r) => ({
    ...r,
    diffPct: min > 0 ? (r.perGram / min - 1) * 100 : 0,
    cheapest: r.perGram === min,
  }));
}

// ---------------------------------------------------------------------------
// Premi Antam vs spot (derived/premium-antam.json)

export interface PremiumStats {
  count: number;
  firstDate: string;
  last: { date: string; pct: number; spotDate: string };
  avgPct: number;
  min: { date: string; pct: number };
  max: { date: string; pct: number };
}

export function premiumStats(rows: readonly PremiumAntamTuple[]): PremiumStats | null {
  const first = rows[0];
  const lastRow = rows.at(-1);
  if (!first || !lastRow) return null;
  let sum = 0;
  let min = first;
  let max = first;
  for (const r of rows) {
    sum += r[1];
    if (r[1] < min[1]) min = r;
    if (r[1] > max[1]) max = r;
  }
  return {
    count: rows.length,
    firstDate: first[0],
    last: { date: lastRow[0], pct: lastRow[1], spotDate: lastRow[2] },
    avgPct: sum / rows.length,
    min: { date: min[0], pct: min[1] },
    max: { date: max[0], pct: max[1] },
  };
}
