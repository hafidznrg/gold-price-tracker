import {
  aggregate,
  goldIdrGram,
  goldIdrGramSeries,
  premiumAntamSeries,
  type AggregatePoint,
  type MacroRow,
  type MacroSeriesConfig,
  type PriceRow,
} from '@gold/schema';
import {
  GOLD_IDR_GRAM_FIELDS,
  PREMIUM_ANTAM_FIELDS,
  PREMIUM_ANTAM_MONTHLY_FIELDS,
  type AnnualEnd,
  type AnnualFile,
  type AnnualRow,
  type AnnualValue,
  type GoldIdrGramFile,
  type PremiumAntamFile,
} from '../data/types';
import { round } from './latest';

// Berkas derived/*.json (TECH-SPEC §8): rumus dan aturan penggabungan seluruhnya dari
// @gold/schema `derive.ts` (DATA-MODEL §6); di sini hanya pembentukan format ringkas.

/** Rp/gram spot harian + seri kurs yang dipakai per titik. */
export function buildGoldIdrGramFile(
  macro: readonly MacroRow[],
  configs: readonly MacroSeriesConfig[],
): GoldIdrGramFile {
  const fxSeries: GoldIdrGramFile['fx_series'] = [];
  const rows = goldIdrGramSeries(macro, configs).map((p): GoldIdrGramFile['rows'][number] => {
    let fx = fxSeries.indexOf(p.usd_idr_series);
    if (fx < 0) fx = fxSeries.push(p.usd_idr_series) - 1;
    return [p.date, round(p.value, 2), p.xau_usd_oz, p.usd_idr, fx];
  });
  return { fields: GOLD_IDR_GRAM_FIELDS, fx_series: fxSeries, rows };
}

function isAntamLm1g(r: PriceRow): r is PriceRow & { sell_price: number } {
  return (
    r.source === 'logammulia' &&
    r.brand === 'antam' &&
    r.product === 'gold_bar' &&
    r.weight_g === 1 &&
    r.sell_price !== null
  );
}

/** Baris makro terakhir per (seri, frekuensi, tahun), hanya sampai `until`. */
function lastByYear(
  macro: readonly MacroRow[],
  until: string | null,
): Map<string, { date: string; value: number }> {
  const out = new Map<string, { date: string; value: number }>();
  for (const r of macro) {
    if (until !== null && r.date > until) continue;
    const k = `${r.series}|${r.frequency}|${r.date.slice(0, 4)}`;
    const cur = out.get(k);
    if (!cur || r.date > cur.date) out.set(k, { date: r.date, value: r.value });
  }
  return out;
}

function yearEnd(
  last: ReadonlyMap<string, { date: string; value: number }>,
  year: number,
  p: AnnualValue | null,
): AnnualEnd | null {
  if (!p) return null;
  const hit = last.get(`${p.series}|${p.frequency}|${year}`);
  return hit ? { date: hit.date, value: round(hit.value, 2) } : null;
}

/** Antam LM 1 g jual per tahun: rata-rata harian dan harga terakhir. */
function antamByYear(prices: readonly PriceRow[]): Map<number, NonNullable<AnnualRow['antam_lm']>> {
  const acc = new Map<number, { sum: number; days: number; endDate: string; end: number }>();
  for (const r of prices) {
    if (!isAntamLm1g(r)) continue;
    const y = Number(r.date.slice(0, 4));
    const cur = acc.get(y) ?? { sum: 0, days: 0, endDate: '', end: 0 };
    cur.sum += r.sell_price;
    cur.days += 1;
    if (r.date >= cur.endDate) {
      cur.endDate = r.date;
      cur.end = r.sell_price;
    }
    acc.set(y, cur);
  }
  return new Map(
    [...acc].map(([y, a]) => [
      y,
      { avg: Math.round(a.sum / a.days), end: a.end, end_date: a.endDate, days: a.days },
    ]),
  );
}

function annualValue(p: AggregatePoint | undefined): AnnualValue | null {
  if (!p) return null;
  return {
    value: round(p.value, 2),
    series: p.series,
    frequency: p.frequency,
    points: p.points,
    coverage: p.coverage === null ? null : round(p.coverage),
  };
}

/**
 * Rata-rata tahunan emas US$/oz dan kurs (resolusi D → M → A, `aggregate`), dan Rp/gram: tidak
 * ada seri Rp/gram untuk tahun-tahun awal, jadi diturunkan per bulan (emas bulanan × kurs bulanan)
 * lalu dirata-ratakan per tahun, seperti cek silang G2 (`check/macro.ts`). Dipotong di tanggal
 * data harian terakhir supaya cakupan tahun berjalan dihitung terhadap hari kerja yang sudah lewat.
 */
