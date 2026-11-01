import type { Brand, PriceSource, Product } from '@gold/schema';
import {
  BRAND_LABELS,
  colorToken,
  perGramPrice,
  selectSeries,
  weightKey,
  type ColorToken,
  type LatestFile,
  type LatestSeries,
  type SeriesFile,
} from './data';
import { formatWeight } from './format';

// Hitungan halaman Spread (FR-22). Spread % = (jual − buyback) / jual. Semua murni agar bisa diuji.

const DAY_MS = 86_400_000;

/** Spread dalam persen terhadap harga jual; null bila salah satu kosong atau jual ≤ 0. */
export function spreadPct(sell: number | null, buyback: number | null): number | null {
  if (sell === null || buyback === null || !(sell > 0)) return null;
  return ((sell - buyback) / sell) * 100;
}

/** Titik impas: kenaikan buyback (%) yang dibutuhkan agar buyback menyamai harga jual. */
export function breakEvenPct(sell: number, buyback: number): number | null {
  return buyback > 0 ? ((sell - buyback) / buyback) * 100 : null;
}

/** Satu hari dengan harga jual dan buyback sekaligus (rupiah per gram). */
export interface SpreadDay {
  date: string;
  sell: number;
  buyback: number;
  spread: number;
  pct: number;
}

interface Pt {
  date: string;
  value: number;
}

