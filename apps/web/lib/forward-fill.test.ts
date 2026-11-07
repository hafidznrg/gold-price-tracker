import { describe, expect, it } from 'vitest';
import * as schema from '@gold/schema';
import { asOf, forwardFill } from './forward-fill';

const points = [
  { date: '2026-03-02', value: 10 },
  { date: '2026-03-03', value: 11 },
  { date: '2026-03-10', value: 12 },
];
const dates = ['2026-03-01', '2026-03-02', '2026-03-05', '2026-03-10', '2026-03-20'];

describe('forward-fill klien', () => {
  it('sama dengan derive.ts di @gold/schema', () => {
    for (const max of [undefined, 3]) {
      expect(forwardFill(points, dates, max)).toEqual(schema.forwardFill(points, dates, max));
    }
    for (const d of dates) {
      for (const tol of [0, 5, 100]) {
        expect(asOf(points, d, tol)).toEqual(schema.asOf(points, d, { toleranceDays: tol }));
      }
    }
  });

  it('menandai titik salinan dan melewati tanggal sebelum titik pertama', () => {
    const out = forwardFill(points, dates);
    expect(out[0]).toEqual({
      date: '2026-03-02',
      value: 10,
      filled: false,
      from_date: '2026-03-02',
    });
    expect(out[1]).toEqual({
      date: '2026-03-05',
      value: 11,
      filled: true,
      from_date: '2026-03-03',
    });
  });
});
