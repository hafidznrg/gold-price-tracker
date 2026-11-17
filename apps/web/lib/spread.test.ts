import { describe, expect, it } from 'vitest';
import type { LatestFile, LatestSeries, SeriesRowTuple } from './data';
import {
  POPULAR_PAIRS,
  barSources,
  breakEvenPct,
  buildOptions,
  buybackChoices,
  buybackPoints,
  compareItems,
  compatible,
  findGaps,
  joinDays,
  pairDays,
  pairProblem,
  resolveBuyback,
  sellPoints,
  sliceDays,
  todayPair,
  ubsYear,
  weightBarItems,
  spreadPct,
  spreadStats,
  weightSpreads,
  type SpreadOption,
} from './spread';

const o = (over: Partial<SpreadOption>): SpreadOption => ({
  id: 'x',
  label: 'x',
  short: 'x',
  source: 'logammulia',
  brand: 'antam',
  product: 'gold_bar',
  file: 'f',
  variants: [''],
  w: 1,
  color: 'antam',
  ...over,
});

describe('spreadPct / breakEvenPct', () => {
  it('(jual − buyback) / jual', () => {
    expect(spreadPct(2_500_000, 2_350_000)).toBeCloseTo(6, 5);
    expect(spreadPct(null, 1)).toBeNull();
    expect(spreadPct(100, null)).toBeNull();
    expect(spreadPct(0, 0)).toBeNull();
  });
  it('titik impas terhadap buyback', () => {
    expect(breakEvenPct(110, 100)).toBeCloseTo(10, 5);
    expect(breakEvenPct(110, 0)).toBeNull();
  });
});

describe('joinDays / spreadStats', () => {
  const sell = [
    { date: '2026-10-01', value: 100 },
    { date: '2026-10-02', value: 110 },
    { date: '2026-10-03', value: 120 },
  ];
  const buy = [
    { date: '2026-10-02', value: 100 },
    { date: '2026-10-03', value: 114 },
    { date: '2026-10-04', value: 90 },
  ];
  it('hanya hari yang punya keduanya', () => {
    const d = joinDays(sell, buy);
    expect(d.map((x) => x.date)).toEqual(['2026-10-02', '2026-10-03']);
    expect(d[0]?.spread).toBe(10);
  });
  it('statistik: hari ini, rata-rata, tersempit, impas', () => {
    const s = spreadStats(joinDays(sell, buy));
    expect(s?.last.date).toBe('2026-10-03');
    expect(s?.min.date).toBe('2026-10-03');
    expect(s?.avgPct).toBeCloseTo(((10 / 110) * 100 + 5) / 2, 5);
    expect(s?.breakEven).toBeCloseTo((6 / 114) * 100, 5);
    expect(spreadStats([])).toBeNull();
  });
  it('sliceDays inklusif dan from null', () => {
    const d = joinDays(sell, buy);
    expect(sliceDays(d, '2026-10-03', '2026-10-03')).toHaveLength(1);
    expect(sliceDays(d, null, '2026-10-02')).toHaveLength(1);
  });
});

describe('findGaps', () => {
  it('celah ≥ 2 hari kalender', () => {
    expect(findGaps(['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-28'])).toEqual([
      { from: '2026-10-24', to: '2026-10-25' },
    ]);
    expect(findGaps(['2026-10-22'])).toEqual([]);
  });
});

describe('poin dari file series', () => {
  const rows: SeriesRowTuple[] = [
    ['2026-10-26', '2026', 1, 2_483_400, 2_285_000],
    ['2026-10-25', '', 1, null, 2_280_000],
    ['2026-10-26', '', 1, null, 2_000_000],
    ['2026-10-26', '2026', 5, 12_000_000, 11_000_000],
  ];
  it('buyback menggabung variant, variant awal menang', () => {
    const b = buybackPoints({ rows }, o({ variants: ['2026', ''] }));
    expect(b).toEqual([
      { date: '2026-10-25', value: 2_280_000 },
      { date: '2026-10-26', value: 2_285_000 },
    ]);
  });
  it('pasangan hanya di hari jual dan buyback ada', () => {
    const days = pairDays(o({ variants: ['2026'] }), { rows }, o({ variants: ['2026', ''] }), {
      rows,
    });
    expect(days).toHaveLength(1);
    expect(days[0]?.pct).toBeCloseTo(((2_483_400 - 2_285_000) / 2_483_400) * 100, 5);
  });
  it('Tabungan Emas dikonversi ke per gram', () => {
    const t: SeriesRowTuple[] = [['2026-10-31', '', 0.01, 23_600, 22_770]];
    const opt = o({ w: 0.01, product: 'gold_savings', brand: 'pegadaian' });
    expect(sellPoints({ rows: t }, opt)[0]?.value).toBe(2_360_000);
    expect(pairDays(opt, { rows: t }, opt, { rows: t })[0]?.pct).toBeCloseTo(3.5169, 3);
  });
});

