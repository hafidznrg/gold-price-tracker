import type { SeriesPoint } from './data';
import type { RangeStat, ValueMode } from './explorer';
import { EMPTY, formatCompact, formatPct, formatRupiah } from './format';
import type { ShowMode } from './riwayat';

// Logika murni daftar "Dalam rentang ini" (D-74): urutan, penanda terbaik, posisi titik di bilah
// rentang, dan catatan kecil per baris. Tanpa React agar bisa diuji.

/** Mode dasar (menurut Tampilkan) atau seri manual. */
export type SummaryMode = ShowMode | 'manual';
export type SortKey = 'best' | 'change' | 'spread';
/** Satuan nilai utama baris: rupiah, atau persen (spread). */
export type ValueKind = 'rupiah' | 'pct';

export interface SpreadInfo {
  /** Spread terakhir, rata-rata, dan jumlah hari datanya di rentang (%). */
  last: number;
  avg: number;
  count: number;
  /** Spread tersempit di rentang dan tanggalnya. */
  minValue: number;
  minDate: string;
  /** Selisih jual − buyback terakhir (Rp per keping); null bila tak diketahui. */
  gap: number | null;
}

export interface SummaryItem {
  key: string;
  name: string;
  /** Sumber ("Logam Mulia"); kosong di mode seri manual (nama sudah memuatnya). */
  source: string;
  color: string;
  dashed: boolean;
  kind: ValueKind;
  /** Statistik nilai utama dalam rentang (nilai sesuai `kind`); null = tak ada data. */
  stat: RangeStat | null;
  /** Perubahan untuk ditampilkan/diurutkan: % (rupiah) atau poin persen (spread); null = tak ada. */
  change: number | null;
  /** Nilai terakhir yang sebanding antar seri: per gram (harga) atau spread %; null = tak ada. */
  comparable: number | null;
  spread: SpreadInfo | null;
}

// ---------------------------------------------------------------------------
// Urutan

export const SORT_OPTIONS: Record<SummaryMode, { value: SortKey; label: string }[]> = {
  sell: [
    { value: 'best', label: 'Termurah' },
    { value: 'change', label: 'Perubahan' },
  ],
  bb: [
    { value: 'best', label: 'Tertinggi' },
    { value: 'change', label: 'Perubahan' },
  ],
  spread: [
    { value: 'best', label: 'Tersempit' },
    { value: 'change', label: 'Perubahan' },
  ],
  both: [
    { value: 'best', label: 'Termurah' },
    { value: 'spread', label: 'Spread' },
  ],
  manual: [
    { value: 'best', label: 'Bawaan' },
    { value: 'change', label: 'Perubahan' },
  ],
};

export const sortOptions = (mode: SummaryMode) => SORT_OPTIONS[mode];
/** Opsi pertama = bawaan. */
export const defaultSort = (mode: SummaryMode): SortKey => SORT_OPTIONS[mode][0]!.value;

/** Pilihan urutan yang tak berlaku di `mode` kembali ke bawaan. */
export function validSort(mode: SummaryMode, sort: SortKey): SortKey {
  return SORT_OPTIONS[mode].some((o) => o.value === sort) ? sort : defaultSort(mode);
}

