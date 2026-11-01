import { describe, expect, it } from 'vitest';
import type { MetaFile, SeriesRowTuple } from './data';
import {
  DEFAULT_PICKS,
  MAX_SERIES,
  chartPoints,
  decodePick,
  decodePicks,
  decodeRange,
  effectiveRange,
  encodePick,
  encodePicks,
  encodeRange,
  explorerOptions,
  mergeGaps,
  rangeStats,
  resolvePick,
  seriesPoints,
} from './explorer';

describe('kunci series di URL', () => {
  it('bolak-balik, termasuk berat desimal', () => {
    const p = { source: 'pegadaian', brand: 'pegadaian', w: 0.01, price: 'sell' } as const;
    expect(encodePick(p)).toBe('pegadaian-pegadaian-0.01-sell');
    expect(decodePick('pegadaian-pegadaian-0.01-sell')).toEqual(p);
    expect(decodePick('logammulia-antam-0.5-buyback')?.w).toBe(0.5);
  });

  it('menolak kunci rusak', () => {
    for (const k of [
      '',
      'x',
      'logammulia-antam-1',
      'foo-antam-1-sell',
      'logammulia-foo-1-sell',
      'logammulia-antam-1-mid',
      'logammulia-antam-0-sell',
      'logammulia-antam-1.0-sell',
      'logammulia-antam-abc-sell',
    ]) {
      expect(decodePick(k)).toBeNull();
    }
  });

  it('kosong → bawaan, "-" → kosong, rusak/duplikat diabaikan, maks 8', () => {
    expect(decodePicks(null)).toBe(DEFAULT_PICKS);
    expect(decodePicks('-')).toEqual([]);
    expect(decodePicks('sampah,,x-y')).toBe(DEFAULT_PICKS);
    const r = decodePicks('sampah,logammulia-antam-1-sell,logammulia-antam-1-sell');
    expect(r.map(encodePick)).toEqual(['logammulia-antam-1-sell']);
    const many = [1, 2, 3, 5, 10, 25, 50, 100, 250, 500]
      .map((w) => `logammulia-antam-${w}-sell`)
      .join(',');
    expect(decodePicks(many)).toHaveLength(MAX_SERIES);
  });

  it('encodePicks bolak-balik', () => {
    expect(decodePicks(encodePicks(DEFAULT_PICKS))).toEqual(DEFAULT_PICKS);
    expect(encodePicks([])).toBe('-');
  });

  it('rentang: preset, kustom, rusak', () => {
    expect(decodeRange(null)).toBe('1T');
    expect(decodeRange('6B')).toBe('6B');
    expect(decodeRange('2026-01-01..2026-10-31')).toEqual({ from: '2026-01-01', to: '2026-10-31' });
    expect(encodeRange({ from: '2026-01-01', to: '2026-10-31' })).toBe('2026-01-01..2026-10-31');
    expect(decodeRange('2026-10-31..2026-01-01')).toBe('1T');
    expect(decodeRange('2026-02-30..2026-03-01')).toBe('1T');
    expect(decodeRange('10Y')).toBe('1T');
  });
});

const meta = (rows: Partial<MetaFile['series'][number]>[]) =>
  ({
    series: rows.map((r) => ({
      key: 'k',
      file: 'f',
      rows: 1,
      first_date: '2026-01-01',
      first_sell_date: '2026-01-01',
      first_buyback_date: null,
      source: 'ubslifestyle',
      brand: 'ubs',
      product: 'gold_bar',
      variant: '',
      w: 1,
      ...r,
    })),
  }) as Pick<MetaFile, 'series'>;