describe('compatible', () => {
  it('brand dan produk harus sama', () => {
    expect(compatible(o({}), o({}))).toBe(true);
    expect(compatible(o({}), o({ brand: 'ubs' }))).toBe(false);
  });
  const lm = o({ id: 'lm' });
  const ubs = o({ id: 'ubs', brand: 'ubs' });
  const tab = o({ id: 'tab', brand: 'pegadaian', product: 'gold_savings' });
  const buys = [lm, ubs, tab];
  it('pilihan jual ke hanya pasangan sah', () => {
    expect(buybackChoices(o({ id: 'pg-antam' }), buys).map((b) => b.id)).toEqual(['lm']);
    expect(buybackChoices(o({ brand: 'galeri24' }), buys)).toEqual([]);
  });
  it('pilihan tidak sah diganti pasangan sah pertama; tanpa pasangan = null', () => {
    expect(resolveBuyback(o({ brand: 'ubs' }), buys, 'lm')?.id).toBe('ubs');
    expect(resolveBuyback(o({ brand: 'ubs' }), buys, 'ubs')?.id).toBe('ubs');
    expect(resolveBuyback(o({ brand: 'galeri24' }), buys, 'lm')).toBeNull();
    expect(pairProblem(o({ brand: 'galeri24' }), null)).toMatch(/Belum ada data buyback/);
    expect(pairProblem(lm, lm)).toBeNull();
  });
});

describe('findGaps dengan kalender sumber', () => {
  // Senin–Jumat; 2026-03-19 (Kamis) libur Nyepi.
  const weekdays = (d: string) => {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    return wd >= 1 && wd <= 5 && d !== '2026-03-19';
  };
  it('akhir pekan dan libur tidak dihitung sebagai celah', () => {
    // Jumat 13 → Senin 16 Mar: Sabtu–Minggu saja.
    expect(findGaps(['2026-03-13', '2026-03-16'], 2, weekdays)).toEqual([]);
    // Rabu 18 → Senin 23 Mar: Kamis libur, Jumat hilang (1 hari terbit) → bukan celah.
    expect(findGaps(['2026-03-18', '2026-03-23'], 2, weekdays)).toEqual([]);
  });
  it('dua hari terbit yang hilang tetap celah', () => {
    expect(findGaps(['2026-03-16', '2026-03-19'], 2, weekdays)).toEqual([
      { from: '2026-03-17', to: '2026-03-18' },
    ]);
  });
});