export function buildAnnualFile(
  macro: readonly MacroRow[],
  configs: readonly MacroSeriesConfig[],
  prices: readonly PriceRow[] = [],
): AnnualFile {
  const until = macro
    .filter((r) => r.frequency === 'D')
    .reduce<string | null>((max, r) => (max === null || r.date > max ? r.date : max), null);
  const opts = until ? { until } : {};
  const goldY = aggregate(macro, configs, 'gold_usd', 'year', opts);
  const fxY = aggregate(macro, configs, 'usd_idr', 'year', opts);
  const goldM = new Map(
    aggregate(macro, configs, 'gold_usd', 'month', opts).map((p) => [p.period, p.value]),
  );
  const idrByYear = new Map<number, number[]>();
  for (const fx of aggregate(macro, configs, 'usd_idr', 'month', opts)) {
    const gold = goldM.get(fx.period);
    if (gold === undefined) continue;
    const year = Number(fx.period.slice(0, 4));
    idrByYear.set(year, [...(idrByYear.get(year) ?? []), goldIdrGram(gold, fx.value)]);
  }
  const years = [...new Set([...goldY, ...fxY].map((p) => Number(p.period)))].sort((a, b) => a - b);
  const last = lastByYear(macro, until);
  const antam = antamByYear(prices);
  const rows = years.map((year): AnnualRow => {
    const idr = idrByYear.get(year);
    const gold_usd = annualValue(goldY.find((p) => Number(p.period) === year));
    const usd_idr = annualValue(fxY.find((p) => Number(p.period) === year));
    return {
      year,
      gold_usd,
      usd_idr,
      year_end: { gold_usd: yearEnd(last, year, gold_usd), usd_idr: yearEnd(last, year, usd_idr) },
      antam_lm: antam.get(year) ?? null,
      idr_gram: idr
        ? { value: round(idr.reduce((a, b) => a + b, 0) / idr.length, 2), months: idr.length }
        : null,
    };
  });
  return { until, rows };
}

/**
 * Premi bulanan untuk bulan-bulan **sebelum** titik premi harian pertama (D-38): rata-rata harga
 * Antam 1 g dalam bulan itu ÷ Rp/gram spot bulanan − 1. Rp/gram spot bulanan = emas US$/oz bulanan ×
 * kurs bulanan (`aggregate`, resolusi D → M → A, DATA-MODEL §6.3) ÷ 31,1035 — sama seperti
 * `annual.json`. Ini bukan *as-of join* harian, jadi ditandai terpisah dan tidak dicampur ke rata-rata.
 */
export function buildPremiumAntamMonthly(
  prices: readonly PriceRow[],
  macro: readonly MacroRow[],
  configs: readonly MacroSeriesConfig[],
  before: string | null,
): PremiumAntamFile['monthly'] {
  const antam = new Map<string, number[]>();
  for (const r of prices) {
    if (!isAntamLm1g(r)) continue;
    if (before !== null && r.date.slice(0, 7) >= before.slice(0, 7)) continue;
    const m = r.date.slice(0, 7);
    antam.set(m, [...(antam.get(m) ?? []), r.sell_price]);
  }
  if (antam.size === 0) return [];
  const gold = new Map(aggregate(macro, configs, 'gold_usd', 'month').map((p) => [p.period, p]));
  const fx = new Map(aggregate(macro, configs, 'usd_idr', 'month').map((p) => [p.period, p]));
  const out: PremiumAntamFile['monthly'] = [];
  for (const [month, sells] of [...antam].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const g = gold.get(month);
    const f = fx.get(month);
    if (!g || !f || (g.frequency !== 'D' && g.frequency !== 'M')) continue;
    const avgSell = sells.reduce((a, b) => a + b, 0) / sells.length;
    out.push([
      month,
      round((avgSell / goldIdrGram(g.value, f.value) - 1) * 100),
      g.frequency,
      sells.length,
    ]);
  }
  return out;
}

/**
 * Premi Antam LM 1 g jual vs spot: harian (spot = penutupan terakhir < tanggal harga, toleransi
 * 5 hari) ditambah premi bulanan untuk histori sebelum spot harian tersedia (D-38).
 */
export function buildPremiumAntamFile(
  prices: readonly PriceRow[],
  macro: readonly MacroRow[],
  configs: readonly MacroSeriesConfig[],
): PremiumAntamFile {
  const spot = goldIdrGramSeries(macro, configs).map((p) => ({ date: p.date, value: p.value }));
  const rows = premiumAntamSeries(prices, spot).map((p): PremiumAntamFile['rows'][number] => [
    p.date,
    round(p.value * 100),
    p.spot_date,
  ]);
  const monthly = buildPremiumAntamMonthly(prices, macro, configs, rows[0]?.[0] ?? null);
  return {
    fields: PREMIUM_ANTAM_FIELDS,
    rows,
    monthly_fields: PREMIUM_ANTAM_MONTHLY_FIELDS,
    monthly,
  };
}
