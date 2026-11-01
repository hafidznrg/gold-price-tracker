import {
  PRICE_SOURCES,
  SCHEMA_VERSION,
  addDaysIso,
  goldIdrGram,
  goldIdrGramSeries,
  newestYearVariant,
  premiumAt,
  type MacroRow,
  type MacroSeriesConfig,
  type PriceRow,
  type SpotSnapshot,
} from '@gold/schema';
import { compareFileIds, perGramPrice, productKind } from '../data/catalog';
import type {
  Change,
  Highlight,
  LatestFile,
  LatestSeries,
  LatestSource,
  LatestSpot,
  PricePoint,
  Spark,
} from '../data/types';
import { splitSeries, type FileGroup, type SeriesGroup } from './series';

export const SPARK_DAYS = 30;

/** Bulatkan persen/rasio agar file kecil dan stabil. */
export function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function computeChange(cur: number | null, prev: number | null): Change | null {
  if (cur === null || prev === null || prev === 0) return null;
  const abs = cur - prev;
  return { abs: round(abs, 2), pct: round((abs / prev) * 100) };
}

export function computeSpread(
  sell: number | null,
  buyback: number | null,
): { spread: number | null; spread_pct: number | null } {
  if (sell === null || buyback === null || sell === 0) return { spread: null, spread_pct: null };
  const spread = round(sell - buyback, 2);
  return { spread, spread_pct: round((spread / sell) * 100) };
}

type PickRow = Pick<PriceRow, 'date' | 'sell_price' | 'buyback_price'>;

/** Nilai per hari kalender `[end − 29, end]`; null untuk hari tanpa titik. */
export function buildSpark(rows: readonly PickRow[], end: string, days = SPARK_DAYS): Spark {
  const start = addDaysIso(end, -(days - 1));
  const byDate = new Map(rows.filter((r) => r.date >= start && r.date <= end).map((r) => [r.date, r]));
  const sell: (number | null)[] = [];
  const buyback: (number | null)[] = [];
  for (let d = start; d <= end; d = addDaysIso(d, 1)) {
    const r = byDate.get(d);
    sell.push(r?.sell_price ?? null);
    buyback.push(r?.buyback_price ?? null);
  }
  return { start, end, sell, buyback: buyback.some((v) => v !== null) ? buyback : null };
}

function point(r: PickRow): PricePoint {
  return { date: r.date, sell: r.sell_price, buyback: r.buyback_price };
}

export function latestOfSeries(s: SeriesGroup, fileLastDate: string): LatestSeries {
  const last = s.rows.at(-1)!;
  const prev = s.rows.at(-2) ?? null;
  return {
    ...s.ref,
    key: s.key,
    file: s.file,
    date: last.date,
    sell: last.sell_price,
    buyback: last.buyback_price,
    source_updated_at: last.source_updated_at,
    prev: prev ? point(prev) : null,
    change: {
      sell: computeChange(last.sell_price, prev?.sell_price ?? null),
      buyback: computeChange(last.buyback_price, prev?.buyback_price ?? null),
    },
    ...computeSpread(last.sell_price, last.buyback_price),
    current: last.date === fileLastDate,
    spark: buildSpark(s.rows, last.date),
  };
}

/**
 * Series kartu Hari ini untuk satu file: berat 1 g (atau berat terkecil bila tidak ada, mis.
 * Tabungan Emas 0,01 g), di antara series yang masih `current`; variant = tahun produksi
 * terbaru, selain itu `''`. Series `variant=''` dengan berat yang sama menjadi penyambung
 * spark (D-28).
 */
export function pickHighlightSeries(
  series: readonly SeriesGroup[],
  fileLastDate: string,
): { main: SeriesGroup; fallback: SeriesGroup | null } | null {
  const current = series.filter((s) => s.rows.at(-1)!.date === fileLastDate);
  if (current.length === 0) return null;
  const w = current.some((s) => s.ref.w === 1) ? 1 : Math.min(...current.map((s) => s.ref.w));
  const atW = current.filter((s) => s.ref.w === w);
  const variant = newestYearVariant(atW.map((s) => s.ref)) ?? '';
  const main = atW.find((s) => s.ref.variant === variant) ?? atW[0]!;
  const fallback =
    main.ref.variant === ''
      ? null
      : (series.find((s) => s.ref.w === w && s.ref.variant === '') ?? null);
  return { main, fallback };
}

function scale(v: number | null, factor: number): number | null {
  return v === null ? null : round(v * factor, 2);
}

function scalePoint(p: PricePoint | null, w: number, perGram: boolean): PricePoint | null {
  if (!p || !perGram) return p;
  return { date: p.date, sell: perGramPrice(p.sell, w), buyback: perGramPrice(p.buyback, w) };
}

