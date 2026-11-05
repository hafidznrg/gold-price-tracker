import {
  addDaysIso,
  aggregate,
  goldIdrGram,
  goldIdrGramSeries,
  macroPoints,
  premium,
  premiumAt,
  seriesForConcept,
  usdIdrLookup,
  type AggregatePoint,
  type MacroRow,
  type MacroSeriesConfig,
  type Point,
  type PriceRow,
} from '@gold/schema';

// P2-12 / G2 — cek silang data makro: kelipatan 1996 → kini (rata-rata tahunan), identitas
// Rp/gram = US$/oz × kurs, dan premi Antam di tanggal sampel. Semua fungsi murni; skrip
// `scripts/check-macro.ts` hanya membaca data/ dan mencetak laporan. Rumus dan aturan
// penggabungan dari derive.ts (DATA-MODEL §6), tidak diulang di sini.

/** Tanggal grafik pembanding dan kelipatannya (rata-rata tahunan 1996 → 2026). */
export const REFERENCE = {
  asOf: '2026-10-23',
  baseYear: 1996,
  goldIdrGram: 80,
  goldUsdOz: 10.3,
  usdIdr: 7.7,
} as const;

/** Selisih maksimum identitas kelipatan (G2: sisa pembulatan). */
export const IDENTITY_TOLERANCE = 0.01;
/** Di atas ini selisih terhadap grafik referensi ditandai untuk dijelaskan. */
export const REFERENCE_FLAG = 0.05;

type Input = Pick<MacroRow, 'date' | 'series' | 'frequency' | 'value'>;
type Config = Pick<MacroSeriesConfig, 'id' | 'concept' | 'precedence'>;

