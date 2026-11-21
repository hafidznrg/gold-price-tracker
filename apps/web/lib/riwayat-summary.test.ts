import { describe, expect, it } from 'vitest';
import type { RangeStat } from './explorer';
import {
  barPosition,
  bestKey,
  bestWord,
  changeOf,
  defaultSort,
  formatChange,
  formatEndLabel,
  gapAt,
  hasRange,
  rangeNotes,
  sortItems,
  sortOptions,
  spreadAboveAverage,
  validSort,
  type SpreadInfo,
  type SummaryItem,
} from './riwayat-summary';

const pt = (date: string, value: number) => ({ date, value });
const stat = (over: Partial<RangeStat> = {}): RangeStat => ({
  count: 5,
  first: pt('2026-10-21', 100),
  last: pt('2026-11-21', 90),
  min: pt('2026-11-21', 90),
  max: pt('2026-10-21', 100),
  changeAbs: -10,
  changePct: -10,
  missingDays: 0,
  startsLate: false,
  ...over,
});
const sp = (last: number): SpreadInfo => ({
  last,
  avg: 5,
  count: 10,
  minValue: 3,
  minDate: '2026-11-01',
  gap: null,
});
const item = (key: string, over: Partial<SummaryItem> = {}): SummaryItem => ({
  key,
  name: key,
  source: '',
  color: 'antam',
  dashed: false,
  kind: 'rupiah',
  stat: stat(),
  change: -1,
  comparable: 1000,
  spread: null,
  ...over,
});

describe('opsi urutan', () => {
  it('opsi pertama = bawaan, per mode', () => {
    expect(sortOptions('sell').map((o) => o.label)).toEqual(['Termurah', 'Perubahan']);
    expect(sortOptions('bb').map((o) => o.label)).toEqual(['Tertinggi', 'Perubahan']);
    expect(sortOptions('spread').map((o) => o.label)).toEqual(['Tersempit', 'Perubahan']);
    expect(sortOptions('both').map((o) => o.label)).toEqual(['Termurah', 'Spread']);
    expect(sortOptions('manual').map((o) => o.label)).toEqual(['Bawaan', 'Perubahan']);
    expect(defaultSort('both')).toBe('best');
  });
  it('urutan yang tak berlaku kembali ke bawaan', () => {
    expect(validSort('sell', 'spread')).toBe('best');
    expect(validSort('both', 'spread')).toBe('spread');
  });
});