export function buildHighlight(group: FileGroup, latest: readonly LatestSeries[]): Highlight | null {
  const fileLastDate = group.rows.at(-1)?.date;
  if (!fileLastDate) return null;
  const picked = pickHighlightSeries(splitSeries(group), fileLastDate);
  if (!picked) return null;
  const { main, fallback } = picked;
  const ls = latest.find((s) => s.key === main.key)!;
  const w = main.ref.w;
  const perGram = w !== 1;
  const g = (v: number | null) => (perGram ? perGramPrice(v, w) : v);

  // Spark tersambung: nilai series utama, atau penyambung `variant=''` di hari tanpa nilai utama.
  const spark = buildSpark(main.rows, ls.date);
  let splicedFrom: string | null = null;
  if (fallback) {
    const fb = buildSpark(fallback.rows, ls.date);
    const fill = (a: (number | null)[], b: (number | null)[] | null) =>
      a.map((v, i) => {
        if (v !== null || !b || b[i] === null || b[i] === undefined) return v;
        splicedFrom = fallback.ref.variant;
        return b[i]!;
      });
    spark.sell = fill(spark.sell, fb.sell);
    const bb = fill(spark.buyback ?? spark.sell.map(() => null), fb.buyback);
    spark.buyback = bb.some((v) => v !== null) ? bb : null;
  }
  const factor = perGram ? 1 / w : 1;

  return {
    file: group.file,
    source: group.source,
    brand: group.brand,
    product: group.product,
    kind: productKind(group.product),
    display: perGram ? 'per_gram' : 'keping_1g',
    series_key: ls.key,
    variant: ls.variant,
    w,
    date: ls.date,
    source_updated_at: ls.source_updated_at,
    sell: g(ls.sell),
    buyback: g(ls.buyback),
    prev: scalePoint(ls.prev, w, perGram),
    change: {
      sell: ls.change.sell && { abs: round(ls.change.sell.abs * factor, 2), pct: ls.change.sell.pct },
      buyback: ls.change.buyback && {
        abs: round(ls.change.buyback.abs * factor, 2),
        pct: ls.change.buyback.pct,
      },
    },
    spread: scale(ls.spread, factor),
    spread_pct: ls.spread_pct,
    spark: {
      start: spark.start,
      end: spark.end,
      sell: spark.sell.map((v) => scale(v, factor)),
      buyback: spark.buyback && spark.buyback.map((v) => scale(v, factor)),
      spliced_from: splicedFrom,
    },
  };
}

export function buildLatestSources(groups: readonly FileGroup[]): LatestSource[] {
  return PRICE_SOURCES.map((source) => {
    const rows = groups.filter((g) => g.source === source).flatMap((g) => g.rows);
    if (rows.length === 0) return { source, last_data_date: null, source_updated_at: null };
    const last = rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0]!.date);
    const stamps = rows
      .filter((r) => r.date === last && r.source_updated_at !== null)
      .map((r) => r.source_updated_at!)
      .sort((a, b) => Date.parse(a) - Date.parse(b));
    return { source, last_data_date: last, source_updated_at: stamps.at(-1) ?? null };
  });
}

export function buildSpot(
  spot: SpotSnapshot | null,
  groups: readonly FileGroup[],
  macroRows: readonly MacroRow[],
  macroConfigs: readonly MacroSeriesConfig[],
): LatestSpot | null {
  if (!spot) return null;
  const idrGram = round(goldIdrGram(spot.xau_usd_oz, spot.usd_idr), 2);
  let premium: LatestSpot['premium_antam'] = null;
  const lm1g = groups
    .find((g) => g.file === 'logammulia-antam')
    ?.rows.filter((r) => r.weight_g === 1 && r.variant === '' && r.sell_price !== null)
    .at(-1);
  if (lm1g && macroRows.length > 0) {
    const daily = goldIdrGramSeries(macroRows, macroConfigs).map((p) => ({
      date: p.date,
      value: p.value,
    }));
    const p = premiumAt(lm1g.sell_price!, lm1g.date, daily);
    if (p) {
      premium = {
        date: lm1g.date,
        sell: lm1g.sell_price!,
        spot_date: p.spot_date,
        pct: round(p.value * 100),
      };
    }
  }
  return { snapshot: spot, idr_gram: idrGram, premium_antam: premium };
}

export interface LatestInput {
  groups: readonly FileGroup[];
  spot: SpotSnapshot | null;
  macroRows: readonly MacroRow[];
  macroConfigs: readonly MacroSeriesConfig[];
}

export function buildLatest(input: LatestInput): LatestFile {
  const groups = [...input.groups].sort((a, b) => compareFileIds(a.file, b.file));
  const series: LatestSeries[] = [];
  for (const g of groups) {
    const fileLastDate = g.rows.at(-1)?.date;
    if (!fileLastDate) continue;
    for (const s of splitSeries(g)) series.push(latestOfSeries(s, fileLastDate));
  }
  const highlights = groups
    .map((g) => buildHighlight(g, series))
    .filter((h): h is Highlight => h !== null);
  const sources = buildLatestSources(groups);
  const dates = sources.map((s) => s.last_data_date).filter((d): d is string => d !== null);
  return {
    schema_version: SCHEMA_VERSION,
    as_of: dates.length ? dates.sort().at(-1)! : null,
    sources,
    highlights,
    series,
    spot: buildSpot(input.spot, groups, input.macroRows, input.macroConfigs),
  };
}