describe('weightSpreads', () => {
  const row = (over: Partial<LatestSeries>) =>
    ({
      file: 'logammulia-antam',
      variant: '',
      current: true,
      date: '2026-11-14',
      buyback: null,
      ...over,
    }) as LatestSeries;
  const latest = (series: LatestSeries[]) => ({ series }) as unknown as LatestFile;

  it('D-39: Logam Mulia memakai buyback 1 g × berat untuk keping lain di tanggal yang sama', () => {
    const rows = weightSpreads(
      latest([
        row({ w: 0.5, sell: 1_308_500 }),
        row({ w: 1, sell: 2_517_000, buyback: 2_293_000 }),
        row({ w: 10, sell: 24_665_000, date: '2026-11-13' }),
      ]),
      'logammulia-antam',
      '',
    );
    expect(rows.map((r) => r.w)).toEqual([0.5, 1, 10]);
    expect(rows[0]!.value).toBeCloseTo((162_000 / 1_308_500) * 100, 6);
    expect(rows[1]!.value).toBeCloseTo((224_000 / 2_517_000) * 100, 6);
    expect(rows[2]!.value).toBeNull();
  });
  it("Galeri24: non_pegadaian = series terpisah; variant '' tidak terpengaruh", () => {
    const f = { file: 'galeri24-antam' };
    const L = latest([
      row({ ...f, w: 1, sell: 2_560_000, buyback: 2_286_000 }),
      row({ ...f, variant: 'non_pegadaian', w: 1, sell: 2_464_000, buyback: 2_178_000 }),
    ]);
    const base = weightSpreads(L, 'galeri24-antam', '');
    expect(base).toHaveLength(1);
    expect(base[0]!.value).toBeCloseTo((274_000 / 2_560_000) * 100, 6);
    const np = weightSpreads(L, 'galeri24-antam', 'non_pegadaian');
    expect(np[0]!.value).toBeCloseTo((286_000 / 2_464_000) * 100, 6);
  });
  it("ubsYear mengabaikan galeri24 non_pegadaian; todayPair '' memakai series ''", () => {
    const L = latest([
      row({
        source: 'galeri24',
        file: 'galeri24-antam',
        w: 1,
        sell: 2_560_000,
        buyback: 2_286_000,
      }),
      row({
        source: 'galeri24',
        file: 'galeri24-antam',
        variant: 'non_pegadaian',
        w: 1,
        sell: 2_464_000,
        buyback: 2_178_000,
      }),
    ]);
    expect(ubsYear(L)).toBe(String(new Date().getUTCFullYear()));
    const g = o({ source: 'galeri24', file: 'galeri24-antam', variants: [''] });
    const p = todayPair(L, g, g);
    expect(p.sell).toBe(2_560_000);
    expect(p.buyback).toBe(2_286_000);
  });
  it('sumber lain tetap ketat: tanpa buyback berat itu = null', () => {
    const rows = weightSpreads(
      latest([
        row({ file: 'ubslifestyle-ubs', w: 1, sell: 2_000_000, buyback: 1_900_000 }),
        row({ file: 'ubslifestyle-ubs', w: 5, sell: 9_800_000 }),
      ]),
      'ubslifestyle-ubs',
      '',
    );
    expect(rows[1]!.value).toBeNull();
  });
});

