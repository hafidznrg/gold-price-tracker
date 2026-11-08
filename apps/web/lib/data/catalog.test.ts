import { describe, expect, it } from 'vitest';
import {
  colorToken,
  displayBrand,
  parsePriceSeriesKey,
  parseSeriesKey,
  perGramPrice,
  priceSeriesKey,
  selectSeries,
  seriesFileId,
  seriesInFile,
  seriesKey,
  unitLabel,
} from './catalog';
import type { SeriesRef } from './types';

const ubs: SeriesRef = {
  source: 'ubslifestyle',
  brand: 'ubs',
  product: 'gold_bar',
  variant: '2026',
  w: 0.5,
};

describe('kunci series', () => {
  it('bolak-balik', () => {
    expect(seriesKey(ubs)).toBe('ubslifestyle:ubs:gold_bar:2026:0.5');
    expect(parseSeriesKey(seriesKey(ubs))).toEqual(ubs);
    const lm = {
      source: 'logammulia',
      brand: 'antam',
      product: 'gold_bar',
      variant: '',
      w: 1,
    } as const;
    expect(seriesKey(lm)).toBe('logammulia:antam:gold_bar::1');
    expect(parseSeriesKey('logammulia:antam:gold_bar::1')).toEqual(lm);
    expect(priceSeriesKey({ ...lm, price: 'buyback' })).toBe(
      'logammulia:antam:gold_bar::1:buyback',
    );
    expect(parsePriceSeriesKey('logammulia:antam:gold_bar::1:sell')).toEqual({
      ...lm,
      price: 'sell',
    });
  });

  it('menolak kunci tidak valid', () => {
    expect(parseSeriesKey('x:antam:gold_bar::1')).toBeNull();
    expect(parseSeriesKey('logammulia:antam:gold_bar::1.0')).toBeNull();
    expect(parseSeriesKey('logammulia:antam:gold_bar:1')).toBeNull();
    expect(parsePriceSeriesKey('logammulia:antam:gold_bar::1:mid')).toBeNull();
  });

  it('id file', () => {
    expect(seriesFileId({ source: 'pegadaian', brand: 'pegadaian', product: 'gold_savings' })).toBe(
      'pegadaian-pegadaian',
    );
    expect(seriesFileId({ source: 'pegadaian', brand: 'antam', product: 'gold_bar_retro' })).toBe(
      'pegadaian-antam-gold-bar-retro',
    );
  });
});

describe('file ringkas', () => {
  const file = {
    rows: [
      ['2026-10-30', '2026', 1, 100, 90],
      ['2026-10-30', '2026', 0.5, 60, null],
      ['2026-10-31', '2026', 1, null, 91],
      ['2026-10-31', '', 1, null, 92],
    ] as [string, string, number, number | null, number | null][],
  };
  it('selectSeries melewati null', () => {
    expect(selectSeries(file, { variant: '2026', w: 1, price: 'sell' })).toEqual([
      { date: '2026-10-30', value: 100 },
    ]);
    expect(selectSeries(file, { variant: '2026', w: 1, price: 'buyback' })).toHaveLength(2);
  });
  it('seriesInFile', () => {
    expect(seriesInFile(file)).toEqual([
      { variant: '', w: 1 },
      { variant: '2026', w: 0.5 },
      { variant: '2026', w: 1 },
    ]);
  });
});

describe('label dan warna', () => {
  it('per gram', () => {
    expect(perGramPrice(23_600, 0.01)).toBe(2_360_000);
    expect(perGramPrice(24_580, 0.01)).toBe(2_458_000);
    expect(perGramPrice(7_575_000, 3)).toBe(2_525_000);
    expect(perGramPrice(null, 1)).toBeNull();
  });
  it('wording mockup', () => {
    expect(displayBrand({ brand: 'pegadaian', product: 'gold_savings' })).toBe('Tabungan Emas');
    expect(displayBrand({ brand: 'galeri24', product: 'gold_bar' })).toBe('Galeri24');
    expect(unitLabel({ source: 'logammulia', product: 'gold_bar' })).toBe(
      'Harga dasar · keping 1 g',
    );
    expect(unitLabel({ source: 'pegadaian', product: 'gold_savings' })).toBe(
      'Harga jual · per gram',
    );
    expect(colorToken({ brand: 'galeri24', product: 'gold_bar' })).toBe('g24');
    expect(colorToken({ brand: 'pegadaian', product: 'gold_savings' })).toBe('tab');
  });
});
