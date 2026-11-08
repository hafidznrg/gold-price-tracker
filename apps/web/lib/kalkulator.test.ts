import * as schema from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { COMPARE_DEFS } from './bandingkan';
import type { SeriesPoint } from './data';
import type { ExplorerOption } from './explorer';
import {
  buyDefs,
  buyQuote,
  CALCULATOR_TOLERANCE_DAYS,
  chartModel,
  breakEven,
  decodeState,
  defaultDate,
  encodeState,
  formatHold,
  normalizeState,
  outcome,
  piecePoints,
  priceOn,
  sellAvailable,
  sellCandidates,
  weightsFor,
  yearAgo,
} from './kalkulator';

const opt = (over: Partial<ExplorerOption>): ExplorerOption => ({
  id: 'x',
  source: 'logammulia',
  brand: 'antam',
  product: 'gold_bar',
  kind: 'fisik',
  file: 'logammulia-antam',
  w: 1,
  variants: [''],
  first: { sell: '2010-01-04', buyback: '2015-11-25' },
  ...over,
});

const OPTIONS: ExplorerOption[] = [
  opt({ w: 1 }),
  opt({ w: 5, first: { sell: '2026-10-26', buyback: null } }),
  opt({
    source: 'pegadaian',
    file: 'pegadaian-antam',
    w: 1,
    first: { sell: '2026-10-31', buyback: null },
  }),
  opt({
    source: 'pegadaian',
    file: 'pegadaian-antam',
    w: 5,
    first: { sell: '2026-10-31', buyback: null },
  }),
  opt({
    source: 'ubslifestyle',
    brand: 'ubs',
    file: 'ubslifestyle-ubs',
    w: 1,
    variants: ['2026', ''],
    first: { sell: '2026-10-26', buyback: '2023-11-20' },
  }),
  opt({
    source: 'pegadaian',
    brand: 'galeri24',
    file: 'pegadaian-galeri24',
    w: 1,
    first: { sell: '2026-10-31', buyback: null },
  }),
  opt({
    source: 'pegadaian',
    brand: 'pegadaian',
    product: 'gold_savings',
    kind: 'tabungan',
    file: 'pegadaian-pegadaian',
    w: 0.01,
    first: { sell: '2025-11-06', buyback: '2025-11-06' },
  }),
];
const CTX = { options: OPTIONS, asOf: '2026-11-07' };

describe('kesetaraan dengan @gold/schema', () => {
  it('toleransi dan priceOn sama dengan derive.ts', () => {
    expect(CALCULATOR_TOLERANCE_DAYS).toBe(schema.CALCULATOR_TOLERANCE_DAYS);
    const pts = [
      { date: '2026-03-02', value: 10 },
      { date: '2026-03-03', value: 11 },
      { date: '2026-03-10', value: 12 },
    ];
    for (const d of [
      '2026-03-01',
      '2026-03-02',
      '2026-03-09',
      '2026-03-10',
      '2026-03-17',
      '2026-03-18',
    ]) {
      expect(priceOn(pts, d)).toEqual(schema.priceOn(pts, d));
    }
  });
});

describe('harga pada tanggal beli (toleransi 7 hari)', () => {
  const pts = [
    { date: '2026-03-02', value: 100 },
    { date: '2026-03-10', value: 110 },
  ];
  it('tanggal persis dan hari sesudahnya memakai nilai terakhir ≤ tanggal', () => {
    expect(buyQuote(pts, '2026-03-10')).toEqual({
      ok: true,
      date: '2026-03-10',
      price: 110,
      daysOff: 0,
    });
    expect(buyQuote(pts, '2026-03-12')).toMatchObject({ ok: true, date: '2026-03-10', daysOff: 2 });
  });
  it('batas toleransi: 7 hari masih sah, 8 hari tidak', () => {
    expect(buyQuote(pts, '2026-03-17')).toMatchObject({ ok: true, date: '2026-03-10', daysOff: 7 });
    expect(buyQuote(pts, '2026-03-18')).toMatchObject({
      ok: false,
      reason: 'after',
      suggest: '2026-03-10',
    });
  });
  it('sebelum data pertama: alasan before + tanggal paling awal', () => {
    expect(buyQuote(pts, '2026-02-01')).toEqual({
      ok: false,
      reason: 'before',
      first: '2026-03-02',
      last: '2026-03-10',
      suggest: '2026-03-02',
    });
  });
  it('celah di tengah data > toleransi: alasan gap, saran titik sebelumnya', () => {
    const gap = [
      { date: '2026-01-01', value: 1 },
      { date: '2026-02-01', value: 2 },
    ];
    expect(buyQuote(gap, '2026-01-20')).toMatchObject({
      ok: false,
      reason: 'gap',
      suggest: '2026-01-01',
    });
  });
  it('data kosong', () => {
    expect(buyQuote([], '2026-01-01')).toMatchObject({ ok: false, reason: 'empty', suggest: null });
  });
});

