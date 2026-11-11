import { describe, expect, it } from 'vitest';
import type { TodayCells } from './bandingkan';
import { buildMatrix, matrixWeights, trendFrom, trendStats } from './home-matrix';

const c = (sell: number | null, buyback: number | null = null) => ({
  sell,
  buyback,
  date: '2026-11-10',
  at: null,
});

const CELLS: TodayCells = {
  'lm-antam': { '1': c(2_500_000, 2_350_000), '5': c(12_400_000) },
  'pg-antam': { '1': c(2_540_000), '5': c(12_600_000) },
  'ubsl-ubs': { '1': c(2_490_000, 2_290_000), '0.5': c(1_300_000) },
  'pg-g24': { '1': c(2_430_000) },
  tab: { linear: c(2_385_000, 2_289_000) },
};

describe('matrixWeights', () => {
  it('gabungan gramasi, urut naik, tanpa linear', () => {
    expect(matrixWeights(CELLS)).toEqual([0.5, 1, 5]);
  });
});

describe('buildMatrix', () => {
  it('jual: termurah ditandai, sel kosong null', () => {
    const r1 = buildMatrix(CELLS, 'jual', 'keping').find((r) => r.w === 1)!;
    expect(r1.cells.map((x) => x.value)).toEqual([2_500_000, 2_540_000, 2_490_000, 2_430_000]);
    expect(r1.cells.map((x) => x.best)).toEqual([false, false, false, true]);
  });

  it('per gram membagi dengan berat', () => {
    const r5 = buildMatrix(CELLS, 'jual', 'gram').find((r) => r.w === 5)!;
    expect(r5.cells[0]?.value).toBe(2_480_000);
    expect(r5.cells[3]?.value).toBeNull();
    expect(r5.cells[0]?.best).toBe(true);
  });

  it('buyback: tertinggi ditandai hanya bila ada >= 2 nilai', () => {
    const rows = buildMatrix(CELLS, 'buyback', 'keping');
    const r1 = rows.find((r) => r.w === 1)!;
    expect(r1.cells.map((x) => x.value)).toEqual([2_350_000, null, 2_290_000, null]);
    expect(r1.cells.map((x) => x.best)).toEqual([true, false, false, false]);
    expect(rows.find((r) => r.w === 5)!.cells.every((x) => !x.best && x.value === null)).toBe(true);
  });

  it('spread: terkecil ditandai, persen tidak bergantung satuan', () => {
    const a = buildMatrix(CELLS, 'spread', 'keping').find((r) => r.w === 1)!;
    const b = buildMatrix(CELLS, 'spread', 'gram').find((r) => r.w === 1)!;
    expect(a.cells[0]?.value).toBeCloseTo(6, 5);
    expect(a.cells.map((x) => x.best)).toEqual([true, false, false, false]);
    expect(b).toEqual(a);
  });

  it('satu nilai saja tidak ditandai', () => {
    const r = buildMatrix(CELLS, 'jual', 'keping').find((x) => x.w === 0.5)!;
    expect(r.cells.some((x) => x.best)).toBe(false);
  });
});

describe('trend', () => {
  it('trendFrom: jendela inklusif', () => {
    expect(trendFrom('2026-11-10', 7)).toBe('2026-11-04');
    expect(trendFrom('2026-11-10', 1)).toBe('2026-11-10');
  });

  it('trendStats: hi/lo/avg/perubahan, null diabaikan', () => {
    const s = trendStats([
      ['2026-11-01', 100],
      ['2026-11-02', null],
      ['2026-11-03', 120],
      ['2026-11-04', 110],
    ]);
    expect(s).toMatchObject({ hi: 120, lo: 100, avg: 110, count: 3 });
    expect(s?.changePct).toBeCloseTo(10, 5);
  });

  it('trendStats: satu titik tanpa perubahan; kosong null', () => {
    expect(trendStats([['2026-11-01', 5]])?.changePct).toBeNull();
    expect(trendStats([['2026-11-01', null]])).toBeNull();
    expect(trendStats([])).toBeNull();
  });
});
