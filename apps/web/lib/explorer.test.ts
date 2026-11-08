import { describe, expect, it } from 'vitest';
import type { MetaFile, SeriesRowTuple } from './data';
import {
  DEFAULT_PICKS,
  aggregateClose,
  applyMode,
  decodeAgg,
  decodeFlag,
  decodeMode,
  encodeAgg,
  encodeMode,
  fillGaps,
  fillNotes,
  gramDivisor,
  periodOf,
  periodSpan,
  viewChartPoints,
  viewGaps,
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

// ---------------------------------------------------------------------------
// Tampilan (P4-01..03)

const pt = (date: string, value: number) => ({ date, value });
const view = (date: string, value: number) => ({
  date,
  value,
  min: null,
  max: null,
  filledFrom: null,
});

describe('parameter tampilan di URL', () => {
  it('bolak-balik; nilai asing → bawaan', () => {
    for (const m of ['nominal', 'gram', 'index', 'pct'] as const) {
      expect(decodeMode(encodeMode(m))).toBe(m);
    }
    for (const a of ['d', 'w', 'm'] as const) expect(decodeAgg(encodeAgg(a))).toBe(a);
    expect(encodeMode('nominal')).toBeNull();
    expect(encodeAgg('d')).toBeNull();
    expect(decodeMode('foo')).toBe('nominal');
    expect(decodeAgg('x')).toBe('d');
    expect(decodeFlag('1')).toBe(true);
    expect(decodeFlag('true')).toBe(false);
    expect(decodeFlag(null)).toBe(false);
  });
});

describe('periode', () => {
  it('mingguan = Senin; bulanan = YYYY-MM', () => {
    expect(periodOf('2026-10-28', 'w')).toBe('2026-10-26');
    expect(periodOf('2026-11-01', 'w')).toBe('2026-10-26');
    expect(periodOf('2026-10-26', 'w')).toBe('2026-10-26');
    expect(periodOf('2026-10-28', 'm')).toBe('2026-10');
    expect(periodSpan('2026-10-26', 'w')).toEqual(['2026-10-26', '2026-11-01']);
    expect(periodSpan('2026-12', 'm')).toEqual(['2026-12-01', '2026-12-31']);
    expect(periodSpan('2024-02', 'm')).toEqual(['2024-02-01', '2024-02-29']);
  });
});

describe('aggregateClose', () => {
  const pts = [
    pt('2026-10-26', 10),
    pt('2026-10-28', 14),
    pt('2026-10-30', 12),
    pt('2026-11-03', 20),
    pt('2026-11-04', 18),
  ];
  it('harian apa adanya', () => {
    expect(aggregateClose(pts, 'd')).toHaveLength(5);
  });
  it('mingguan: penutupan = titik terakhir pekan, dengan min–maks', () => {
    expect(aggregateClose(pts, 'w')).toEqual([
      { date: '2026-10-30', value: 12, min: 10, max: 14, filledFrom: null },
      { date: '2026-11-04', value: 18, min: 18, max: 20, filledFrom: null },
    ]);
  });
  it('bulanan', () => {
    expect(aggregateClose(pts, 'm').map((p) => [p.date, p.value, p.min, p.max])).toEqual([
      ['2026-10-30', 12, 10, 14],
      ['2026-11-04', 18, 18, 20],
    ]);
  });
  it('kosong → kosong', () => {
    expect(aggregateClose([], 'w')).toEqual([]);
  });
});

describe('applyMode', () => {
  const pts = [view('2026-10-01', 100), view('2026-10-05', 110), view('2026-10-10', 90)];
  it('nominal tidak mengubah; gram membagi', () => {
    expect(applyMode(pts, 'nominal', 5, null, '2026-10-31').map((p) => p.value)).toEqual([
      100, 110, 90,
    ]);
    expect(applyMode(pts, 'gram', 5, null, '2026-10-31').map((p) => p.value)).toEqual([20, 22, 18]);
  });
  it('indeks = 100 di titik pertama terlihat; % ubah = 0', () => {
    const idx = applyMode(pts, 'index', 1, null, '2026-10-31').map((p) => p.value);
    expect(idx[0]).toBe(100);
    expect(idx[1]).toBeCloseTo(110);
    expect(idx[2]).toBeCloseTo(90);
    const pct = applyMode(pts, 'pct', 1, null, '2026-10-31').map((p) => p.value);
    expect(pct[0]).toBeCloseTo(0);
    expect(pct[1]).toBeCloseTo(10);
    expect(pct[2]).toBeCloseTo(-10);
  });
  it('rentang memotong data: dasar = titik pertama di dalam rentang, titik sebelumnya relatif', () => {
    const out = applyMode(pts, 'index', 1, '2026-10-02', '2026-10-31');
    expect(out[0]!.value).toBeCloseTo(100 / 1.1);
    expect(out[1]!.value).toBe(100);
    expect(out[2]!.value).toBeCloseTo((90 / 110) * 100);
  });
  it('series mulai setelah awal rentang: dasar = titik pertamanya', () => {
    const out = applyMode(pts, 'index', 1, '2026-09-01', '2026-10-31');
    expect(out[0]!.value).toBe(100);
  });
  it('tanpa titik di rentang atau dasar ≤ 0 → kosong', () => {
    expect(applyMode(pts, 'index', 1, '2026-11-01', '2026-11-30')).toEqual([]);
    expect(applyMode([view('2026-10-01', 0)], 'pct', 1, null, '2026-10-31')).toEqual([]);
  });
  it('pita min–maks ikut diskalakan', () => {
    const agg = [{ date: '2026-10-05', value: 12, min: 10, max: 14, filledFrom: null }];
    const [p] = applyMode(agg, 'index', 1, null, '2026-10-31');
    expect([p!.value, p!.min, p!.max]).toEqual([100, (10 / 12) * 100, (14 / 12) * 100]);
  });
  it('gramDivisor: Tabungan Emas sudah per gram', () => {
    expect(gramDivisor({ product: 'gold_savings', w: 0.01 })).toBe(1);
    expect(gramDivisor({ product: 'gold_bar', w: 5 })).toBe(5);
  });
});

describe('fillGaps (forward-fill)', () => {
  const weekdays = (d: string) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  const pts = [view('2026-10-26', 10), view('2026-10-29', 12)];

  it('harian: mengisi hari terbit yang kosong saja, berpenanda asal', () => {
    const out = fillGaps(pts, 'd', weekdays);
    expect(out.map((p) => [p.date, p.value, p.filledFrom])).toEqual([
      ['2026-10-26', 10, null],
      ['2026-10-27', 10, '2026-10-26'],
      ['2026-10-28', 10, '2026-10-26'],
      ['2026-10-29', 12, null],
    ]);
  });
  it('akhir pekan yang tidak terbit tidak diisi', () => {
    const out = fillGaps([view('2026-10-30', 5), view('2026-11-02', 6)], 'd', weekdays);
    expect(out.map((p) => p.date)).toEqual(['2026-10-30', '2026-11-02']);
  });
  it('mingguan/bulanan: hanya periode yang kosong sama sekali', () => {
    const w = fillGaps([view('2026-10-02', 1), view('2026-10-23', 4)], 'w');
    expect(w.map((p) => [p.date, p.value, p.filledFrom])).toEqual([
      ['2026-10-02', 1, null],
      ['2026-10-11', 1, '2026-10-02'],
      ['2026-10-18', 1, '2026-10-02'],
      ['2026-10-23', 4, null],
    ]);
    const m = fillGaps([view('2026-01-15', 1), view('2026-04-02', 4)], 'm');
    expect(m.map((p) => [p.date, p.filledFrom])).toEqual([
      ['2026-01-15', null],
      ['2026-02-28', '2026-01-15'],
      ['2026-03-31', '2026-01-15'],
      ['2026-04-02', null],
    ]);
  });
  it('satu titik atau kosong tidak diubah', () => {
    expect(fillGaps([view('2026-10-26', 10)], 'd')).toHaveLength(1);
    expect(fillGaps([], 'm')).toEqual([]);
  });
  it('catatan tooltip hanya untuk titik isian', () => {
    expect(fillNotes(fillGaps(pts, 'd', weekdays))).toEqual({
      '2026-10-27': 'isi dari 2026-10-26',
      '2026-10-28': 'isi dari 2026-10-26',
    });
  });
});

describe('celah dan titik grafik tampilan', () => {
  it('viewGaps: harian apa adanya; agregasi hanya periode utuh', () => {
    const gaps = [{ from: '2026-10-05', to: '2026-10-28' }];
    expect(viewGaps(gaps, 'd')).toEqual(gaps);
    expect(viewGaps(gaps, 'w')).toEqual([{ from: '2026-10-05', to: '2026-10-25' }]);
    expect(viewGaps(gaps, 'm')).toEqual([]);
    expect(viewGaps([{ from: '2026-10-01', to: '2026-11-30' }], 'm')).toEqual([
      { from: '2026-10-01', to: '2026-11-30' },
    ]);
    expect(viewGaps([{ from: '2026-10-07', to: '2026-10-09' }], 'w')).toEqual([]);
  });
  it('null di awal celah hanya bila isi celah mati', () => {
    const pts = [view('2026-10-01', 1), view('2026-10-09', 2)];
    const gaps = [{ from: '2026-10-02', to: '2026-10-08' }];
    expect(viewChartPoints(pts, gaps, false)).toEqual([
      ['2026-10-01', 1],
      ['2026-10-02', null],
      ['2026-10-09', 2],
    ]);
    expect(viewChartPoints(pts, gaps, true)).toEqual([
      ['2026-10-01', 1],
      ['2026-10-09', 2],
    ]);
  });
});

describe('batas rentang dan celah (risiko Fase 4)', () => {
  it('pekan melintasi pergantian tahun satu periode; bulan berbeda terpisah', () => {
    const pts = [pt('2026-12-30', 1), pt('2027-01-01', 3), pt('2027-01-04', 5)];
    expect(aggregateClose(pts, 'w').map((p) => [p.date, p.value, p.min, p.max])).toEqual([
      ['2027-01-01', 3, 1, 3],
      ['2027-01-04', 5, 5, 5],
    ]);
    expect(aggregateClose(pts, 'm').map((p) => [p.date, p.value])).toEqual([
      ['2026-12-30', 1],
      ['2027-01-04', 5],
    ]);
  });

  it('indeks mingguan: dasar = penutupan pekan pertama yang terlihat di rentang', () => {
    const pts = aggregateClose(
      [pt('2026-10-05', 100), pt('2026-10-09', 110), pt('2026-10-14', 120), pt('2026-10-16', 150)],
      'w',
    );
    // rentang mulai Rabu 14 Okt: pekan 5–11 Okt (penutupan 9 Okt) berada sebelum rentang
    const out = applyMode(pts, 'index', 1, '2026-10-14', '2026-10-31');
    expect(out.map((p) => p.date)).toEqual(['2026-10-09', '2026-10-16']);
    expect(out[1]!.value).toBe(100);
    expect(out[0]!.value).toBeCloseTo((110 / 150) * 100);
  });

  it('rentang berakhir sebelum titik pertama atau mulai sesudah titik terakhir → kosong', () => {
    const pts = [view('2026-10-05', 100), view('2026-10-09', 110)];
    expect(applyMode(pts, 'pct', 1, '2026-09-01', '2026-09-30')).toEqual([]);
    expect(applyMode(pts, 'pct', 1, '2026-11-01', '2026-11-30')).toEqual([]);
  });

  it('isi celah tidak memperpanjang sebelum titik pertama atau sesudah titik terakhir', () => {
    const out = fillGaps([view('2026-10-07', 1), view('2026-10-20', 2)], 'w');
    expect(out[0]!.date).toBe('2026-10-07');
    expect(out.at(-1)!.date).toBe('2026-10-20');
    expect(out.filter((p) => p.filledFrom !== null).map((p) => p.date)).toEqual(['2026-10-18']);
  });

  it('isi celah bulanan melintasi pergantian tahun dan Februari kabisat', () => {
    const out = fillGaps([view('2023-12-15', 1), view('2024-03-02', 4)], 'm');
    expect(out.map((p) => [p.date, p.filledFrom])).toEqual([
      ['2023-12-15', null],
      ['2024-01-31', '2023-12-15'],
      ['2024-02-29', '2023-12-15'],
      ['2024-03-02', null],
    ]);
  });

  it('viewGaps: celah persis satu pekan penuh Senin–Minggu tetap ada; satu hari kurang hilang', () => {
    expect(viewGaps([{ from: '2026-10-05', to: '2026-10-11' }], 'w')).toEqual([
      { from: '2026-10-05', to: '2026-10-11' },
    ]);
    expect(viewGaps([{ from: '2026-10-05', to: '2026-10-10' }], 'w')).toEqual([]);
    expect(viewGaps([{ from: '2026-10-06', to: '2026-10-12' }], 'w')).toEqual([]);
  });
});