describe('Tabungan Emas per gram', () => {
  it('keping berat w = harga per gram × w (dibulatkan); emas fisik apa adanya', () => {
    const pts: SeriesPoint[] = [{ date: '2026-01-01', value: 2_385_000.5 }];
    expect(piecePoints(pts, true, 5)[0]!.value).toBe(11_925_003);
    expect(piecePoints(pts, true, 0.5)[0]!.value).toBe(1_192_500);
    expect(piecePoints([{ date: '2026-01-01', value: 2_512_000 }], false, 5)[0]!.value).toBe(
      2_512_000,
    );
  });
});

describe('hasil untung/rugi', () => {
  const buy = { date: '2025-11-07', price: 2_000_000 };
  it('untung: banyak keping mengalikan modal dan nilai', () => {
    const o = outcome(buy, { date: '2026-11-07', price: 2_300_000 }, 3);
    expect(o.modal).toBe(6_000_000);
    expect(o.value).toBe(6_900_000);
    expect(o.profit).toBe(900_000);
    expect(o.profitPct).toBeCloseTo(15, 10);
    expect(o.holdDays).toBe(365);
    expect(o.cagr).toBeCloseTo(0.15, 10);
    expect(o.breakEvenPrice).toBe(2_000_000);
    expect(o.breakEvenGapPct).toBeLessThan(0);
  });
  it('rugi: tanda negatif, butuh kenaikan agar impas', () => {
    const o = outcome(buy, { date: '2026-11-07', price: 1_900_000 }, 1);
    expect(o.profit).toBe(-100_000);
    expect(o.profitPct).toBeCloseTo(-5, 10);
    expect(o.breakEvenGapPct).toBeCloseTo((2_000_000 / 1_900_000 - 1) * 100, 10);
    expect(o.cagr).toBeLessThan(0);
  });
  it('tepat impas: untung nol dan persen nol', () => {
    const o = outcome(buy, { date: '2026-11-07', price: 2_000_000 }, 2);
    expect(o.profit).toBe(0);
    expect(o.profitPct).toBe(0);
    expect(o.breakEvenGapPct).toBe(0);
  });
  it('masa simpan pendek: CAGR disembunyikan', () => {
    const o = outcome({ date: '2026-11-01', price: 100 }, { date: '2026-11-07', price: 110 }, 1);
    expect(o.holdDays).toBe(6);
    expect(o.cagr).toBeNull();
  });
  it('modal nol tidak membagi nol', () => {
    expect(
      outcome({ date: '2026-01-01', price: 0 }, { date: '2026-02-01', price: 5 }, 1).profitPct,
    ).toBe(0);
  });
  it('format masa simpan', () => {
    expect(formatHold(12)).toBe('12 hari');
    expect(formatHold(365)).toBe('12 bulan');
    expect(formatHold(730)).toBe('2 tahun');
    expect(formatHold(913)).toBe('2,5 tahun');
  });
});

describe('titik impas', () => {
  const pts = [
    { date: '2026-01-01', value: 90 },
    { date: '2026-01-02', value: 100 },
    { date: '2026-01-03', value: 95 },
    { date: '2026-01-04', value: 101 },
    { date: '2026-01-05', value: 105 },
  ];
  it('tercapai: awal rangkaian terakhir di atas harga beli, bukan sentuhan pertama', () => {
    const be = breakEven(pts, '2026-01-01', 100);
    expect(be).toMatchObject({
      reached: true,
      since: '2026-01-04',
      lastAbove: '2026-01-05',
      truncated: false,
    });
  });
  it('belum tercapai sekarang tetapi pernah: lastAbove terisi', () => {
    const be = breakEven(pts.slice(0, 3), '2026-01-01', 100);
    expect(be).toMatchObject({ reached: false, since: null, lastAbove: '2026-01-02' });
  });
  it('tak pernah di atas harga beli', () => {
    const be = breakEven(pts, '2026-01-01', 500);
    expect(be).toMatchObject({ reached: false, since: null, lastAbove: null, price: 500 });
  });
  it('hanya titik sejak tanggal beli yang dihitung', () => {
    expect(breakEven(pts, '2026-01-03', 100)).toMatchObject({ since: '2026-01-04' });
  });
  it('riwayat buyback pendek: ditandai truncated', () => {
    const be = breakEven(pts, '2025-06-01', 80);
    expect(be.truncated).toBe(true);
    expect(be.firstDate).toBe('2026-01-01');
    expect(breakEven(pts, '2025-12-30', 80).truncated).toBe(false);
  });
  it('tanpa data', () => {
    expect(breakEven([], '2026-01-01', 100)).toMatchObject({
      reached: false,
      firstDate: null,
      truncated: false,
    });
  });
});

