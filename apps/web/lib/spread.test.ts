import { describe, expect, it } from 'vitest';
import type { SeriesRowTuple } from './data';
import {
  breakEvenPct,
  buybackPoints,
  compatible,
  findGaps,
  joinDays,
  pairDays,
  sellPoints,
  sliceDays,
  spreadPct,
  spreadStats,
  type SpreadOption,
} from './spread';

const o = (over: Partial<SpreadOption>): SpreadOption => ({
  id: 'x',
  label: 'x',
  short: 'x',
  source: 'logammulia',
  brand: 'antam',
  product: 'gold_bar',
  file: 'f',
  variants: [''],
  w: 1,
  color: 'antam',
  ...over,
});

describe('spreadPct / breakEvenPct', () => {
  it('(jual − buyback) / jual', () => {
    expect(spreadPct(2_500_000, 2_350_000)).toBeCloseTo(6, 5);
    expect(spreadPct(null, 1)).toBeNull();
    expect(spreadPct(100, null)).toBeNull();
    expect(spreadPct(0, 0)).toBeNull();
  });
  it('titik impas terhadap buyback', () => {
    expect(breakEvenPct(110, 100)).toBeCloseTo(10, 5);
    expect(breakEvenPct(110, 0)).toBeNull();
  });
});

describe('joinDays / spreadStats', () => {
  const sell = [
    { date: '2026-10-01', value: 100 },
    { date: '2026-10-02', value: 110 },
    { date: '2026-10-03', value: 120 },
  ];
  const buy = [
    { date: '2026-10-02', value: 100 },
    { date: '2026-10-03', value: 114 },
    { date: '2026-10-04', value: 90 },
  ];
  it('hanya hari yang punya keduanya', () => {
    const d = joinDays(sell, buy);
    expect(d.map((x) => x.date)).toEqual(['2026-10-02', '2026-10-03']);
    expect(d[0]?.spread).toBe(10);
  });
  it('statistik: hari ini, rata-rata, tersempit, impas', () => {
    const s = spreadStats(joinDays(sell, buy));
    expect(s?.last.date).toBe('2026-10-03');
    expect(s?.min.date).toBe('2026-10-03');
    expect(s?.avgPct).toBeCloseTo(((10 / 110) * 100 + 5) / 2, 5);
    expect(s?.breakEven).toBeCloseTo((6 / 114) * 100, 5);
    expect(spreadStats([])).toBeNull();
  });
  it('sliceDays inklusif dan from null', () => {
    const d = joinDays(sell, buy);
    expect(sliceDays(d, '2026-10-03', '2026-10-03')).toHaveLength(1);
    expect(sliceDays(d, null, '2026-10-02')).toHaveLength(1);
  });
});

describe('findGaps', () => {
  it('celah ≥ 2 hari kalender', () => {
    expect(findGaps(['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-28'])).toEqual([
      { from: '2026-10-24', to: '2026-10-25' },
    ]);
    expect(findGaps(['2026-10-22'])).toEqual([]);
  });
});

describe('poin dari file series', () => {
  const rows: SeriesRowTuple[] = [
    ['2026-10-26', '2026', 1, 2_483_400, 2_285_000],
    ['2026-10-25', '', 1, null, 2_280_000],
    ['2026-10-26', '', 1, null, 2_000_000],
    ['2026-10-26', '2026', 5, 12_000_000, 11_000_000],
  ];
  it('buyback menggabung variant, variant awal menang', () => {
    const b = buybackPoints({ rows }, o({ variants: ['2026', ''] }));
    expect(b).toEqual([
      { date: '2026-10-25', value: 2_280_000 },
      { date: '2026-10-26', value: 2_285_000 },
    ]);
  });
  it('pasangan hanya di hari jual dan buyback ada', () => {
    const days = pairDays(o({ variants: ['2026'] }), { rows }, o({ variants: ['2026', ''] }), {
      rows,
    });
    expect(days).toHaveLength(1);
    expect(days[0]?.pct).toBeCloseTo(((2_483_400 - 2_285_000) / 2_483_400) * 100, 5);
  });
  it('Tabungan Emas dikonversi ke per gram', () => {
    const t: SeriesRowTuple[] = [['2026-10-31', '', 0.01, 23_600, 22_770]];
    const opt = o({ w: 0.01, product: 'gold_savings', brand: 'pegadaian' });
    expect(sellPoints({ rows: t }, opt)[0]?.value).toBe(2_360_000);
    expect(pairDays(opt, { rows: t }, opt, { rows: t })[0]?.pct).toBeCloseTo(3.5169, 3);
  });
});

describe('compatible', () => {
  it('brand dan produk harus sama', () => {
    expect(compatible(o({}), o({}))).toBe(true);
    expect(compatible(o({}), o({ brand: 'ubs' }))).toBe(false);
  });
});