describe('sortItems', () => {
  const items = [
    item('a', { comparable: 2500, change: -1, spread: sp(8) }),
    item('b', { comparable: 2300, change: -7, spread: sp(6) }),
    item('c', { comparable: null, change: null, stat: null }),
    item('d', { comparable: 2400, change: 2, spread: sp(9) }),
  ];
  const keys = (xs: SummaryItem[]) => xs.map((x) => x.key);
  it('jual: termurah per gram dulu, tanpa data di akhir', () => {
    expect(keys(sortItems(items, 'sell', 'best'))).toEqual(['b', 'd', 'a', 'c']);
  });
  it('buyback: tertinggi dulu', () => {
    expect(keys(sortItems(items, 'bb', 'best'))).toEqual(['a', 'd', 'b', 'c']);
  });
  it('perubahan: kenaikan terbesar dulu, null di akhir', () => {
    expect(keys(sortItems(items, 'sell', 'change'))).toEqual(['d', 'a', 'b', 'c']);
  });
  it('spread: terkecil dulu; baris tanpa spread di akhir', () => {
    expect(keys(sortItems(items, 'both', 'spread'))).toEqual(['b', 'a', 'd', 'c']);
  });
  it('seri manual: bawaan = urutan asli', () => {
    expect(keys(sortItems(items, 'manual', 'best'))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('sama besar mempertahankan urutan asli', () => {
    const tie = [item('x', { comparable: 5 }), item('y', { comparable: 5 })];
    expect(keys(sortItems(tie, 'sell', 'best'))).toEqual(['x', 'y']);
  });
});

describe('bestKey', () => {
  const sell = [
    item('antam', { comparable: 2_495_000 }),
    item('tabemas', { comparable: 2_256_000 }),
    item('g24', { comparable: 2_334_000 }),
  ];
  it('jual: termurah per gram (Tabungan Emas sudah per gram)', () => {
    expect(bestKey(sell, 'sell', 'nominal')).toBe('tabemas');
    expect(bestKey(sell, 'both', 'gram')).toBe('tabemas');
  });
  it('buyback: tertinggi', () => {
    expect(bestKey(sell, 'bb', 'nominal')).toBe('antam');
  });
  it('spread: tersempit', () => {
    const s = [item('a', { comparable: 8 }), item('b', { comparable: 6 })];
    expect(bestKey(s, 'spread', 'nominal')).toBe('b');
  });
  it('tanpa penanda di mode indeks/% ubah dan seri manual', () => {
    expect(bestKey(sell, 'sell', 'index')).toBeNull();
    expect(bestKey(sell, 'sell', 'pct')).toBeNull();
    expect(bestKey(sell, 'manual', 'nominal')).toBeNull();
  });
  it('seri tanpa nilai dikecualikan; butuh ≥ 2 seri bernilai', () => {
    const one = [item('a', { comparable: 1 }), item('b', { comparable: null })];
    expect(bestKey(one, 'sell', 'nominal')).toBeNull();
    const three = [...one, item('c', { comparable: 5 })];
    expect(bestKey(three, 'sell', 'nominal')).toBe('a');
    expect(bestKey([], 'sell', 'nominal')).toBeNull();
  });
  it('kata penanda per mode', () => {
    expect(bestWord('sell')).toBe('termurah');
    expect(bestWord('both')).toBe('termurah');
    expect(bestWord('bb')).toBe('tertinggi');
    expect(bestWord('spread')).toBe('tersempit');
    expect(bestWord('manual')).toBeNull();
  });
});

describe('barPosition', () => {
  it('proporsional di tengah rentang', () => {
    expect(barPosition(50, 0, 100)).toBe(50);
  });
  it('dijepit 4–96 di ujung dan di luar rentang', () => {
    expect(barPosition(0, 0, 100)).toBe(4);
    expect(barPosition(100, 0, 100)).toBe(96);
    expect(barPosition(-5, 0, 100)).toBe(4);
    expect(barPosition(500, 0, 100)).toBe(96);
  });
  it('rentang datar → tengah', () => {
    expect(barPosition(7, 7, 7)).toBe(50);
  });
  it('hasRange butuh ≥ 2 titik', () => {
    expect(hasRange(stat({ count: 1 }))).toBe(false);
    expect(hasRange(stat())).toBe(true);
    expect(hasRange(null)).toBe(false);
  });
});

describe('catatan dan format', () => {
  const fmt = (iso: string) => `T${iso.slice(8)}`;
  it('data mulai bila seri mulai setelah awal rentang', () => {
    const s = stat({ startsLate: true, first: pt('2026-10-26', 1) });
    expect(rangeNotes(s, '2026-11-21', fmt)).toEqual(['data mulai T26']);
  });
  it('terakhir bila titik akhir sebelum akhir rentang; digabung dengan data mulai', () => {
    const s = stat({ startsLate: true, first: pt('2026-10-26', 1), last: pt('2026-11-20', 1) });
    expect(rangeNotes(s, '2026-11-21', fmt)).toEqual(['data mulai T26', 'terakhir T20']);
    expect(rangeNotes(stat({ last: pt('2026-11-20', 1) }), '2026-11-21', fmt)).toEqual([
      'terakhir T20',
    ]);
  });
  it('tanpa catatan bila lengkap atau tanpa data', () => {
    expect(rangeNotes(stat(), '2026-11-21', fmt)).toEqual([]);
    expect(rangeNotes(null, '2026-11-21', fmt)).toEqual([]);
  });
  it('satu titik baru mulai: belum ada pembanding', () => {
    const s = stat({
      count: 1,
      startsLate: true,
      first: pt('2026-11-21', 1),
      last: pt('2026-11-21', 1),
    });
    expect(rangeNotes(s, '2026-11-21', fmt)).toEqual(['data mulai T21', 'belum ada pembanding']);
  });
  it('changeOf null untuk satu titik; poin untuk spread', () => {
    expect(changeOf(stat({ count: 1 }), 'rupiah')).toBeNull();
    expect(changeOf(stat(), 'rupiah')).toBe(-10);
    expect(changeOf(stat({ changeAbs: 0.4 }), 'pct')).toBe(0.4);
    expect(formatChange(null, 'rupiah')).toBe('—');
    expect(formatChange(-7.31, 'rupiah')).toBe('−7,31%');
    expect(formatChange(0.45, 'pct')).toBe('+0,45 poin');
  });
  it('label ujung dan spread di atas rata-rata', () => {
    expect(formatEndLabel(2_260_000, 'rupiah')).toBe('2,26 jt');
    expect(formatEndLabel(6.02, 'pct')).toBe('6,02%');
    expect(spreadAboveAverage(sp(6.25))).toBe(true);
    expect(spreadAboveAverage(sp(10))).toBe(true);
    // Sedikit di atas rata-rata belum dianggap melebar.
    expect(spreadAboveAverage(sp(6))).toBe(false);
    expect(spreadAboveAverage(sp(4))).toBe(false);
  });
  it('gapAt: selisih jual dan buyback di tanggal sama', () => {
    expect(gapAt([pt('d1', 2_495_000)], [pt('d1', 2_095_000)], 'd1')).toBe(400_000);
    expect(gapAt([pt('d1', 1)], [pt('d2', 1)], 'd1')).toBeNull();
  });
});
