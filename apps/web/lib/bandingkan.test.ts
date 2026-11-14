import { describe, expect, it } from 'vitest';
import {
  COMPARE_DEFS,
  compareLine,
  compareOptions,
  compareWeights,
  decodeCompareMode,
  decodeWeight,
  encodeCompareMode,
  encodeWeight,
  findOption,
  premiumMonthlyLine,
  premiumStats,
  todayCells,
  todayRows,
} from './bandingkan';
import type { LatestFile, LatestSeries, SeriesRowTuple } from './data';
import type { ExplorerOption } from './explorer';

const opt = (over: Partial<ExplorerOption>): ExplorerOption => ({
  id: 'x',
  source: 'logammulia',
  brand: 'antam',
  product: 'gold_bar',
  kind: 'fisik',
  file: 'logammulia-antam',
  w: 1,
  variants: [''],
  first: { sell: '2026-01-01', buyback: null },
  ...over,
});

const UBS = { source: 'ubslifestyle', brand: 'ubs', file: 'ubslifestyle-ubs' } as const;
const OPTIONS: ExplorerOption[] = [
  opt({ w: 1 }),
  opt({ w: 5 }),
  opt({ w: 0.5 }),
  opt({ source: 'pegadaian', file: 'pegadaian-antam', w: 1 }),
  opt({ source: 'pegadaian', file: 'pegadaian-antam', w: 5 }),
  opt({ ...UBS, w: 0.05, variants: ['2026', ''] }),
  opt({ ...UBS, w: 1, variants: ['2026', ''] }),
  opt({
    source: 'pegadaian',
    brand: 'pegadaian',
    product: 'gold_savings',
    kind: 'tabungan',
    file: 'pegadaian-pegadaian',
    w: 0.01,
  }),
  // Brand/sumber di luar enam series.
  opt({ source: 'logammulia', brand: 'ubs', file: 'x-ubs', w: 77 }),
];

const def = (id: string) => COMPARE_DEFS.find((d) => d.id === id)!;

describe('pencocokan series per berat', () => {
  it('findOption: berat sama per series; Tabungan Emas melayani semua berat', () => {
    expect(findOption(def('lm-antam'), 5, OPTIONS)?.w).toBe(5);
    expect(findOption(def('lm-antam'), 2, OPTIONS)).toBeNull();
    expect(findOption(def('pg-ubs'), 1, OPTIONS)).toBeNull();
    expect(findOption(def('ubsl-ubs'), 0.05, OPTIONS)?.variants).toEqual(['2026', '']);
    expect(findOption(def('tab'), 5, OPTIONS)?.w).toBe(0.01);
  });

  it('compareWeights: hanya berat yang dijual oleh sedikitnya dua series', () => {
    // 1 g: LM, Pegadaian Antam, UBS; 5 g: LM, Pegadaian Antam; 0,5 dan 0,05 hanya satu series.
    expect(compareWeights(compareOptions(OPTIONS))).toEqual([1, 5]);
  });

  it('compareOptions membuang opsi di luar enam series', () => {
    expect(compareOptions(OPTIONS)).toHaveLength(OPTIONS.length - 1);
  });
});

describe('URL', () => {
  it('berat: bawaan 1 g tidak ditulis, nilai tak sah kembali ke 1 g', () => {
    expect(encodeWeight(1)).toBeNull();
    expect(encodeWeight(0.5)).toBe('0.5');
    expect(decodeWeight('5', [1, 5])).toBe(5);
    expect(decodeWeight('7', [1, 5])).toBe(1);
    expect(decodeWeight('abc', [1, 5])).toBe(1);
    expect(decodeWeight(null, [1, 5])).toBe(1);
  });
  it('mode', () => {
    expect(decodeCompareMode('idx')).toBe('index');
    expect(decodeCompareMode(null)).toBe('gram');
    expect(decodeCompareMode('x')).toBe('gram');
    expect(encodeCompareMode('gram')).toBeNull();
    expect(encodeCompareMode('index')).toBe('idx');
  });
});

describe('compareLine', () => {
  const rows: SeriesRowTuple[] = [
    ['2026-01-01', '', 5, 500, null],
    ['2026-01-02', '', 5, 510, null],
    ['2026-01-05', '', 5, 550, null],
    ['2026-01-06', '', 5, 560, null],
    ['2026-01-01', '', 1, 100, null],
  ];
  const o = opt({ w: 5 });
  it('per gram: harga dibagi berat, celah diberi null', () => {
    const l = compareLine(o, { rows }, 'gram', null, '2026-01-31');
    expect(l.points).toEqual([
      ['2026-01-01', 100],
      ['2026-01-02', 102],
      ['2026-01-03', null],
      ['2026-01-05', 110],
      ['2026-01-06', 112],
    ]);
    expect(l.gaps).toEqual([{ from: '2026-01-03', to: '2026-01-04' }]);
  });
  it('indeks: titik pertama di rentang = 100, di luar rentang dipotong', () => {
    const l = compareLine(o, { rows }, 'index', '2026-01-02', '2026-01-31');
    expect(l.first).toBe('2026-01-02');
    expect(l.points[0]).toEqual(['2026-01-02', 100]);
    expect(l.points.at(-1)![1]).toBeCloseTo((560 / 510) * 100, 6);
  });
  it('tanpa data di rentang: kosong', () => {
    const l = compareLine(o, { rows }, 'index', '2027-01-01', '2027-02-01');
    expect(l.points).toEqual([]);
    expect(l.first).toBeNull();
  });
  it('Tabungan Emas sudah per gram (dibagi 0,01 oleh seriesPoints), bukan dibagi berat pilihan', () => {
    const tab = opt({ product: 'gold_savings', w: 0.01 });
    const l = compareLine(
      tab,
      { rows: [['2026-01-01', '', 0.01, 25, null]] },
      'gram',
      null,
      '2026-01-31',
    );
    expect(l.points).toEqual([['2026-01-01', 2500]]);
  });
});

