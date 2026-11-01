import { describe, expect, it } from 'vitest';
import { barLayout } from './bar-layout';
import { sparkBand, sparkExtent, sparkLine, sparkTrend } from './sparkline-path';

describe('sparkline', () => {
  it('extent dengan bantalan 8%', () => {
    expect(sparkExtent([[0, 100, null]])).toEqual([-8, 108]);
    expect(sparkExtent([[null]])).toBeNull();
  });
  it('garis memutus pena di nilai kosong', () => {
    expect(sparkLine([0, 10, null, 10], [0, 10], 30, 10)).toBe('M0.0 10.0 L10.0 0.0 M30.0 0.0');
  });
  it('band: satu poligon per ruas yang keduanya terisi', () => {
    const d = sparkBand([10, 10, null, 10, 10], [0, 0, 0, 0, 0], [0, 10], 40, 10);
    expect(d.match(/Z/g)).toHaveLength(2);
  });
  it('arah dari nilai valid pertama ke terakhir', () => {
    expect(sparkTrend([null, 1, 3])).toBe('up');
    expect(sparkTrend([3, null, 1])).toBe('down');
    expect(sparkTrend([2, 2])).toBe('flat');
    expect(sparkTrend([5])).toBe('flat');
  });
});

describe('barLayout', () => {
  it('rasio terhadap nilai terbesar; kosong/negatif → 0', () => {
    const r = barLayout([
      { label: '1 g', value: 8 },
      { label: '2 g', value: 4 },
      { label: '5 g', value: null },
      { label: 'x', value: -1 },
    ]);
    expect(r.map((x) => x.ratio)).toEqual([1, 0.5, 0, 0]);
    expect(barLayout([{ label: 'a', value: 5 }], 10)[0]!.ratio).toBe(0.5);
  });
});