/** Gabungkan titik jual dan buyback menurut tanggal; hanya hari yang punya keduanya. */
export function joinDays(sell: Pt[], buyback: Pt[]): SpreadDay[] {
  const buy = new Map(buyback.map((p) => [p.date, p.value]));
  const out: SpreadDay[] = [];
  for (const p of sell) {
    const b = buy.get(p.date);
    if (b === undefined || !(p.value > 0)) continue;
    out.push({
      date: p.date,
      sell: p.value,
      buyback: b,
      spread: p.value - b,
      pct: ((p.value - b) / p.value) * 100,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Potong menurut rentang inklusif; `from` null = dari awal. */
export function sliceDays<T extends { date: string }>(
  days: T[],
  from: string | null,
  to: string,
): T[] {
  return days.filter((d) => (from === null || d.date >= from) && d.date <= to);
}

export interface SpreadStats {
  count: number;
  last: SpreadDay;
  avgPct: number;
  min: SpreadDay;
  breakEven: number | null;
}

export function spreadStats(days: SpreadDay[]): SpreadStats | null {
  const last = days.at(-1);
  if (!last) return null;
  let sum = 0;
  let min = last;
  for (const d of days) {
    sum += d.pct;
    if (d.pct < min.pct) min = d;
  }
  return {
    count: days.length,
    last,
    avgPct: sum / days.length,
    min,
    breakEven: breakEvenPct(last.sell, last.buyback),
  };
}

function addDay(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Celah di antara tanggal berurutan: run ≥ `minRun` hari kalender tanpa data. */
export function findGaps(dates: string[], minRun = 2): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1] as string;
    const cur = dates[i] as string;
    const run = Math.round((Date.parse(cur) - Date.parse(prev)) / DAY_MS) - 1;
    if (run >= minRun) out.push({ from: addDay(prev, 1), to: addDay(cur, -1) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pilihan sumber (beli di / jual ke)

export interface SpreadOption {
  id: string;
  label: string;
  /** Pendek untuk legenda dan keterangan. */
  short: string;
  source: PriceSource;
  brand: Brand;
  product: Product;
  file: string;
  /** Variant dibaca berurutan; yang awal menang bila tanggalnya sama (D-28). */
  variants: string[];
  w: number;
  color: ColorToken;
}

function opt(
  id: string,
  file: string,
  source: PriceSource,
  brand: Brand,
  product: Product,
  variants: string[],
  w: number,
  label: string,
  short: string,
): SpreadOption {
  return {
    id,
    file,
    source,
    brand,
    product,
    variants,
    w,
    label,
    short,
    color: colorToken({ brand, product }),
  };
}

/** Tahun produksi UBS Lifestyle berjalan dari latest. */
export function ubsYear(latest: LatestFile): string {
  const hit = latest.series.find(
    (s) => s.source === 'ubslifestyle' && s.variant !== '' && s.current && s.w === 1,
  );
  return hit?.variant ?? String(new Date().getUTCFullYear());
}

/** Pilihan harga jual ("beli di") dan buyback ("jual ke"). Batangan Pegadaian tanpa buyback (D-07). */
export function buildOptions(latest: LatestFile): {
  sell: SpreadOption[];
  buyback: SpreadOption[];
} {
  const y = ubsYear(latest);
  const lm = opt(
    'lm-antam',
    'logammulia-antam',
    'logammulia',
    'antam',
    'gold_bar',
    [''],
    1,
    'Logam Mulia · Antam · 1 g',
    'Logam Mulia',
  );
  const ubs = opt(
    'ubsl-ubs',
    'ubslifestyle-ubs',
    'ubslifestyle',
    'ubs',
    'gold_bar',
    [y],
    1,
    `UBS Lifestyle · UBS · 1 g · produksi ${y}`,
    'UBS Lifestyle',
  );
  const ubsBuy: SpreadOption = { ...ubs, variants: [y, ''] };
  const tab = opt(
    'tab',
    'pegadaian-pegadaian',
    'pegadaian',
    'pegadaian',
    'gold_savings',
    [''],
    0.01,
    'Pegadaian · Tabungan Emas · per gram',
    'Tabungan Emas',
  );
  const pg = (id: string, brand: Brand, name: string) =>
    opt(
      id,
      `pegadaian-${brand}`,
      'pegadaian',
      brand,
      'gold_bar',
      [''],
      1,
      `Pegadaian · ${name} · 1 g`,
      `Pegadaian ${name}`,
    );
  return {
    sell: [
      lm,
      pg('pg-antam', 'antam', 'Antam'),
      pg('pg-ubs', 'ubs', 'UBS'),
      ubs,
      pg('pg-g24', 'galeri24', 'Galeri24'),
      tab,
    ],
    buyback: [lm, ubsBuy, tab],
  };
}

/** Pasangan sah bila brand dan produk sama. */
export function compatible(sell: SpreadOption, buyback: SpreadOption): boolean {
  return sell.brand === buyback.brand && sell.product === buyback.product;
}

/** Penjelasan bila pasangan tidak bisa dihitung. */
export function pairProblem(sell: SpreadOption, buyback: SpreadOption): string | null {
  if (compatible(sell, buyback)) return null;
  return `Emas ${BRAND_LABELS[sell.brand]} yang dibeli di sini tidak bisa dijual kembali ke ${buyback.short}: buyback hanya berlaku untuk brand dan produk yang sama.`;
}

export const POPULAR_PAIRS: { sell: string; buyback: string; label: string }[] = [
  { sell: 'lm-antam', buyback: 'lm-antam', label: 'Antam: Logam Mulia → Logam Mulia' },
  { sell: 'pg-antam', buyback: 'lm-antam', label: 'Antam: Pegadaian → Logam Mulia' },
  { sell: 'pg-ubs', buyback: 'ubsl-ubs', label: 'UBS: Pegadaian → UBS Lifestyle' },
  { sell: 'ubsl-ubs', buyback: 'ubsl-ubs', label: 'UBS: UBS Lifestyle → UBS Lifestyle' },
  { sell: 'tab', buyback: 'tab', label: 'Tabungan Emas: Pegadaian → Pegadaian' },
];

/** Riwayat harga jual per gram dari file series ringkas. */
export function sellPoints(file: Pick<SeriesFile, 'rows'>, o: SpreadOption): Pt[] {
  return selectSeries(file, { variant: o.variants[0] as string, w: o.w, price: 'sell' }).map(
    (p) => ({ date: p.date, value: perGramPrice(p.value, o.w) as number }),
  );
}

/** Riwayat buyback per gram; beberapa variant digabung, variant awal menang. */
export function buybackPoints(file: Pick<SeriesFile, 'rows'>, o: SpreadOption): Pt[] {
  const by = new Map<string, number>();
  for (const v of [...o.variants].reverse()) {
    for (const p of selectSeries(file, { variant: v, w: o.w, price: 'buyback' })) {
      by.set(p.date, perGramPrice(p.value, o.w) as number);
    }
  }
  return [...by]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Hari dengan jual dari `sell` dan buyback dari `buy`; file boleh sama. */
export function pairDays(
  sell: SpreadOption,
  sellFile: Pick<SeriesFile, 'rows'>,
  buy: SpreadOption,
  buyFile: Pick<SeriesFile, 'rows'>,
): SpreadDay[] {
  return joinDays(sellPoints(sellFile, sell), buybackPoints(buyFile, buy));
}

// ---------------------------------------------------------------------------
// Snapshot hari ini dari latest.json

function findLatest(
  latest: LatestFile,
  o: SpreadOption,
  variant: string,
): LatestSeries | undefined {
  return latest.series.find(
    (s) =>
      s.file === o.file && s.variant === variant && weightKey(s.w) === weightKey(o.w) && s.current,
  );
}

export interface TodayPair {
  sell: number | null;
  sellDate: string | null;
  sellAt: string | null;
  buyback: number | null;
  buyDate: string | null;
  buyAt: string | null;
}

/** Jual dan buyback terbaru (per gram) dari latest.json untuk sepasang pilihan. */
export function todayPair(latest: LatestFile, sell: SpreadOption, buy: SpreadOption): TodayPair {
  const s = findLatest(latest, sell, sell.variants[0] as string);
  let b: LatestSeries | undefined;
  for (const v of buy.variants) {
    const c = findLatest(latest, buy, v);
    if (c && c.buyback !== null) {
      b = c;
      break;
    }
  }
  return {
    sell: s ? perGramPrice(s.sell, sell.w) : null,
    sellDate: s?.date ?? null,
    sellAt: s?.source_updated_at ?? null,
    buyback: b ? perGramPrice(b.buyback, buy.w) : null,
    buyDate: b?.date ?? null,
    buyAt: b?.source_updated_at ?? null,
  };
}

export interface WeightBarRow {
  label: string;
  w: number;
  value: number | null;
}

/** Spread % per gramasi hari ini untuk satu file + variant; gramasi tanpa buyback → null. */
export function weightSpreads(latest: LatestFile, file: string, variant: string): WeightBarRow[] {
  return latest.series
    .filter((s) => s.file === file && s.variant === variant && s.current)
    .sort((a, b) => a.w - b.w)
    .map((s) => ({ label: formatWeight(s.w), w: s.w, value: spreadPct(s.sell, s.buyback) }));
}

export interface CompareItem {
  name: string;
  src: string;
  color: ColorToken;
  sell: number | null;
  buyback: number | null;
  pct: number | null;
  source: PriceSource;
  date: string | null;
  at: string | null;
}

/** Kartu "emas fisik vs tabungan emas": spread per gram hari ini. */
export function compareItems(latest: LatestFile): CompareItem[] {
  const { sell, buyback } = buildOptions(latest);
  const get = (id: string, list: SpreadOption[]) => list.find((o) => o.id === id) as SpreadOption;
  const rows: [string, string, string, string][] = [
    ['Tabungan Emas', 'Pegadaian · per gram', 'tab', 'tab'],
    ['Antam 1 g', 'Logam Mulia', 'lm-antam', 'lm-antam'],
    ['UBS 1 g', 'UBS Lifestyle', 'ubsl-ubs', 'ubsl-ubs'],
    ['UBS 1 g', 'Pegadaian → UBS Lifestyle', 'pg-ubs', 'ubsl-ubs'],
    ['Antam 1 g', 'Pegadaian → Logam Mulia', 'pg-antam', 'lm-antam'],
  ];
  return rows.map(([name, src, sid, bid]) => {
    const s = get(sid, sell);
    const t = todayPair(latest, s, get(bid, buyback));
    return {
      name,
      src,
      color: s.color,
      sell: t.sell,
      buyback: t.buyback,
      pct: spreadPct(t.sell, t.buyback),
      source: s.source,
      date: t.sellDate,
      at: t.sellAt,
    };
  });
}