describe('model grafik', () => {
  const pts = [
    { date: '2026-01-05', value: 100 },
    { date: '2026-01-06', value: 110 },
    { date: '2026-01-20', value: 120 },
  ];
  it('nilai = qty × buyback sejak tanggal beli; modal datar; celah diberi null', () => {
    const m = chartModel(pts, 2, '2026-01-01', 150);
    expect(m.value.filter((p) => p[1] !== null).map((p) => p[1])).toEqual([200, 220, 240]);
    expect(m.modal).toEqual([
      ['2026-01-05', 150],
      ['2026-01-20', 150],
    ]);
    expect(m.gaps).toHaveLength(1);
    expect(m.first).toBe('2026-01-05');
    expect(m.last).toBe('2026-01-20');
  });
  it('titik sebelum tanggal beli dibuang; kosong menghasilkan model kosong', () => {
    expect(chartModel(pts, 1, '2026-01-10', 1).first).toBe('2026-01-20');
    const e = chartModel([], 1, '2026-01-10', 1);
    expect(e.value).toEqual([]);
    expect(e.modal).toEqual([]);
  });
});

describe('pilihan sumber dari katalog', () => {
  const def = (id: string) => COMPARE_DEFS.find((d) => d.id === id)!;
  it('sumber beli = yang punya harga jual; gramasi per sumber', () => {
    expect(buyDefs(OPTIONS).map((d) => d.id)).toEqual([
      'lm-antam',
      'pg-antam',
      'ubsl-ubs',
      'pg-g24',
      'tab',
    ]);
    expect(weightsFor(def('lm-antam'), OPTIONS)).toEqual([1, 5]);
    expect(weightsFor(def('ubsl-ubs'), OPTIONS)).toEqual([1]);
    // Tabungan Emas melayani semua berat fisik.
    expect(weightsFor(def('tab'), OPTIONS)).toEqual([1, 5]);
  });
  it('sumber jual: brand sama; hanya yang punya buyback untuk berat itu', () => {
    expect(sellCandidates(def('lm-antam')).map((d) => d.id)).toEqual(['lm-antam', 'pg-antam']);
    expect(sellAvailable(def('lm-antam'), 1, OPTIONS)).toBe(true);
    expect(sellAvailable(def('lm-antam'), 5, OPTIONS)).toBe(false);
    expect(sellAvailable(def('pg-antam'), 1, OPTIONS)).toBe(false);
    expect(sellAvailable(def('tab'), 5, OPTIONS)).toBe(true);
    expect(sellAvailable(def('pg-g24'), 1, OPTIONS)).toBe(false);
  });
});

describe('keadaan di URL', () => {
  it('bawaan: 1 tahun lalu, Antam LM 1 g, 1 keping, jual ke Antam LM', () => {
    const s = decodeState({}, CTX);
    expect(s).toEqual({ date: '2025-11-07', buyId: 'lm-antam', w: 1, qty: 1, sellId: 'lm-antam' });
    expect(encodeState(s, CTX)).toEqual({ d: null, b: null, w: null, q: null, s: null });
  });
  it('pulang-pergi nilai non-bawaan', () => {
    const raw = { d: '2024-03-15', b: 'tab', w: '5', q: '3', s: 'tab' };
    const s = decodeState(raw, CTX);
    expect(s).toEqual({ date: '2024-03-15', buyId: 'tab', w: 5, qty: 3, sellId: 'tab' });
    expect(encodeState(s, CTX)).toEqual({ d: '2024-03-15', b: 'tab', w: '5', q: '3', s: null });
  });
  it('nilai rusak atau tidak ada di data kembali ke pilihan sah terdekat', () => {
    expect(decodeState({ d: 'abc', b: 'zzz', w: '77', q: '-2', s: 'pg-antam' }, CTX)).toEqual({
      date: '2025-11-07',
      buyId: 'lm-antam',
      w: 1,
      qty: 1,
      sellId: 'lm-antam',
    });
    expect(decodeState({ q: '2.5' }, CTX).qty).toBe(1);
    expect(decodeState({ q: '999999999' }, CTX).qty).toBe(100_000);
  });
  it('tanpa buyback untuk berat itu: sumber jual null', () => {
    const s = decodeState({ w: '5' }, CTX);
    expect(s.w).toBe(5);
    expect(s.sellId).toBeNull();
    expect(encodeState(s, CTX).s).toBeNull();
  });
  it('ganti sumber beli menyesuaikan gramasi dan sumber jual', () => {
    const s = normalizeState({ ...decodeState({ w: '5' }, CTX), buyId: 'pg-g24' }, CTX);
    expect(s.w).toBe(1);
    expect(s.sellId).toBeNull();
  });
  it('tanggal setelah data terbaru dipotong ke data terbaru', () => {
    expect(decodeState({ d: '2027-01-01' }, CTX).date).toBe('2026-11-07');
  });
  it('yearAgo menangani 29 Februari', () => {
    expect(yearAgo('2024-02-29')).toBe('2023-02-28');
    expect(defaultDate('2026-11-07')).toBe('2025-11-07');
  });
});
