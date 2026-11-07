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
  const rows = years.map((year): AnnualRow => {
    const idr = idrByYear.get(year);
    return {
      year,
      gold_usd: annualValue(goldY.find((p) => Number(p.period) === year)),
      usd_idr: annualValue(fxY.find((p) => Number(p.period) === year)),
      idr_gram: idr
        ? { value: round(idr.reduce((a, b) => a + b, 0) / idr.length, 2), months: idr.length }
        : null,
    };
  });
  return { until, rows };
}

/** Premi Antam LM 1 g jual vs spot (spot = penutupan terakhir < tanggal harga, toleransi 5 hari). */
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
  return { fields: PREMIUM_ANTAM_FIELDS, rows };
}
