import { describe, expect, it } from 'vitest';
import { canonicalWeight, macroRowKey, parseRupiah, parseWeight, priceRowKey } from '../src';

describe('parseRupiah', () => {
  it.each([
    ['Rp1.403.300', 1403300],
    ['Rp 1.403.300', 1403300],
    ['Rp. 2.488.800', 2488800],
    ['IDR 1,403,300', 1403300],
    ['1.403.300,00', 1403300],
    ['  987654  ', 987654],
    ['Rp500', 500],
  ])('%s → %d', (input, expected) => {
    expect(parseRupiah(input)).toBe(expected);
  });

  it.each(['', '-', 'Rp', '1.403.300,50', '1.40.300', 'Rp1.403.3OO', '12.5'])(
    'menolak %j',
    (input) => {
      expect(() => parseRupiah(input)).toThrow();
    },
  );
});

describe('parseWeight', () => {
  it.each([
    ['0,5 Gram', 0.5],
    ['0.5 Gram', 0.5],
    ['0.05 Gram', 0.05],
    ['0,05 gr', 0.05],
    ['1 Gram', 1],
    ['1 g', 1],
    ['100 Gram', 100],
    ['1.000 Gram', 1000],
    ['1000 gram', 1000],
    ['0.25', 0.25],
  ])('%s → %d', (input, expected) => {
    expect(parseWeight(input)).toBe(expected);
  });

  it.each(['', 'Gram', '0', '-1 gram', 'satu gram', '1,5,0 gram'])('menolak %j', (input) => {
    expect(() => parseWeight(input)).toThrow();
  });
});

describe('canonicalWeight', () => {
  it.each([
    [0.5, '0.5'],
    [1, '1'],
    [1000, '1000'],
    [0.05, '0.05'],
    [0.1 + 0.2, '0.3'],
    [2.5, '2.5'],
  ])('%d → %s', (input, expected) => {
    expect(canonicalWeight(input)).toBe(expected);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('menolak %d', (input) => {
    expect(() => canonicalWeight(input)).toThrow();
  });
});

describe('row keys', () => {
  it('priceRowKey memakai berat kanonik dan string kosong untuk kunci null', () => {
    expect(
      priceRowKey({
        date: '2026-10-24',
        source: 'pegadaian',
        brand: 'galeri24',
        product: 'gold_bar',
        variant: '',
        weight_g: 0.5,
        location: '',
      }),
    ).toBe('2026-10-24|pegadaian|galeri24|gold_bar||0.5|');
  });

  it('macroRowKey', () => {
    expect(macroRowKey({ date: '2026-10-23', series: 'xau_usd_oz', frequency: 'D' })).toBe(
      '2026-10-23|xau_usd_oz|D',
    );
  });
});