describe('Galeri24 dan Lotus Archi (P6-10)', () => {
  const latest = { series: [], as_of: null } as unknown as LatestFile;
  const { sell, buyback } = buildOptions(latest);
  const find = (list: SpreadOption[], id: string) => list.find((x) => x.id === id)!;

  it('opsi jual dan buyback baru', () => {
    const sellIds = sell.map((x) => x.id);
    for (const id of ['g24-antam', 'g24-ubs', 'g24-g24', 'g24-lotus', 'pg-lotus']) {
      expect(sellIds).toContain(id);
    }
    const buyIds = buyback.map((x) => x.id);
    for (const id of ['g24-antam', 'g24-ubs', 'g24-g24', 'g24-lotus', 'g24-antam-np']) {
      expect(buyIds).toContain(id);
    }
    expect(buyIds).not.toContain('pg-lotus');
    expect(sellIds).not.toContain('g24-antam-np');
  });

  it('g24-antam-np: buyback saja, varian non_pegadaian, label sesuai', () => {
    const np = find(buyback, 'g24-antam-np');
    expect(np.variants).toEqual(['non_pegadaian']);
    expect(np.file).toBe('galeri24-antam');
    expect(np.label).toBe('Galeri24 · Antam (dibeli di luar Pegadaian) · 1 g');
    // Opsi biasa tidak ikut varian non_pegadaian.
    expect(find(buyback, 'g24-antam').variants).toEqual(['']);
  });

  it('np hanya sah untuk pembelian Antam', () => {
    const np = find(buyback, 'g24-antam-np');
    for (const id of ['lm-antam', 'pg-antam', 'g24-antam']) {
      expect(compatible(find(sell, id), np)).toBe(true);
    }
    for (const id of ['ubsl-ubs', 'pg-ubs', 'g24-g24', 'g24-lotus', 'tab']) {
      expect(compatible(find(sell, id), np)).toBe(false);
    }
  });

  it('pg-g24 dan pg-lotus kini punya pasangan buyback Galeri24', () => {
    expect(resolveBuyback(find(sell, 'pg-g24'), buyback, null)?.id).toBe('g24-g24');
    expect(resolveBuyback(find(sell, 'pg-lotus'), buyback, null)?.id).toBe('g24-lotus');
    expect(buybackChoices(find(sell, 'pg-antam'), buyback).map((x) => x.id)).toEqual([
      'lm-antam',
      'g24-antam',
      'g24-antam-np',
    ]);
    expect(buybackChoices(find(sell, 'pg-ubs'), buyback).map((x) => x.id)).toEqual([
      'ubsl-ubs',
      'g24-ubs',
    ]);
  });

  it('semua pilihan sell punya buyback kecuali tidak ada brand pasangan', () => {
    for (const s of sell) expect(buybackChoices(s, buyback).length).toBeGreaterThan(0);
  });

  it('POPULAR_PAIRS berurutan dan semuanya pasangan sah', () => {
    expect(POPULAR_PAIRS.map((p) => p.label)).toEqual([
      'Antam: Logam Mulia → Logam Mulia',
      'Tabungan Emas: Pegadaian → Pegadaian',
      'Antam: Pegadaian → Galeri24',
      'Antam: Pegadaian → Logam Mulia',
      'Galeri24: Galeri24 → Galeri24',
      'Antam: Logam Mulia → Galeri24 (non-Pegadaian)',
      'UBS: Pegadaian → UBS Lifestyle',
      'UBS: UBS Lifestyle → UBS Lifestyle',
    ]);
    expect(POPULAR_PAIRS.find((p) => p.label.includes('non-Pegadaian'))!.buyback).toBe(
      'g24-antam-np',
    );
    for (const p of POPULAR_PAIRS) {
      expect(compatible(find(sell, p.sell), find(buyback, p.buyback))).toBe(true);
    }
  });

  it('todayPair: np membaca series non_pegadaian, bukan series biasa', () => {
    const mk = (variant: string, sellP: number, buyP: number) =>
      ({
        source: 'galeri24',
        file: 'galeri24-antam',
        variant,
        w: 1,
        current: true,
        date: '2026-11-17',
        sell: sellP,
        buyback: buyP,
        source_updated_at: null,
      }) as unknown as LatestSeries;
    const L = {
      series: [mk('', 2_560_000, 2_286_000), mk('non_pegadaian', 2_464_000, 2_178_000)],
    } as unknown as LatestFile;
    const p = todayPair(L, find(sell, 'g24-antam'), find(buyback, 'g24-antam-np'));
    expect(p.sell).toBe(2_560_000);
    expect(p.buyback).toBe(2_178_000);
  });

  it('barSources: enam sumber berurutan, warna brand, bukan emas', () => {
    const bars = barSources(latest);
    expect(bars.map((b) => b.id)).toEqual([
      'ubsl',
      'lm',
      'g24-antam',
      'g24-ubs',
      'g24-g24',
      'g24-lotus',
    ]);
    expect(bars.map((b) => b.color)).toEqual(['ubs', 'antam', 'antam', 'ubs', 'g24', 'lotus']);
    expect(bars.map((b) => b.color)).not.toContain('gold');
    expect(bars[2]!.label).toBe('Galeri24 · Antam (buyback biasa)');
    expect(bars[0]!.label).toBe('UBS Lifestyle · UBS (tahun produksi berjalan)');
  });

  it('hanya 1 g yang disorot', () => {
    const items = weightBarItems([
      { label: '0,5 g', w: 0.5, value: 8 },
      { label: '1 g', w: 1, value: 7 },
    ]);
    expect(items.map((i) => i.highlight)).toEqual([false, true]);
  });

  it('compareItems memuat Galeri24 1 g dan Lotus Archi 1 g', () => {
    const items = compareItems(latest);
    const names = items.map((c) => `${c.name} · ${c.src}`);
    expect(names).toContain('Galeri24 1 g · Galeri24 → Galeri24');
    expect(names).toContain('Lotus Archi 1 g · Galeri24 → Galeri24');
    expect(names).toContain('Antam 1 g · Logam Mulia → Galeri24 (non-Pegadaian)');
  });
});
