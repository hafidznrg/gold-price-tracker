import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  aggregate,
  asOf,
  breakEvenPct,
  cagr,
  forwardFill,
  goldIdrGram,
  goldIdrGramSeries,
  indexSeries,
  macroPoints,
  matchAcrossSources,
  perGram,
  premiumAntamSeries,
  premiumAt,
  priceOn,
  spread,
  spreadPct,
  TROY_OUNCE_G,
  usdIdrLookup,
  weekdayIso,
  weekdaysBetween,
  yearsBetween,
  type MacroRow,
  type MacroSeriesConfig,
  type Point,
} from '../src';
import { priceRow } from './factories';

// Sama dengan macro_series di config/sources.yml.
const CONFIGS: MacroSeriesConfig[] = [
  { id: 'xau_usd_oz', concept: 'gold_usd', unit: 'USD/ozt', source: 'xaus', precedence: 1 },
  { id: 'usd_idr_jisdor', concept: 'usd_idr', unit: 'IDR/USD', source: 'bi', precedence: 1 },
  { id: 'usd_idr_ecb', concept: 'usd_idr', unit: 'IDR/USD', source: 'ecb', precedence: 2 },
  { id: 'usd_idr_annual', concept: 'usd_idr', unit: 'IDR/USD', source: 'wdi', precedence: 3 },
];

type M = Pick<MacroRow, 'date' | 'series' | 'frequency' | 'value'>;
const m = (series: M['series'], frequency: M['frequency'], date: string, value: number): M => ({
  series,
  frequency,
  date,
  value,
});

/** Baris `D` untuk setiap hari kerja di `[from, to]`, kecuali tanggal di `skip`. */
function weekdays(
  series: M['series'],
  from: string,
  to: string,
  value: number | ((date: string) => number),
  skip: (date: string, i: number) => boolean = () => false,
): M[] {
  const out: M[] = [];
  let i = 0;
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    if ([0, 6].includes(weekdayIso(d))) continue;
    if (!skip(d, i++)) out.push(m(series, 'D', d, typeof value === 'number' ? value : value(d)));
  }
  return out;
}

const pts = (...pairs: [string, number][]): Point[] =>
  pairs.map(([date, value]) => ({ date, value }));

describe('§6.1 rumus', () => {
  const row = { sell_price: 2_488_800, buyback_price: 2_291_000 };

  it('spread, spread_pct, break_even_pct', () => {
    expect(spread(row)).toBe(197_800);
    expect(spreadPct(row)).toBeCloseTo((197_800 / 2_488_800) * 100, 10);
    expect(breakEvenPct(row)).toBeCloseTo((197_800 / 2_291_000) * 100, 10);
  });

  it('null bila jual atau buyback kosong (Pegadaian tanpa buyback)', () => {
    const noBuyback = { sell_price: 2_500_000, buyback_price: null };
    expect(spread(noBuyback)).toBeNull();
    expect(spreadPct(noBuyback)).toBeNull();
    expect(breakEvenPct({ sell_price: null, buyback_price: 2_291_000 })).toBeNull();
  });

  it('per_gram', () => {
    expect(perGram(1_250_000, 0.5)).toBe(2_500_000);
    expect(() => perGram(1, 0)).toThrow();
  });

  it('gold_idr_gram = xau × kurs / 31,1034768', () => {
    expect(TROY_OUNCE_G).toBe(31.1034768);
    expect(goldIdrGram(4120, 16_310)).toBeCloseTo((4120 * 16_310) / 31.1034768, 6);
  });

  it('index dan cagr', () => {
    expect(indexSeries(pts(['2000-01-03', 100], ['2010-01-04', 250]), 100)).toEqual(
      pts(['2000-01-03', 1], ['2010-01-04', 2.5]),
    );
    expect(() => indexSeries([], 0)).toThrow();
    expect(cagr(8, 3)).toBeCloseTo(1, 12);
    expect(cagr(1, 10)).toBe(0);
    expect(() => cagr(2, 0)).toThrow();
    expect(yearsBetween('2000-01-01', '2004-01-01')).toBeCloseTo(4, 12);
  });
});