function ls(over: Partial<LatestSeries>): LatestSeries {
  return {
    key: 'k',
    source: 'logammulia',
    brand: 'antam',
    product: 'gold_bar',
    variant: '',
    w: 1,
    file: 'logammulia-antam',
    date: '2026-11-07',
    sell: 2_000_000,
    buyback: null,
    source_updated_at: null,
    prev: null,
    change: { sell: null, buyback: null },
    spread: null,
    spread_pct: null,
    current: true,
    spark: { start: '', end: '', sell: [], buyback: null },
    ...over,
  };
}
const latest = (series: LatestSeries[]) => ({ series }) as unknown as LatestFile;

describe('tabel hari ini', () => {
  const ubs = { source: 'ubslifestyle', brand: 'ubs', file: 'ubslifestyle-ubs' } as const;
  const L = latest([
    ls({ w: 1, sell: 2_000_000, buyback: 1_900_000 }),
    ls({ w: 5, sell: 9_800_000 }),
    ls({ source: 'pegadaian', file: 'pegadaian-antam', w: 5, sell: 9_900_000 }),
    ls({ source: 'pegadaian', file: 'pegadaian-antam', w: 1, sell: 2_050_000 }),
    ls({ ...ubs, variant: '2026', w: 1, sell: 1_990_000, buyback: null }),
    ls({ ...ubs, variant: '', w: 1, sell: 1, buyback: 1_700_000, current: true }),
    ls({ ...ubs, variant: '2020', w: 1, sell: 1, buyback: 1, current: false }),
    ls({
      source: 'pegadaian',
      brand: 'pegadaian',
      product: 'gold_savings',
      file: 'pegadaian-pegadaian',
      w: 0.01,
      sell: 19_000,
      buyback: 18_000,
    }),
  ]);
  const cells = todayCells(L);

  it('1 g: urut per gram termurah, Tabungan Emas = per gram dikali berat', () => {
    const rows = todayRows(cells, 1);
    expect(rows.map((r) => r.def.id)).toEqual(['tab', 'ubsl-ubs', 'lm-antam', 'pg-antam']);
    expect(rows[0]).toMatchObject({ sell: 1_900_000, buyback: 1_800_000, cheapest: true });
    expect(rows[0]!.diffPct).toBe(0);
    expect(rows[1]!.diffPct).toBeCloseTo((1_990_000 / 1_900_000 - 1) * 100, 6);
  });
  it('variant UBS: tahun terbaru menang, kolom kosong diisi variant berikutnya; yang tak current diabaikan', () => {
    const row = todayRows(cells, 1).find((r) => r.def.id === 'ubsl-ubs')!;
    expect(row.sell).toBe(1_990_000);
    expect(row.buyback).toBe(1_700_000);
  });
  it('5 g: per gram = harga dibagi berat; series tanpa berat itu tidak muncul; buyback kosong = null', () => {
    const rows = todayRows(cells, 5);
    expect(rows.map((r) => r.def.id)).toEqual(['tab', 'lm-antam', 'pg-antam']);
    const lm = rows.find((r) => r.def.id === 'lm-antam')!;
    expect(lm.perGram).toBe(1_960_000);
    expect(lm.buyback).toBeNull();
    expect(lm.spreadPct).toBeNull();
    expect(rows[0]!.sell).toBe(9_500_000);
  });
});

describe('premiumStats', () => {
  it('kosong menghasilkan null', () => expect(premiumStats([])).toBeNull());
  it('rata-rata, terendah, tertinggi, terakhir', () => {
    const s = premiumStats([
      ['2026-01-01', 4, '2025-12-31'],
      ['2026-01-02', 8, '2026-01-01'],
      ['2026-01-03', 6, '2026-01-02'],
    ])!;
    expect(s.avgPct).toBe(6);
    expect(s.min).toEqual({ date: '2026-01-01', pct: 4 });
    expect(s.max).toEqual({ date: '2026-01-02', pct: 8 });
    expect(s.last).toEqual({ date: '2026-01-03', pct: 6, spotDate: '2026-01-02' });
    expect(s.firstDate).toBe('2026-01-01');
  });
});

describe('premiumMonthlyLine', () => {
  it('menyambung premi bulanan lama dengan rata-rata harian per bulan', () => {
    const line = premiumMonthlyLine(
      [
        ['2021-11-08', 12, '2021-11-05'],
        ['2021-11-09', 14, '2021-11-08'],
        ['2021-12-01', 10, '2021-11-30'],
      ],
      [['2021-10', 15, 'M', 20]],
    );
    expect(line).toEqual([
      { month: '2021-10', pct: 15, basis: 'monthly', days: 20 },
      { month: '2021-11', pct: 13, basis: 'daily', days: 2 },
      { month: '2021-12', pct: 10, basis: 'daily', days: 1 },
    ]);
  });
  it('bulan yang sudah ada di bagian bulanan tidak diganda', () => {
    const line = premiumMonthlyLine([['2021-10-29', 9, '2021-10-28']], [['2021-10', 15, 'M', 20]]);
    expect(line).toHaveLength(1);
    expect(line[0]!.basis).toBe('monthly');
  });
});
