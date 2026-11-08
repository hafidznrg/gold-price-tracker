import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnnualFile, AnnualRow, LatestFile, LatestSpot } from './data';
import {
  buildLine,
  buildModel,
  cagr,
  decodeAggregation,
  decodeBaseYear,
  goldIdrGram,
  logAxis,
  sourceLabel,
  spotPoint,
  yearRows,
  yearsBetween,
  yearX,
} from './kelipatan';

function row(year: number, usd: number, fx: number, over: Partial<AnnualRow> = {}): AnnualRow {
  return {
    year,
    gold_usd: { value: usd, series: 'xau_usd_oz', frequency: 'M', points: 12, coverage: null },
    usd_idr: { value: fx, series: 'usd_idr_ecb', frequency: 'D', points: 250, coverage: 0.99 },
    year_end: {
      gold_usd: { date: `${year}-12-01`, value: usd * 1.1 },
      usd_idr: { date: `${year}-12-30`, value: fx * 1.05 },
    },
    idr_gram: { value: goldIdrGram(usd, fx) * 1.001, months: 12 },
    antam_lm: null,
    ...over,
  };
}

const ROWS: AnnualRow[] = [
  row(1996, 400, 2400),
  row(2000, 280, 8400),
  row(2010, 1200, 9000, {
    antam_lm: { avg: 450_000, end: 470_000, end_date: '2010-12-30', days: 300 },
  }),
  row(2020, 1800, 14_500, {
    antam_lm: { avg: 900_000, end: 950_000, end_date: '2020-12-30', days: 360 },
  }),
  row(2026, 4500, 17_500, {
    antam_lm: { avg: 2_400_000, end: 2_500_000, end_date: '2026-11-06', days: 300 },
  }),
];
const UNTIL = '2026-11-06';

const SPOT: LatestSpot = {
  snapshot: {
    fetched_at: '2026-11-06T16:56:35Z',
    xau_usd_oz: 4000,
    usd_idr: 18_000,
    usd_idr_series: 'usd_idr_jisdor',
    usd_idr_date: '2026-11-05',
    source: 'xaus',
    stale: false,
  },
  idr_gram: goldIdrGram(4000, 18_000),
  premium_antam: null,
};

describe('parameter URL', () => {
  it('tahun dasar dan agregasi: nilai tak valid kembali ke bawaan', () => {
    expect(decodeBaseYear('2010')).toBe(2010);
    expect(decodeBaseYear('2011')).toBe(1996);
    expect(decodeBaseYear(null)).toBe(1996);
    expect(decodeAggregation('end')).toBe('end');
    expect(decodeAggregation('avg')).toBe('avg');
    expect(decodeAggregation('x')).toBe('avg');
  });
});

describe('rumus salinan derive.ts', () => {
  it('cagr dan yearsBetween setara @gold/schema', async () => {
    const d = await import('@gold/schema');
    expect(cagr(10, 20)).toBeCloseTo(d.cagr(10, 20), 12);
    expect(yearsBetween('1996-07-01', '2026-11-07')).toBeCloseTo(
      d.yearsBetween('1996-07-01', '2026-11-07'),
      12,
    );
    expect(goldIdrGram(2000, 15_000)).toBeCloseTo(d.goldIdrGram(2000, 15_000), 9);
    expect(cagr(2, 0)).toBeNull();
  });
});