describe('§6.2 as-of join', () => {
  const series = pts(['2026-10-19', 1], ['2026-10-21', 2], ['2026-10-23', 3]);

  it('titik terakhir ≤ d', () => {
    expect(asOf(series, '2026-10-21', { toleranceDays: 5 })).toEqual(series[1]);
    expect(asOf(series, '2026-10-22', { toleranceDays: 5 })).toEqual(series[1]);
    expect(asOf(series, '2026-10-30', { toleranceDays: 10 })).toEqual(series[2]);
  });

  it('strict: titik harus < d', () => {
    expect(asOf(series, '2026-10-21', { toleranceDays: 5, strict: true })).toEqual(series[0]);
    expect(asOf(series, '2026-10-19', { toleranceDays: 5, strict: true })).toBeNull();
  });

  it('di luar toleransi atau sebelum titik pertama → null', () => {
    expect(asOf(series, '2026-10-28', { toleranceDays: 5 })).toEqual(series[2]);
    expect(asOf(series, '2026-10-29', { toleranceDays: 5 })).toBeNull();
    expect(asOf(series, '2026-10-18', { toleranceDays: 5 })).toBeNull();
    expect(asOf([], '2026-10-18', { toleranceDays: 5 })).toBeNull();
  });

  it('macroPoints memilih seri + frekuensi dan mengurutkan', () => {
    const rows = [
      m('xau_usd_oz', 'D', '2026-10-23', 3),
      m('xau_usd_oz', 'M', '2026-10-01', 9),
      m('xau_usd_oz', 'D', '2026-10-21', 2),
      m('usd_idr_ecb', 'D', '2026-10-22', 7),
    ];
    expect(macroPoints(rows, 'xau_usd_oz', 'D')).toEqual(pts(['2026-10-21', 2], ['2026-10-23', 3]));
  });

  describe('kurs untuk tanggal emas', () => {
    const rows = [
      m('usd_idr_jisdor', 'D', '2026-10-20', 16_300),
      m('usd_idr_ecb', 'D', '2026-10-20', 16_250),
      m('usd_idr_ecb', 'D', '2026-10-27', 16_400),
      m('usd_idr_annual', 'A', '2026-01-01', 16_000),
    ];
    const fx = usdIdrLookup(rows, CONFIGS);

    it('precedence terkecil menang bila keduanya ada', () => {
      expect(fx('2026-10-20')).toEqual({
        date: '2026-10-20',
        value: 16_300,
        series: 'usd_idr_jisdor',
      });
      expect(fx('2026-10-25')).toEqual({
        date: '2026-10-20',
        value: 16_300,
        series: 'usd_idr_jisdor',
      });
    });

    it('seri berikutnya dipakai bila seri utama di luar toleransi 5 hari', () => {
      expect(fx('2026-10-27')).toEqual({
        date: '2026-10-27',
        value: 16_400,
        series: 'usd_idr_ecb',
      });
    });

    it('nilai tahunan tidak dipakai untuk join harian', () => {
      expect(fx('2026-01-02')).toBeNull();
    });
  });

  it('goldIdrGramSeries memasangkan emas dengan kurs ≤ tanggalnya dan mencatat sumber kurs', () => {
    const rows = [
      m('xau_usd_oz', 'D', '2026-10-16', 4000),
      m('xau_usd_oz', 'D', '2026-10-19', 4100),
      m('xau_usd_oz', 'D', '2026-10-20', 4200),
      m('usd_idr_ecb', 'D', '2026-10-19', 16_000),
    ];
    const out = goldIdrGramSeries(rows, CONFIGS);
    expect(out.map((p) => p.date)).toEqual(['2026-10-19', '2026-10-20']); // 16 Okt: belum ada kurs
    expect(out[1]).toEqual({
      date: '2026-10-20',
      value: goldIdrGram(4200, 16_000),
      xau_usd_oz: 4200,
      usd_idr: 16_000,
      usd_idr_series: 'usd_idr_ecb',
      usd_idr_date: '2026-10-19',
    });
  });

  describe('premi Antam', () => {
    const spot = pts(['2026-10-22', 2_000_000], ['2026-10-23', 2_100_000]);

    it('memakai spot pada tanggal terakhir < d', () => {
      // Senin 26 Okt → penutupan Jumat 23 Okt
      expect(premiumAt(2_520_000, '2026-10-26', spot)).toEqual({
        date: '2026-10-26',
        value: 2_520_000 / 2_100_000 - 1,
        spot_date: '2026-10-23',
      });
      expect(premiumAt(2_200_000, '2026-10-23', spot)?.spot_date).toBe('2026-10-22');
    });

    it('null bila spot terakhir lebih dari 5 hari sebelumnya', () => {
      expect(premiumAt(2_520_000, '2026-10-28', spot)?.spot_date).toBe('2026-10-23');
      expect(premiumAt(2_520_000, '2026-10-29', spot)).toBeNull();
    });

    it('premiumAntamSeries hanya memakai Logam Mulia Antam 1 g', () => {
      const prices = [
        priceRow({
          source: 'logammulia',
          brand: 'antam',
          variant: '',
          location: 'jakarta',
          date: '2026-10-26',
          sell_price: 2_520_000,
        }),
        priceRow({
          source: 'logammulia',
          brand: 'antam',
          variant: '',
          location: 'jakarta',
          date: '2026-10-26',
          weight_g: 5,
          sell_price: 12_000_000,
        }),
        priceRow({
          source: 'pegadaian',
          brand: 'antam',
          variant: '',
          date: '2026-10-26',
          sell_price: 2_600_000,
        }),
        priceRow({ date: '2026-10-26' }), // UBS
      ];
      const out = premiumAntamSeries(prices, spot);
      expect(out).toHaveLength(1);
      expect(out[0]!.value).toBeCloseTo(0.2, 12);
    });
  });

  it('kalkulator: nilai terakhir ≤ X, toleransi 7 hari', () => {
    const p = pts(['2026-10-16', 100]);
    expect(priceOn(p, '2026-10-23')).toEqual(p[0]);
    expect(priceOn(p, '2026-10-24')).toBeNull();
  });

  describe('spread lintas sumber', () => {
    const rows = [
      priceRow({ variant: '2025', buyback_price: 2_280_000 }),
      priceRow({ variant: '2026' }),
      priceRow({ source: 'pegadaian', variant: '', sell_price: 2_510_000, buyback_price: null }),
      priceRow({ source: 'pegadaian', variant: '', weight_g: 2 }),
      priceRow({ source: 'pegadaian', variant: '', date: '2026-10-23' }),
    ];
    const key = { date: '2026-10-24', brand: 'ubs', product: 'gold_bar', weight_g: 1 } as const;

    it('default variant UBS = tahun produksi terbaru', () => {
      const out = matchAcrossSources(rows, key);
      expect([...out.keys()].sort()).toEqual(['pegadaian', 'ubslifestyle']);
      expect(out.get('ubslifestyle')!.variant).toBe('2026');
      expect(out.get('pegadaian')!.sell_price).toBe(2_510_000);
    });

    it('pengguna bisa memilih tahun lain', () => {
      expect(
        matchAcrossSources(rows, { ...key, variant: '2025' }).get('ubslifestyle')!.buyback_price,
      ).toBe(2_280_000);
    });
  });

  it('forward-fill berpenanda, tidak mengisi sebelum titik pertama atau melewati maxDays', () => {
    const p = pts(['2026-10-23', 5]);
    expect(forwardFill(p, ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-26'], 2)).toEqual([
      { date: '2026-10-23', value: 5, filled: false, from_date: '2026-10-23' },
      { date: '2026-10-24', value: 5, filled: true, from_date: '2026-10-23' },
    ]);
    expect(forwardFill(p, ['2026-12-31'])).toHaveLength(1);
  });
});

