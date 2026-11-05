import type { MacroRow, MacroSeriesConfig } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import {
  annualTable,
  antamSellSeries,
  endpointMultiples,
  isPlausiblePremium,
  median,
  missingYears,
  multiples,
  premiumSampleAt,
  relDiff,
  sample,
} from '../src/check/macro';

// P2-12 — logika murni skrip cek silang (data sintetis; hasil atas data nyata ada di fase-2).

const configs: Pick<MacroSeriesConfig, 'id' | 'concept' | 'precedence'>[] = [
  { id: 'xau_usd_oz', concept: 'gold_usd', precedence: 1 },
  { id: 'usd_idr_jisdor', concept: 'usd_idr', precedence: 1 },
  { id: 'usd_idr_annual', concept: 'usd_idr', precedence: 2 },
];
type R = Pick<MacroRow, 'date' | 'series' | 'frequency' | 'value'>;
const gold = (date: string, value: number, frequency: 'M' | 'D' = 'M'): R => ({
  date,
  series: 'xau_usd_oz',
  frequency,
  value,
});
const fxA = (year: number, value: number): R => ({
  date: `${year}-01-01`,
  series: 'usd_idr_annual',
  frequency: 'A',
  value,
});
const fxD = (date: string, value: number): R => ({
  date,
  series: 'usd_idr_jisdor',
  frequency: 'D',
  value,
});
const months = (year: number, value: number): R[] =>
  Array.from({ length: 12 }, (_, i) => gold(`${year}-${String(i + 1).padStart(2, '0')}-01`, value));

describe('kelipatan tahunan', () => {
  // 1996: emas 400, kurs 2.000 (tahunan). 2000: emas 800, kurs 10.000 (tahunan).
  const rows = [...months(1996, 400), fxA(1996, 2_000), ...months(2000, 800), fxA(2000, 10_000)];
  const table = annualTable(rows, configs, '2000-12-31');

  it('rata-rata tahunan dengan sumber dan frekuensi tercatat; Rp/gram diturunkan per bulan', () => {
    const y96 = table.find((t) => t.year === 1996)!;
    expect(y96.goldUsd).toMatchObject({ value: 400, series: 'xau_usd_oz', frequency: 'M' });
    expect(y96.usdIdr).toMatchObject({ value: 2_000, series: 'usd_idr_annual', frequency: 'A' });
    expect(y96.goldIdr?.months).toBe(12);
    expect(y96.goldIdr?.value).toBeCloseTo((400 * 2_000) / 31.1034768, 6);
  });

  it('kelipatan dan identitas Rp/gram = US$/oz × kurs', () => {
    const m = multiples(table, 1996, 2000)!;
    expect(m.goldUsdOz).toBeCloseTo(2);
    expect(m.usdIdr).toBeCloseTo(5);
    expect(m.goldIdrGram).toBeCloseTo(10);
    expect(m.residual).toBeLessThan(1e-9);
  });

  it('tahun akhir tanpa kurs yang cukup → kelipatan null (tidak ditebak)', () => {
    // Kurs harian hanya dua tanggal: cakupan < 80% dan tidak ada M/A.
    const sparse = [...months(1996, 400), fxA(1996, 2_000), ...months(2000, 800)];
    sparse.push(fxD('2000-01-15', 8_000), fxD('2000-12-15', 12_000));
    expect(multiples(annualTable(sparse, configs, '2000-12-31'), 1996, 2000)).toBeNull();
  });

  it('tahun tanpa emas atau kurs dilaporkan', () => {
    expect(missingYears(table, 1996, 2000)).toEqual([1997, 1998, 1999]);
    expect(missingYears(table, 1996, 1996)).toEqual([]);
  });

  it('titik akhir: emas harian terakhir ≤ until dan kurs as-of, terhadap rata-rata dasar', () => {
    const daily = [...rows, gold('2000-12-27', 1_000, 'D'), fxD('2000-12-27', 12_000)];
    const t = annualTable(daily, configs, '2000-12-29');
    const e = endpointMultiples(t, 1996, daily, configs, '2000-12-29')!;
    expect(e).toMatchObject({ date: '2000-12-27', usd_idr_series: 'usd_idr_jisdor' });
    expect(e.goldUsdOz).toBeCloseTo(2.5);
    expect(e.usdIdr).toBeCloseTo(6);
    expect(e.goldIdrGram).toBeCloseTo(15);
    expect(e.residual).toBeLessThan(1e-9);
    // Tanpa emas harian: tidak dapat dihitung.
    expect(endpointMultiples(table, 1996, rows, configs, '2000-12-29')).toBeNull();
  });

  it('relDiff', () => {
    expect(relDiff(86.4, 80)).toBeCloseTo(0.08);
  });
});

describe('premi Antam', () => {
  const antam = (date: string, sell_price: number | null, weight_g = 1) => ({
    date,
    source: 'logammulia' as const,
    brand: 'antam' as const,
    product: 'gold_bar' as const,
    weight_g,
    sell_price,
  });

  it('seri harga hanya Antam 1 g dengan harga jual', () => {
    const s = antamSellSeries([
      antam('2026-10-02', 2_400_000),
      antam('2026-10-01', 2_390_000),
      antam('2026-10-03', null),
      antam('2026-10-03', 4_800_000, 2),
      { ...antam('2026-10-04', 1), brand: 'ubs' as never },
    ]);
    expect(s).toEqual([
      { date: '2026-10-01', value: 2_390_000 },
      { date: '2026-10-02', value: 2_400_000 },
    ]);
  });

  it('basis D: spot penutupan tanggal terakhir < d; premi = jual / spot − 1', () => {
    const rows = [gold('2026-10-01', 4_000, 'D'), fxD('2026-10-01', 16_000)];
    const spot = (4_000 * 16_000) / 31.1034768;
    const s = premiumSampleAt('2026-10-02', 2_300_000, rows, configs)!;
    expect(s).toMatchObject({ basis: 'D', spot_date: '2026-10-01' });
    expect(s.premium).toBeCloseTo(2_300_000 / spot - 1, 10);
    // Tanggal yang sama bukan "sebelumnya": pada 1 Okt spot 1 Okt tidak dipakai.
    expect(premiumSampleAt('2026-10-01', 2_300_000, rows, configs)).toBeNull();
  });

  it('basis M bila emas harian belum ada; null bila kurs/emas tak tersedia', () => {
    const rows = [gold('2019-03-01', 1_300), fxD('2019-02-28', 14_000)];
    const s = premiumSampleAt('2019-03-01', 700_000, rows, configs)!;
    expect(s).toMatchObject({ basis: 'M', spot_date: '2019-03' });
    expect(s.premium).toBeCloseTo(700_000 / ((1_300 * 14_000) / 31.1034768) - 1, 10);
    expect(premiumSampleAt('2019-03-01', 700_000, [gold('2019-03-01', 1_300)], configs)).toBeNull();
    expect(premiumSampleAt('2015-03-01', 700_000, rows, configs)).toBeNull();
  });

  it('masuk akal = positif sampai 20%', () => {
    expect([-0.01, 0, 0.05, 0.2, 0.25].map(isPlausiblePremium)).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
  });
});

describe('sampel dan statistik', () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  it('sampel deterministik per seed, berbeda, terurut, tidak melebihi jumlah item', () => {
    const a = sample(items, 3, 7);
    expect(sample(items, 3, 7)).toEqual(a);
    expect(new Set(a).size).toBe(3);
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(sample(items, 3, 8)).not.toEqual(a);
    expect(sample([1, 2], 5, 1)).toEqual([1, 2]);
  });
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