describe('titik tahunan', () => {
  it('posisi X: pertengahan tahun / 31 Des; tahun berjalan menyesuaikan until', () => {
    expect(yearX(2020, 'avg', UNTIL)).toBe('2020-07-01');
    expect(yearX(2020, 'end', UNTIL)).toBe('2020-12-31');
    expect(yearX(2026, 'end', UNTIL)).toBe(UNTIL);
    // 1 Jan – 6 Nov 2026 = 309 hari → tengah = hari ke-155 (4 Jun)
    expect(yearX(2026, 'avg', UNTIL)).toBe('2026-06-05');
    expect(yearX(2026, 'avg', null)).toBe('2026-07-01');
  });

  it('rata-rata memakai nilai agregat; penutupan memakai year_end dan menurunkan Rp/gram', () => {
    const avg = yearRows(ROWS, 'avg', UNTIL).find((r) => r.year === 2000)!;
    expect(avg.usd).toBe(280);
    expect(avg.fx).toBe(8400);
    expect(avg.idr).toBeCloseTo(goldIdrGram(280, 8400) * 1.001, 6);
    expect(avg.lm).toBeNull();
    const end = yearRows(ROWS, 'end', UNTIL).find((r) => r.year === 2020)!;
    expect(end.usd).toBeCloseTo(1980, 6);
    expect(end.fx).toBeCloseTo(15_225, 6);
    expect(end.idr).toBeCloseTo(goldIdrGram(1980, 15_225), 6);
    expect(end.lm).toBe(950_000);
    expect(end.usdSrc?.date).toBe('2020-12-01');
    expect(yearRows(ROWS, 'avg', UNTIL).find((r) => r.year === 2026)!.partial).toBe(true);
  });

  it('tahun tanpa penutupan → nilai null, bukan 0', () => {
    const rows = [row(2001, 300, 9000, { year_end: { gold_usd: null, usd_idr: null } })];
    const r = yearRows(rows, 'end', UNTIL)[0]!;
    expect([r.usd, r.fx, r.idr]).toEqual([null, null, null]);
  });

  it('label sumber mengikuti frekuensi dan agregasi', () => {
    const src = (
      series: 'xau_usd_oz' | 'usd_idr_annual',
      frequency: 'D' | 'M' | 'A',
      date: string | null,
    ) => ({
      series,
      frequency,
      date,
    });
    expect(sourceLabel(src('xau_usd_oz', 'D', null), 'avg')).toBe('xaus · harian');
    expect(sourceLabel(src('xau_usd_oz', 'M', null), 'avg')).toBe('World Bank · bulanan');
    expect(sourceLabel(src('xau_usd_oz', 'D', '2025-12-30'), 'end')).toBe('xaus · harian, 30 Des');
    expect(sourceLabel(src('xau_usd_oz', 'M', '1996-12-01'), 'end')).toBe(
      'World Bank · rata-rata Des',
    );
    expect(sourceLabel(src('usd_idr_annual', 'A', '1996-01-01'), 'end')).toContain(
      'bukan penutupan',
    );
    expect(sourceLabel(null, 'avg')).toBe('—');
  });
});

describe('garis kelipatan', () => {
  it('diindeks ke tahun dasar (=1) dan hanya mulai dari tahun dasar', () => {
    const m = buildModel(ROWS, UNTIL, null, 2000, 'avg');
    expect(m.lines.usd!.points[0]).toEqual(['2000-07-01', 1]);
    expect(m.lines.usd!.points.map((p) => p[0].slice(0, 4))).toEqual([
      '2000',
      '2010',
      '2020',
      '2026',
    ]);
    expect(m.lines.fx!.points.at(-1)![1]).toBeCloseTo(17_500 / 8400, 9);
    expect(m.lines.usd!.spot).toBeNull();
    expect(m.lines.usd!.last).toBeCloseTo(4500 / 280, 9);
  });

  it('tahun dasar tanpa baris → garis null', () => {
    const m = buildModel(ROWS, UNTIL, null, 2005, 'avg');
    expect(m.lines.idr).toBeNull();
  });

  it('titik spot: kelipatan terhadap nilai tahun dasar, tanggal WIB, setelah titik tahunan terakhir', () => {
    const m = buildModel(ROWS, UNTIL, SPOT, 1996, 'avg');
    expect(m.spot!.date).toBe('2026-11-06'); // 16.56 UTC = 23.56 WIB, hari yang sama
    expect(m.lines.usd!.spot).toEqual(['2026-11-06', 4000 / 400]);
    expect(m.lines.fx!.spot![1]).toBeCloseTo(18_000 / 2400, 9);
    expect(m.lines.idr!.last).toBeCloseTo(SPOT.idr_gram / (goldIdrGram(400, 2400) * 1.001), 9);
  });

  it('penutupan: titik terakhir = until dan spot digeser bila tanggalnya tidak lebih akhir', () => {
    const spot = spotPoint(SPOT, '2026-11-06');
    expect(spot!.date).toBe('2026-11-06');
    expect(spot!.x).toBe('2026-11-07');
    expect(spotPoint(null, null)).toBeNull();
  });

  it('CAGR dari titik dasar ke titik terakhir', () => {
    const m = buildModel(ROWS, UNTIL, SPOT, 1996, 'avg');
    const usd = m.lines.usd!;
    const years = yearsBetween('1996-07-01', '2026-11-06');
    expect(usd.cagr).toBeCloseTo(10 ** (1 / years) - 1, 9);
  });

  it('Antam: tahun dasar < 2010 → diindeks ke 2010; ≥ 2010 → ke tahun dasar', () => {
    const early = buildModel(ROWS, UNTIL, SPOT, 1996, 'avg').lines.lm!;
    expect(early.baseYear).toBe(2010);
    expect(early.points[0]).toEqual(['2010-07-01', 1]);
    expect(early.points.at(-1)![1]).toBeCloseTo(2_400_000 / 450_000, 9);
    expect(early.spot).toBeNull();
    const late = buildModel(ROWS, UNTIL, SPOT, 2020, 'end').lines.lm!;
    expect(late.baseYear).toBe(2020);
    expect(late.points.at(-1)![1]).toBeCloseTo(2_500_000 / 950_000, 9);
  });

  it('buildLine: nilai dasar nol/null tidak membagi nol', () => {
    const rows = yearRows([row(2000, 0, 8400)], 'avg', null);
    expect(buildLine('usd', rows, 2000, null)).toBeNull();
  });
});

