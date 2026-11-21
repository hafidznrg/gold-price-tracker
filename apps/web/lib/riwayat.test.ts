import { describe, expect, it } from 'vitest';
import { COMPARE_DEFS, comparePresetHref } from './bandingkan';
import type { ExplorerOption } from './explorer';
import {
  basicEntries,
  basicPricePicks,
  brandAvailability,
  decodeBrandIds,
  decodeShow,
  DEFAULT_BRAND_IDS,
  encodeBrandIds,
  encodeShow,
  spreadPoints,
  spreadRangeStats,
} from './riwayat';

const opt = (over: Partial<ExplorerOption>): ExplorerOption => ({
  id: 'x',
  source: 'logammulia',
  brand: 'antam',
  product: 'gold_bar',
  kind: 'fisik',
  file: 'logammulia-antam',
  w: 1,
  variants: [''],
  first: { sell: '2026-01-01', buyback: '2026-01-01' },
  ...over,
});

const OPTIONS: ExplorerOption[] = [
  opt({ w: 1 }),
  opt({ w: 5, first: { sell: '2026-01-01', buyback: '2026-01-01' }, buybackFromGram: true }),
  opt({
    source: 'pegadaian',
    file: 'pegadaian-antam',
    w: 1,
    first: { sell: '2026-01-01', buyback: null },
  }),
  opt({ source: 'ubslifestyle', brand: 'ubs', file: 'ubslifestyle-ubs', w: 1 }),
  opt({
    source: 'pegadaian',
    brand: 'pegadaian',
    product: 'gold_savings',
    kind: 'tabungan',
    file: 'pegadaian-pegadaian',
    w: 0.01,
  }),
];
const def = (id: string) => COMPARE_DEFS.find((d) => d.id === id)!;

describe('URL mode dasar', () => {
  it('v: bawaan sell tidak ditulis, nilai tak sah → sell', () => {
    expect(decodeShow('spread')).toBe('spread');
    expect(decodeShow('both')).toBe('both');
    expect(decodeShow('bb')).toBe('bb');
    expect(decodeShow('x')).toBe('sell');
    expect(decodeShow(null)).toBe('sell');
    expect(encodeShow('sell')).toBeNull();
    expect(encodeShow('both')).toBe('both');
  });

  it('b: bawaan, id tak sah diabaikan, urut COMPARE_DEFS, `-` kosong', () => {
    expect(decodeBrandIds(null)).toEqual([...DEFAULT_BRAND_IDS]);
    expect(decodeBrandIds('g24-g24,lm-antam,zzz,lm-antam')).toEqual(['lm-antam', 'g24-g24']);
    expect(decodeBrandIds('zzz')).toEqual([...DEFAULT_BRAND_IDS]);
    expect(decodeBrandIds('-')).toEqual([]);
  });

  it('b: daftar bawaan (urutan apa pun) tidak ditulis', () => {
    expect(encodeBrandIds([...DEFAULT_BRAND_IDS].reverse())).toBeNull();
    expect(encodeBrandIds([])).toBe('-');
    expect(encodeBrandIds(['tab', 'lm-antam'])).toBe('lm-antam,tab');
  });
});

describe('ketersediaan brand', () => {
  it('Harga jual: ada bila gramasinya dijual', () => {
    expect(brandAvailability(def('lm-antam'), 5, 'sell', OPTIONS)).toEqual({ ok: true });
    expect(brandAvailability(def('pg-antam'), 5, 'sell', OPTIONS)).toEqual({
      ok: false,
      reason: 'Tidak ada 5 g',
    });
  });
  it('selain Harga jual butuh buyback; per gram LM (D-60) tetap ada', () => {
    expect(brandAvailability(def('pg-antam'), 1, 'spread', OPTIONS)).toEqual({
      ok: false,
      reason: 'tanpa buyback',
    });
    expect(brandAvailability(def('lm-antam'), 5, 'bb', OPTIONS)).toEqual({ ok: true });
    expect(brandAvailability(def('ubsl-ubs'), 1, 'both', OPTIONS)).toEqual({ ok: true });
  });
  it('Tabungan Emas selalu tersedia', () => {
    for (const show of ['sell', 'bb', 'spread', 'both'] as const) {
      expect(brandAvailability(def('tab'), 5, show, OPTIONS)).toEqual({ ok: true });
    }
  });
});

describe('keadaan dasar → seri', () => {
  const ids = ['lm-antam', 'pg-antam', 'ubsl-ubs', 'tab'];
  it('hanya brand tersedia, urut definisi', () => {
    expect(basicEntries(ids, 1, 'sell', OPTIONS).map((e) => e.def.id)).toEqual([
      'lm-antam',
      'pg-antam',
      'ubsl-ubs',
      'tab',
    ]);
    expect(basicEntries(ids, 1, 'bb', OPTIONS).map((e) => e.def.id)).toEqual([
      'lm-antam',
      'ubsl-ubs',
      'tab',
    ]);
    expect(basicEntries(ids, 5, 'sell', OPTIONS).map((e) => e.def.id)).toEqual(['lm-antam', 'tab']);
  });
  it('pilihan harga: jual untuk sell/both, buyback untuk bb, kosong untuk spread', () => {
    const e = basicEntries(['lm-antam'], 5, 'bb', OPTIONS);
    expect(basicPricePicks(e, 'bb')[0]).toMatchObject({ w: 5, price: 'buyback' });
    expect(basicPricePicks(e, 'both')[0]).toMatchObject({ w: 5, price: 'sell' });
    expect(basicPricePicks(e, 'spread')).toEqual([]);
    expect(e[0]!.opt.buybackFromGram).toBe(true);
  });
});

describe('spread %', () => {
  const sell = [
    { date: '2026-01-01', value: 1000 },
    { date: '2026-01-02', value: 1000 },
    { date: '2026-01-03', value: 1100 },
  ];
  const bb = [
    { date: '2026-01-02', value: 900 },
    { date: '2026-01-03', value: 990 },
    { date: '2026-01-04', value: 500 },
  ];
  it('(jual − buyback) ÷ jual pada tanggal yang sama', () => {
    expect(spreadPoints(sell, bb)).toEqual([
      { date: '2026-01-02', value: 10 },
      { date: '2026-01-03', value: 10 },
    ]);
  });
  it('statistik rentang: terakhir dan rata-rata', () => {
    const pts = [
      { date: '2026-01-01', value: 4 },
      { date: '2026-01-02', value: 6 },
      { date: '2026-01-03', value: 8 },
    ];
    expect(spreadRangeStats(pts, '2026-01-02', '2026-01-31')).toEqual({
      last: { date: '2026-01-03', value: 8 },
      avg: 7,
      count: 2,
    });
    expect(spreadRangeStats(pts, '2026-02-01', '2026-02-28')).toBeNull();
  });
});

describe('comparePresetHref', () => {
  it('g, semua brand yang ada di gramasi itu, per gram, rentang opsional', () => {
    expect(comparePresetHref(5, OPTIONS)).toBe('/explorer?g=5&b=lm-antam,tab&m=gram');
    expect(comparePresetHref(1, OPTIONS, '6B')).toBe(
      '/explorer?g=1&b=lm-antam,pg-antam,ubsl-ubs,tab&m=gram&r=6B',
    );
  });
});