export interface YearRow {
  year: number;
  goldUsd: AggregatePoint | null;
  usdIdr: AggregatePoint | null;
  /** Rata-rata bulanan `gold_idr_gram` (emas bulanan × kurs bulanan); null bila tak ada bulan berpasangan. */
  goldIdr: { value: number; months: number } | null;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Rata-rata tahunan emas US$/oz dan kurs (resolusi frekuensi D → M → A, derive.aggregate), serta
 * Rp/gram: tidak ada seri Rp/gram untuk 1996, jadi diturunkan per bulan (`xau_usd_oz × usd_idr /
 * 31,1034768`, DATA-MODEL §6.1) lalu dirata-ratakan per tahun. Menurunkan per bulan, bukan
 * mengalikan dua rata-rata tahunan, membuat identitas kelipatan benar-benar diuji.
 */
export function annualTable(
  rows: readonly Input[],
  configs: readonly Config[],
  until: string,
): YearRow[] {
  const opts = { until };
  const goldY = aggregate(rows, configs, 'gold_usd', 'year', opts);
  const fxY = aggregate(rows, configs, 'usd_idr', 'year', opts);
  const goldM = new Map(
    aggregate(rows, configs, 'gold_usd', 'month', opts).map((p) => [p.period, p.value]),
  );
  const idrByYear = new Map<number, number[]>();
  for (const fx of aggregate(rows, configs, 'usd_idr', 'month', opts)) {
    const gold = goldM.get(fx.period);
    if (gold === undefined) continue;
    const year = Number(fx.period.slice(0, 4));
    idrByYear.set(year, [...(idrByYear.get(year) ?? []), goldIdrGram(gold, fx.value)]);
  }
  const years = new Set([...goldY, ...fxY].map((p) => Number(p.period)));
  return [...years]
    .sort((a, b) => a - b)
    .map((year) => {
      const idr = idrByYear.get(year);
      return {
        year,
        goldUsd: goldY.find((p) => Number(p.period) === year) ?? null,
        usdIdr: fxY.find((p) => Number(p.period) === year) ?? null,
        goldIdr: idr ? { value: mean(idr), months: idr.length } : null,
      };
    });
}

/** Tahun dari `from` sampai `to` yang kehilangan emas US$/oz atau kurs (G2 butir 1). */
export function missingYears(table: readonly YearRow[], from: number, to: number): number[] {
  const missing: number[] = [];
  for (let y = from; y <= to; y++) {
    const row = table.find((r) => r.year === y);
    if (!row?.goldUsd || !row.usdIdr) missing.push(y);
  }
  return missing;
}

export interface Multiples {
  goldIdrGram: number;
  goldUsdOz: number;
  usdIdr: number;
  /** `goldUsdOz × usdIdr`: yang seharusnya sama dengan `goldIdrGram`. */
  product: number;
  /** `|goldIdrGram − product| / product`. */
  residual: number;
}

/** Kelipatan `endYear` terhadap `baseYear`; null bila salah satu tahun tak lengkap. */
export function multiples(
  table: readonly YearRow[],
  baseYear: number,
  endYear: number,
): Multiples | null {
  const a = table.find((r) => r.year === baseYear);
  const b = table.find((r) => r.year === endYear);
  if (!a?.goldUsd || !a.usdIdr || !a.goldIdr || !b?.goldUsd || !b.usdIdr || !b.goldIdr) {
    return null;
  }
  const goldUsdOz = b.goldUsd.value / a.goldUsd.value;
  const usdIdr = b.usdIdr.value / a.usdIdr.value;
  const goldIdrGramMultiple = b.goldIdr.value / a.goldIdr.value;
  const product = goldUsdOz * usdIdr;
  return {
    goldIdrGram: goldIdrGramMultiple,
    goldUsdOz,
    usdIdr,
    product,
    residual: Math.abs(goldIdrGramMultiple - product) / product,
  };
}

/** Selisih relatif nilai terhadap acuan, mis. 0,03 = 3% lebih tinggi. */
export const relDiff = (value: number, reference: number) => value / reference - 1;

// ---------------------------------------------------------------------------
// Premi Antam

/** PRNG deterministik (mulberry32) agar sampel "acak" dapat diulang dengan `--seed`. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` elemen berbeda dari `items` (urutan asli dipertahankan); semua bila `items` lebih sedikit. */
export function sample<T>(items: readonly T[], n: number, seed: number): T[] {
  const rand = rng(seed);
  const idx = items.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((i) => items[i]!);
}

type AntamRow = Pick<PriceRow, 'date' | 'source' | 'brand' | 'product' | 'weight_g' | 'sell_price'>;

/** Harga jual Logam Mulia Antam 1 g per tanggal (satu per tanggal), terurut. */
export function antamSellSeries(prices: readonly AntamRow[]): Point[] {
  const byDate = new Map<string, number>();
  for (const r of prices) {
    if (r.source !== 'logammulia' || r.brand !== 'antam' || r.product !== 'gold_bar') continue;
    if (r.weight_g === 1 && r.sell_price !== null) byDate.set(r.date, r.sell_price);
  }
  return [...byDate]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface PremiumSample {
  date: string;
  sell_price: number;
  premium: number;
  /** Rp/gram spot yang dibandingkan. */
  spot_idr_gram: number;
  /** Tanggal penutupan (basis D) atau bulan `YYYY-MM` (basis M) yang dipakai. */
  spot_date: string;
  /** `D`: penutupan harian tanggal terakhir < date; `M`: rata-rata bulan itu (proksi, tanpa data harian). */
  basis: 'D' | 'M';
  xau_usd_oz: number;
  usd_idr: number;
}

/**
 * Premi Antam pada `date`. Utama: spot harian (derive.premiumAt, aturan < d). Bila emas harian
 * tidak ada, proksi dari emas `M` bulan tanggal itu × kurs terakhir < d (basis `M`; kasar, hanya
 * untuk tanggal sebelum histori harian xaus).
 */
export function premiumSampleAt(
  date: string,
  sellPrice: number,
  rows: readonly Input[],
  configs: readonly Config[],
): PremiumSample | null {
  const daily = goldIdrGramSeries(rows, configs);
  const hit = premiumAt(sellPrice, date, daily);
  if (hit) {
    const spot = daily.find((p) => p.date === hit.spot_date)!;
    return {
      date,
      sell_price: sellPrice,
      premium: hit.value,
      spot_idr_gram: spot.value,
      spot_date: spot.date,
      basis: 'D',
      xau_usd_oz: spot.xau_usd_oz,
      usd_idr: spot.usd_idr,
    };
  }
  const fx = usdIdrLookup(rows, configs);
  for (const series of seriesForConcept(configs, 'gold_usd')) {
    const month = macroPoints(rows, series, 'M').find(
      (p) => p.date.slice(0, 7) === date.slice(0, 7),
    );
    const rate = month && fx(addDaysIso(date, -1));
    if (!month || !rate) continue;
    const spot = goldIdrGram(month.value, rate.value);
    return {
      date,
      sell_price: sellPrice,
      premium: premium(sellPrice, spot),
      spot_idr_gram: spot,
      spot_date: month.date.slice(0, 7),
      basis: 'M',
      xau_usd_oz: month.value,
      usd_idr: rate.value,
    };
  }
  return null;
}

/** Median dari daftar tak kosong. */
export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Rentang premi yang masuk akal untuk emas batangan ritel (di luar = curiga, bukan galat). */
export const PLAUSIBLE_PREMIUM = { min: 0, max: 0.2 } as const;
export const isPlausiblePremium = (p: number) =>
  p > PLAUSIBLE_PREMIUM.min && p <= PLAUSIBLE_PREMIUM.max;

// ---------------------------------------------------------------------------
// Titik akhir

export interface EndpointMultiples extends Multiples {
  /** Tanggal observasi harian terakhir ≤ `until` (emas dan kurs yang dipasangkan). */
  date: string;
  xau_usd_oz: number;
  usd_idr: number;
  usd_idr_series: string;
}

/**
 * Kelipatan titik akhir: nilai harian terakhir ≤ `until` (emas D × kurs as-of, derive) terhadap
 * rata-rata tahun dasar. Grafik referensi memakai ujung kanan seperti ini (harga/kurs 23 Okt),
 * bukan rata-rata 2026 berjalan. Null bila tahun dasar tak lengkap atau belum ada emas harian
 * (histori `xaus` belum di-backfill).
 */
export function endpointMultiples(
  table: readonly YearRow[],
  baseYear: number,
  rows: readonly Input[],
  configs: readonly Config[],
  until: string,
): EndpointMultiples | null {
  const base = table.find((r) => r.year === baseYear);
  if (!base?.goldUsd || !base.usdIdr || !base.goldIdr) return null;
  const last = goldIdrGramSeries(rows, configs)
    .filter((p) => p.date <= until)
    .at(-1);
  if (!last) return null;
  const goldUsdOz = last.xau_usd_oz / base.goldUsd.value;
  const usdIdr = last.usd_idr / base.usdIdr.value;
  const goldIdrGramMultiple = last.value / base.goldIdr.value;
  const product = goldUsdOz * usdIdr;
  return {
    date: last.date,
    xau_usd_oz: last.xau_usd_oz,
    usd_idr: last.usd_idr,
    usd_idr_series: last.usd_idr_series,
    goldIdrGram: goldIdrGramMultiple,
    goldUsdOz,
    usdIdr,
    product,
    residual: Math.abs(goldIdrGramMultiple - product) / product,
  };
}