describe('identitas Rp/gram ≈ US$/oz × kurs', () => {
  function check(rows: AnnualRow[], until: string | null, tolerance: number) {
    for (const agg of ['avg', 'end'] as const) {
      const m = buildModel(rows, until, null, 1996, agg);
      for (const r of m.rows) {
        const b = m.rows.find((x) => x.year === 1996)!;
        if (r.idr === null || r.usd === null || r.fx === null) continue;
        const kIdr = r.idr / b.idr!;
        const kProduct = (r.usd / b.usd!) * (r.fx / b.fx!);
        expect(Math.abs(kIdr / kProduct - 1), `${agg} ${r.year}`).toBeLessThan(tolerance);
      }
    }
  }

  it('data contoh: selisih < 1% tiap tahun', () => {
    check(ROWS, UNTIL, 0.01);
  });

  const annualPath = path.join(process.cwd(), 'public', 'data', 'derived', 'annual.json');
  it.skipIf(!existsSync(annualPath))('data nyata (annual.json): selisih < 1% tiap tahun', () => {
    const file = JSON.parse(readFileSync(annualPath, 'utf8')) as AnnualFile;
    check(file.rows, file.until, 0.01);
  });

  const latestPath = path.join(process.cwd(), 'public', 'data', 'latest.json');
  it.skipIf(!existsSync(annualPath) || !existsSync(latestPath))(
    'data nyata: titik spot ≈ ×80 / ×10,3 / ×7,7 untuk tahun dasar 1996 (cek silang P2-12)',
    () => {
      const file = JSON.parse(readFileSync(annualPath, 'utf8')) as AnnualFile;
      const latest = JSON.parse(readFileSync(latestPath, 'utf8')) as LatestFile;
      const m = buildModel(file.rows, file.until, latest.spot, 1996, 'avg');
      expect(m.lines.idr!.last!).toBeGreaterThan(70);
      expect(m.lines.idr!.last!).toBeLessThan(95);
      expect(m.lines.usd!.last!).toBeGreaterThan(9);
      expect(m.lines.usd!.last!).toBeLessThan(12.5);
      expect(m.lines.fx!.last!).toBeGreaterThan(7);
      expect(m.lines.fx!.last!).toBeLessThan(8.3);
      // Rata-rata berjalan tahun terakhir: ×86,6 / ×11,63 / ×7,47 saat P2-12, bergeser sedikit dengan data baru.
      const y = m.rows.at(-1)!;
      const b = m.rows[0]!;
      expect(y.idr! / b.idr!).toBeGreaterThan(80);
      expect(y.idr! / b.idr!).toBeLessThan(92);
    },
  );
});

describe('sumbu log', () => {
  it('tick ×1, ×2, ×5, ×10 … memuat semua nilai', () => {
    const a = logAxis([1, 3.2, 86.6]);
    expect(a.min).toBe(0.5);
    expect(a.max).toBe(100);
    expect(a.ticks).toEqual([0.5, 1, 2, 5, 10, 20, 50, 100]);
  });

  it('rentang sempit tetap punya beberapa tick; tanpa nilai → bawaan', () => {
    const a = logAxis([1, 1.4]);
    expect(a.ticks.length).toBeGreaterThanOrEqual(3);
    expect(a.ticks).toContain(1);
    expect(logAxis([]).ticks).toEqual([0.5, 1, 2, 5, 10]);
  });
});