describe('§6.3 resolusi frekuensi', () => {
  it('weekdaysBetween menghitung Senin–Jumat', () => {
    expect(weekdaysBetween('2026-10-26', '2026-11-01')).toBe(5);
    expect(weekdaysBetween('2026-10-31', '2026-11-01')).toBe(0);
    expect(weekdaysBetween('2024-01-01', '2024-12-31')).toBe(262);
  });

  it('tahun dengan data D ≥ 80% memakai rata-rata D', () => {
    const rows = [
      ...weekdays(
        'xau_usd_oz',
        '2024-01-01',
        '2024-12-31',
        (d) => (d < '2024-07-01' ? 2000 : 2400),
        (_, i) => i % 10 === 0,
      ),
      m('xau_usd_oz', 'M', '2024-01-01', 9999),
    ];
    const [y] = aggregate(rows, CONFIGS, 'gold_usd', 'year');
    expect(y).toMatchObject({ period: '2024', series: 'xau_usd_oz', frequency: 'D' });
    expect(y!.coverage).toBeCloseTo(235 / 262, 12);
    expect(y!.value).toBeGreaterThan(2000);
    expect(y!.value).toBeLessThan(2400);
  });

  it('D < 80% → rata-rata M', () => {
    const rows = [
      ...weekdays('xau_usd_oz', '2020-06-01', '2020-12-31', 1800), // ±58% hari kerja
      ...Array.from({ length: 12 }, (_, i) =>
        m('xau_usd_oz', 'M', `2020-${String(i + 1).padStart(2, '0')}-01`, 1500 + i * 10),
      ),
    ];
    expect(aggregate(rows, CONFIGS, 'gold_usd', 'year')).toEqual([
      {
        period: '2020',
        value: 1555,
        series: 'xau_usd_oz',
        frequency: 'M',
        points: 12,
        coverage: null,
      },
    ]);
  });

  it('usd_idr mengikuti precedence: JISDOR parsial 2013 → ECB; 1998 → tahunan', () => {
    const rows = [
      ...weekdays('usd_idr_jisdor', '2013-05-20', '2013-12-31', 11_000),
      ...weekdays('usd_idr_ecb', '2013-01-01', '2013-12-31', 10_500),
      ...weekdays('usd_idr_jisdor', '2014-01-01', '2014-12-31', 12_000),
      ...weekdays('usd_idr_ecb', '2014-01-01', '2014-12-31', 11_900),
      m('usd_idr_annual', 'A', '1998-01-01', 10_013.6),
    ];
    const out = aggregate(rows, CONFIGS, 'usd_idr', 'year');
    expect(out.map((p) => [p.period, p.series, p.frequency, p.value])).toEqual([
      ['1998', 'usd_idr_annual', 'A', 10_013.6],
      ['2013', 'usd_idr_ecb', 'D', 10_500],
      ['2014', 'usd_idr_jisdor', 'D', 12_000],
    ]);
  });

  it('per tahun, M dipakai hanya bila mencakup ≥ 80% bulan; selain itu jatuh ke A', () => {
    const rows = [
      ...[1, 2, 3, 4, 5, 6].map((i) => m('usd_idr_ecb', 'M', `1997-0${i}-01`, 2400)),
      m('usd_idr_annual', 'A', '1997-01-01', 2909.4),
    ];
    expect(aggregate(rows, CONFIGS, 'usd_idr', 'year')[0]).toMatchObject({
      frequency: 'A',
      value: 2909.4,
    });
  });

  it('periode tanpa tingkat yang memenuhi tidak muncul', () => {
    expect(
      aggregate(
        weekdays('xau_usd_oz', '2021-12-01', '2021-12-31', 1800),
        CONFIGS,
        'gold_usd',
        'year',
      ),
    ).toEqual([]);
    expect(aggregate([], CONFIGS, 'gold_usd', 'year')).toEqual([]);
  });

  it('periode berjalan dipotong di until: cakupan dihitung terhadap hari kerja yang sudah lewat', () => {
    const rows = weekdays('xau_usd_oz', '2026-01-01', '2026-10-30', 4000);
    const [y] = aggregate(rows, CONFIGS, 'gold_usd', 'year');
    expect(y).toMatchObject({ period: '2026', frequency: 'D', coverage: 1 });
    // until eksplisit setelah data berakhir menurunkan cakupan
    expect(
      aggregate(rows, CONFIGS, 'gold_usd', 'year', { until: '2026-12-31' })[0]!.coverage,
    ).toBeCloseTo(217 / 261, 12);
    // data setelah until diabaikan
    expect(
      aggregate(rows, CONFIGS, 'gold_usd', 'month', { until: '2026-02-15' }).map((p) => p.period),
    ).toEqual(['2026-01', '2026-02']);
  });

  it('titik akhir pekan tidak menambah cakupan', () => {
    const rows = [
      ...weekdays('xau_usd_oz', '2026-09-01', '2026-09-30', 4000, (_, i) => i % 3 === 0), // ±68%
      ...['2026-09-05', '2026-09-06', '2026-09-12', '2026-09-13', '2026-09-19'].map((d) =>
        m('xau_usd_oz', 'D', d, 4000),
      ),
    ];
    expect(aggregate(rows, CONFIGS, 'gold_usd', 'month')).toEqual([]);
  });

  it('per bulan: D → M bulan itu → A tahunnya', () => {
    const rows = [
      ...weekdays('usd_idr_ecb', '2000-03-01', '2000-03-31', 7500),
      m('usd_idr_ecb', 'M', '2000-02-01', 7400),
      m('usd_idr_annual', 'A', '2000-01-01', 8421.8),
    ];
    const out = aggregate(rows, CONFIGS, 'usd_idr', 'month', { until: '2000-04-30' });
    expect(out.map((p) => [p.period, p.frequency, p.value])).toEqual([
      ['2000-01', 'A', 8421.8],
      ['2000-02', 'M', 7400],
      ['2000-03', 'D', 7500],
      ['2000-04', 'A', 8421.8],
    ]);
  });
});
