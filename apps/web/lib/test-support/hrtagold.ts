import type {
  Highlight,
  LatestFile,
  LatestSeries,
  MetaSeries,
  SeriesFile,
  SeriesRowTuple,
} from '../data';
import { seriesKey } from '../data';

// Fixture sintetis EMASKU (hrtagold.id, Fase 7) untuk uji unit: Gold 17 gramasi + Prime 25/50/100 g,
// jual dan buyback per keping. Dipakai supaya logika UI teruji walau `data/prices/hrtagold/` belum ada.

export const HRTA_FILE = 'hrtagold-emasku';
export const GOLD_WEIGHTS = [
  0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 125, 150, 175, 200, 250, 500, 1000,
] as const;
export const PRIME_WEIGHTS = [25, 50, 100] as const;
export const HRTA_DAYS = ['2026-11-20', '2026-11-21'] as const;
const STAMP = '2026-11-21T08:12:00+07:00';

/** Harga jual Gold per keping; buyback 6% di bawahnya. Hari kedua +5.000 per gram. */
export function goldSell(w: number, day = 1): number {
  return Math.round(w * (2_253_000 + day * 5_000) + (w < 1 ? 20_000 : 0));
}
export const goldBuyback = (w: number, day = 1): number => Math.round(goldSell(w, day) * 0.94);
/** Prime: jual lebih mahal dari Gold, buyback berbeda dari Gold untuk membuktikan seri terpisah. */
export const primeSell = (w: number, day = 1): number => goldSell(w, day) + 250_000;
export const primeBuyback = (w: number, day = 1): number => Math.round(primeSell(w, day) * 0.93);

export function hrtaRows(): SeriesRowTuple[] {
  const rows: SeriesRowTuple[] = [];
  HRTA_DAYS.forEach((date, day) => {
    for (const w of GOLD_WEIGHTS) rows.push([date, '', w, goldSell(w, day), goldBuyback(w, day)]);
    for (const w of PRIME_WEIGHTS)
      rows.push([date, 'prime', w, primeSell(w, day), primeBuyback(w, day)]);
  });
  return rows;
}

export function hrtaSeriesFile(): SeriesFile {
  return {
    file: HRTA_FILE,
    source: 'hrtagold',
    brand: 'emasku',
    product: 'gold_bar',
    location: '',
    fields: ['date', 'variant', 'w', 'sell', 'buyback'],
    rows: hrtaRows(),
  };
}

const SPARK = { start: '2026-10-23', end: '2026-11-21', sell: [], buyback: null };

export function hrtaLatestSeries(): LatestSeries[] {
  const mk = (variant: string, w: number, sell: number, buyback: number, prev: number) =>
    ({
      source: 'hrtagold',
      brand: 'emasku',
      product: 'gold_bar',
      variant,
      w,
      key: seriesKey({
        source: 'hrtagold',
        brand: 'emasku',
        product: 'gold_bar',
        variant,
        w,
      }),
      file: HRTA_FILE,
      date: '2026-11-21',
      sell,
      buyback,
      source_updated_at: STAMP,
      prev: { date: '2026-11-20', sell: prev, buyback: null },
      change: { sell: { abs: sell - prev, pct: ((sell - prev) / prev) * 100 }, buyback: null },
      spread: sell - buyback,
      spread_pct: ((sell - buyback) / sell) * 100,
      current: true,
      carry_over: false,
      spark: SPARK,
    }) as LatestSeries;
  return [
    ...GOLD_WEIGHTS.map((w) => mk('', w, goldSell(w, 1), goldBuyback(w, 1), goldSell(w, 0))),
    ...PRIME_WEIGHTS.map((w) =>
      mk('prime', w, primeSell(w, 1), primeBuyback(w, 1), primeSell(w, 0)),
    ),
  ];
}

export function hrtaHighlight(): Highlight {
  const s = hrtaLatestSeries().find((x) => x.variant === '' && x.w === 1)!;
  return {
    file: HRTA_FILE,
    source: 'hrtagold',
    brand: 'emasku',
    product: 'gold_bar',
    kind: 'fisik',
    display: 'keping_1g',
    series_key: s.key,
    variant: '',
    w: 1,
    date: s.date,
    source_updated_at: s.source_updated_at,
    sell: s.sell,
    buyback: s.buyback,
    prev: s.prev,
    change: s.change,
    spread: s.spread,
    spread_pct: s.spread_pct,
    carry_over: false,
    spark: { ...s.spark, spliced_from: null },
  };
}

/** `latest.json` yang hanya memuat EMASKU (digabung ke latest lain lewat spread di tes). */
export function hrtaLatest(): LatestFile {
  return {
    schema_version: '1',
    as_of: '2026-11-21',
    sources: [{ source: 'hrtagold', last_data_date: '2026-11-21', source_updated_at: STAMP }],
    highlights: [hrtaHighlight()],
    series: hrtaLatestSeries(),
    spot: null,
  };
}

/** `meta.series` EMASKU untuk `explorerOptions`. */
export function hrtaMetaSeries(): MetaSeries[] {
  return [
    ...GOLD_WEIGHTS.map((w) => ['', w] as const),
    ...PRIME_WEIGHTS.map((w) => ['prime', w] as const),
  ].map(([variant, w]) => ({
    source: 'hrtagold',
    brand: 'emasku',
    product: 'gold_bar',
    variant,
    w,
    key: seriesKey({ source: 'hrtagold', brand: 'emasku', product: 'gold_bar', variant, w }),
    file: HRTA_FILE,
    rows: 2,
    first_date: HRTA_DAYS[0],
    last_date: HRTA_DAYS[1],
    first_sell_date: HRTA_DAYS[0],
    first_buyback_date: HRTA_DAYS[0],
  }));
}