describe('explorerOptions', () => {
  it('UBS: varian tahun berjalan + backfill, tanggal pertama per jenis harga', () => {
    const opts = explorerOptions(
      meta([
        { variant: '', first_sell_date: null, first_buyback_date: '2023-11-20' },
        { variant: '2026', first_sell_date: '2026-10-26', first_buyback_date: '2026-10-26' },
        { variant: '2025', first_sell_date: '2025-01-01', first_buyback_date: '2025-01-01' },
      ]),
    );
    expect(opts).toHaveLength(1);
    expect(opts[0]?.variants).toEqual(['2026', '']);
    expect(opts[0]?.first).toEqual({ sell: '2026-10-26', buyback: '2023-11-20' });
  });

  it('resolvePick menolak jenis harga yang tidak tersedia', () => {
    const opts = explorerOptions(meta([{ source: 'pegadaian', brand: 'galeri24' }]));
    expect(
      resolvePick({ source: 'pegadaian', brand: 'galeri24', w: 1, price: 'sell' }, opts),
    ).not.toBeNull();
    expect(
      resolvePick({ source: 'pegadaian', brand: 'galeri24', w: 1, price: 'buyback' }, opts),
    ).toBeNull();
    expect(
      resolvePick({ source: 'pegadaian', brand: 'galeri24', w: 2, price: 'sell' }, opts),
    ).toBeNull();
  });
});

describe('seriesPoints', () => {
  const rows: SeriesRowTuple[] = [
    ['2026-10-01', '', 1, null, 2_000_000],
    ['2026-10-02', '', 1, null, 2_010_000],
    ['2026-10-02', '2026', 1, 2_500_000, 2_050_000],
    ['2026-10-03', '2026', 1, 2_510_000, 2_060_000],
  ];
  it('menyambung varian; varian awal menang', () => {
    const pts = seriesPoints(
      { rows },
      { variants: ['2026', ''], w: 1, product: 'gold_bar' },
      'buyback',
    );
    expect(pts.map((p) => [p.date, p.value])).toEqual([
      ['2026-10-01', 2_000_000],
      ['2026-10-02', 2_050_000],
      ['2026-10-03', 2_060_000],
    ]);
  });
  it('Tabungan Emas dibagi berat → per gram', () => {
    const pts = seriesPoints(
      { rows: [['2026-10-01', '', 0.01, 24_000, 23_000]] },
      { variants: [''], w: 0.01, product: 'gold_savings' },
      'sell',
    );
    expect(pts).toEqual([{ date: '2026-10-01', value: 2_400_000 }]);
  });
});

describe('celah', () => {
  it('menyisipkan null di hari pertama celah ≥ 2 hari, bukan celah 1 hari', () => {
    const pts = ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-28'].map((date) => ({
      date,
      value: 1,
    }));
    const r = chartPoints(pts);
    expect(r.gaps).toEqual([{ from: '2026-10-24', to: '2026-10-25' }]);
    expect(r.points).toContainEqual(['2026-10-24', null]);
    expect(r.points.filter((p) => p[1] === null)).toHaveLength(1);
    expect(r.points.map((p) => p[0])).toEqual([...r.points.map((p) => p[0])].sort());
  });
  it('mergeGaps membuang duplikat', () => {
    const g = { from: '2026-10-24', to: '2026-10-25' };
    expect(mergeGaps([[g], [g]])).toEqual([g]);
  });
});

describe('rangeStats', () => {
  const pts = [
    ['2026-10-26', 100],
    ['2026-10-27', 120],
    ['2026-10-30', 90],
    ['2026-10-31', 110],
  ].map(([date, value]) => ({ date: date as string, value: value as number }));
  it('awal/akhir/ubah/min/maks/hari tanpa data dalam rentang', () => {
    const s = rangeStats(pts, '2026-10-01', '2026-10-31')!;
    expect(s.first.value).toBe(100);
    expect(s.last.value).toBe(110);
    expect(s.changeAbs).toBe(10);
    expect(s.changePct).toBeCloseTo(10);
    expect(s.min).toEqual({ date: '2026-10-30', value: 90 });
    expect(s.max.value).toBe(120);
    expect(s.missingDays).toBe(2);
    expect(s.startsLate).toBe(true);
  });
  it('memotong rentang; kosong → null', () => {
    expect(rangeStats(pts, '2026-10-30', '2026-10-31')?.first.value).toBe(90);
    expect(rangeStats(pts, '2026-11-01', '2026-11-30')).toBeNull();
    expect(rangeStats(pts, null, '2026-10-31')?.startsLate).toBe(false);
  });
  it('effectiveRange: Semua → tanggal data paling awal', () => {
    expect(effectiveRange('Semua', '2026-10-31', '2010-01-04')).toEqual({
      from: '2010-01-04',
      to: '2026-10-31',
    });
    expect(effectiveRange('7H', '2026-10-31', '2010-01-04').from).toBe('2026-10-25');
  });
});