/** Urutkan angka; null selalu di akhir; urutan asli dipertahankan untuk nilai sama. */
function byNumber<T>(items: readonly T[], get: (x: T) => number | null, dir: 'asc' | 'desc'): T[] {
  return items
    .map((x, i) => ({ x, i, v: get(x) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      return (dir === 'asc' ? a.v - b.v : b.v - a.v) || a.i - b.i;
    })
    .map((e) => e.x);
}

/**
 * Urutkan baris. `best`: termurah (jual, per gram), tertinggi (buyback, per gram), tersempit
 * (spread), atau urutan asli (seri manual). `change`: kenaikan terbesar dulu. `spread`: terkecil dulu.
 */
export function sortItems(
  items: readonly SummaryItem[],
  mode: SummaryMode,
  sort: SortKey,
): SummaryItem[] {
  const s = validSort(mode, sort);
  if (s === 'change') return byNumber(items, (x) => x.change, 'desc');
  if (s === 'spread') return byNumber(items, (x) => x.spread?.last ?? null, 'asc');
  if (mode === 'manual') return [...items];
  return byNumber(items, (x) => x.comparable, mode === 'bb' ? 'desc' : 'asc');
}

// ---------------------------------------------------------------------------
// Penanda terbaik

/** Kata kecil di samping persen pada baris terbaik; null = tak ada penanda untuk mode ini. */
export function bestWord(mode: SummaryMode): string | null {
  return { sell: 'termurah', both: 'termurah', bb: 'tertinggi', spread: 'tersempit', manual: null }[
    mode
  ];
}

/**
 * Kunci baris terbaik. Hanya mode dasar dengan nilai nominal/per gram (indeks dan % ubah tak
 * sebanding), hanya antar seri yang punya nilai, dan hanya bila ≥ 2 seri punya nilai. Harga
 * dibandingkan per gram (`comparable`); buyback tertinggi, selain itu terendah.
 */
export function bestKey(
  items: readonly SummaryItem[],
  mode: SummaryMode,
  valueMode: ValueMode,
): string | null {
  if (mode === 'manual' || (valueMode !== 'nominal' && valueMode !== 'gram')) return null;
  const withValue = items.filter((x) => x.comparable !== null);
  if (withValue.length < 2) return null;
  return byNumber(withValue, (x) => x.comparable, mode === 'bb' ? 'desc' : 'asc')[0]!.key;
}

// ---------------------------------------------------------------------------
// Bilah rentang

export const BAR_MIN = 4;
export const BAR_MAX = 96;

/** Posisi (%) titik `value` di antara `min` dan `max`, dijepit ke 4–96; rentang datar → 50. */
export function barPosition(value: number, min: number, max: number): number {
  if (!(max > min)) return 50;
  const p = ((value - min) / (max - min)) * 100;
  return Math.min(BAR_MAX, Math.max(BAR_MIN, p));
}

/** Bilah hanya bermakna bila ada ≥ 2 titik di rentang. */
export const hasRange = (stat: RangeStat | null): stat is RangeStat =>
  stat !== null && stat.count >= 2;

// ---------------------------------------------------------------------------
// Nilai dan catatan

export function formatSummaryValue(v: number, kind: ValueKind): string {
  return kind === 'pct' ? formatPct(v, 2, false) : formatRupiah(v);
}

/** Label ujung bilah: "2,26 jt" (rupiah) atau "6,02%" (spread). */
export function formatEndLabel(v: number, kind: ValueKind): string {
  return kind === 'pct' ? formatPct(v, 2, false) : formatCompact(v);
}

/** Perubahan: "−7,31%" (harga) atau "+0,45 poin" (spread); tanpa perubahan → "—". */
export function formatChange(change: number | null, kind: ValueKind): string {
  if (change === null) return EMPTY;
  return kind === 'pct' ? `${formatPct(change).replace('%', '')} poin` : formatPct(change);
}

/** Perubahan baris: null bila titik di rentang < 2 (tak ada pembanding). */
export function changeOf(stat: RangeStat | null, kind: ValueKind): number | null {
  if (!stat || stat.count < 2) return null;
  return kind === 'pct' ? stat.changeAbs : stat.changePct;
}

/**
 * Catatan kecil baris: "data mulai {tgl}" bila seri baru mulai setelah awal rentang, "terakhir
 * {tgl}" bila titik terakhirnya sebelum akhir rentang, "belum ada pembanding" untuk satu titik
 * yang baru mulai. `fmt` memformat tanggal ISO. Kosong bila tak ada yang perlu dicatat.
 */
export function rangeNotes(
  stat: RangeStat | null,
  to: string,
  fmt: (iso: string) => string,
): string[] {
  if (!stat) return [];
  const notes: string[] = [];
  if (stat.startsLate) notes.push(`data mulai ${fmt(stat.first.date)}`);
  if (stat.last.date < to) notes.push(`terakhir ${fmt(stat.last.date)}`);
  if (stat.count < 2 && stat.startsLate) notes.push('belum ada pembanding');
  return notes;
}

/**
 * Spread kini jelas lebih lebar dari rata-ratanya di rentang (≥ 1,25× rata-rata), agar selisih
 * kecil sehari-hari tidak ikut diberi warna peringatan.
 */
export const SPREAD_WARN_RATIO = 1.25;
export const spreadAboveAverage = (s: SpreadInfo): boolean =>
  s.avg > 0 && s.last >= s.avg * SPREAD_WARN_RATIO;

/** Selisih jual − buyback pada `date` (Rp); null bila salah satunya tak ada di tanggal itu. */
export function gapAt(
  sell: readonly SeriesPoint[],
  buyback: readonly SeriesPoint[],
  date: string,
): number | null {
  const s = sell.find((p) => p.date === date);
  const b = buyback.find((p) => p.date === date);
  return s && b ? s.value - b.value : null;
}

export function makeSpreadInfo(
  sp: { last: SeriesPoint; avg: number; count: number },
  range: RangeStat | null,
  gap: number | null,
): SpreadInfo {
  return {
    last: sp.last.value,
    avg: sp.avg,
    count: sp.count,
    minValue: range?.min.value ?? sp.last.value,
    minDate: range?.min.date ?? sp.last.date,
    gap,
  };
}
