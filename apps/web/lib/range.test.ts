import { describe, expect, it } from 'vitest';
import { rangeToDates } from './range';

describe('rangeToDates', () => {
  const last = '2026-10-31';
  it('preset relatif terhadap tanggal terakhir', () => {
    expect(rangeToDates('7H', last)).toEqual({ from: '2026-10-25', to: last });
    expect(rangeToDates('1B', last)).toEqual({ from: '2026-09-30', to: last });
    expect(rangeToDates('3B', last)).toEqual({ from: '2026-07-31', to: last });
    expect(rangeToDates('6B', last)).toEqual({ from: '2026-04-30', to: last });
    expect(rangeToDates('YTD', last)).toEqual({ from: '2026-01-01', to: last });
    expect(rangeToDates('1T', last)).toEqual({ from: '2025-10-31', to: last });
    expect(rangeToDates('Semua', last)).toEqual({ from: null, to: last });
  });
  it('menjepit hari akhir bulan dan melewati batas tahun', () => {
    expect(rangeToDates('1B', '2026-03-31').from).toBe('2026-02-28');
    expect(rangeToDates('1T', '2024-02-29').from).toBe('2023-02-28');
    expect(rangeToDates('3B', '2026-01-15').from).toBe('2025-10-15');
    expect(rangeToDates('7H', '2026-01-03').from).toBe('2025-12-28');
  });
  it('kustom diteruskan apa adanya', () => {
    expect(rangeToDates({ from: '2024-01-01', to: '2024-06-30' }, last)).toEqual({
      from: '2024-01-01',
      to: '2024-06-30',
    });
  });
});

describe('rangeWords', () => {
  it('preset dalam kata, kustom = rentang', async () => {
    const { rangeWords } = await import('./range');
    expect(rangeWords('1B')).toBe('1 bulan');
    expect(rangeWords('YTD')).toBe('sejak awal tahun');
    expect(rangeWords('Semua')).toBe('seluruh data');
    expect(rangeWords({ from: '2026-01-01', to: '2026-02-01' })).toBe('rentang');
  });
});
