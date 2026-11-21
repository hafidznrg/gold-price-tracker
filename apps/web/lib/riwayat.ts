import type { SeriesPoint } from './data';
import {
  COMPARE_DEFS,
  decodeWeight,
  encodeWeight,
  findOption,
  type CompareDef,
} from './bandingkan';
import { formatWeight } from './format';
import type { ExplorerOption, SeriesPick } from './explorer';
import { joinDays, sliceDays } from './spread';

// Logika murni mode dasar Riwayat harga (D-71): kode URL `g` / `v` / `b`, ketersediaan brand per
// (gramasi, tampilan), pemetaan keadaan dasar → seri Explorer, dan deret spread %.
// Tanpa React/ECharts agar bisa diuji.
//
//   ?g=5&v=spread&b=lm-antam,ubsl-ubs      (bawaan tidak ditulis: g=1, v=sell, 4 brand)
//   `b=-` = tanpa brand. `s` ada di URL = mode seri manual (bukan mode dasar).

export { decodeWeight as decodeGram, encodeWeight as encodeGram };

// ---------------------------------------------------------------------------
// Tampilkan (v)

export type ShowMode = 'sell' | 'bb' | 'spread' | 'both';
export const DEFAULT_SHOW: ShowMode = 'sell';
export const SHOW_MODES: readonly ShowMode[] = ['sell', 'bb', 'spread', 'both'];
export const SHOW_LABELS: Record<ShowMode, string> = {
  sell: 'Harga jual',
  bb: 'Buyback',
  spread: 'Spread',
  both: 'Jual + spread',
};

export function decodeShow(param: string | null | undefined): ShowMode {
  return SHOW_MODES.find((m) => m === param) ?? DEFAULT_SHOW;
}
export const encodeShow = (m: ShowMode): string | null => (m === DEFAULT_SHOW ? null : m);

/** Tampilan yang menggambar harga (jual atau buyback) / yang menggambar spread %. */
export const showsPrice = (m: ShowMode): boolean => m !== 'spread';
export const showsSpread = (m: ShowMode): boolean => m === 'spread' || m === 'both';

// ---------------------------------------------------------------------------
// Brand (b)

export const DEFAULT_BRAND_IDS: readonly string[] = [
  'lm-antam',
  'ubsl-ubs',
  'g24-g24',
  'hr-emasku',
];

/** Urutkan menurut `COMPARE_DEFS`; id tak dikenal dan duplikat dibuang. */
export function sortBrandIds(ids: readonly string[]): string[] {
  const set = new Set(ids);
  return COMPARE_DEFS.filter((d) => set.has(d.id)).map((d) => d.id);
}

/** Parameter `b` → id brand terurut. Kosong/semua tak sah → bawaan; `-` → tanpa brand. */
export function decodeBrandIds(param: string | null | undefined): string[] {
  if (!param) return [...DEFAULT_BRAND_IDS];
  if (param === '-') return [];
  const ids = sortBrandIds(param.split(',').map((s) => s.trim()));
  return ids.length > 0 ? ids : [...DEFAULT_BRAND_IDS];
}

/** Daftar sama dengan bawaan → null (tidak ditulis); kosong → `-`. */
export function encodeBrandIds(ids: readonly string[]): string | null {
  const sorted = sortBrandIds(ids);
  if (
    sorted.length === DEFAULT_BRAND_IDS.length &&
    sorted.every((id, i) => id === DEFAULT_BRAND_IDS[i])
  ) {
    return null;
  }
  return sorted.length === 0 ? '-' : sorted.join(',');
}

// ---------------------------------------------------------------------------
// Ketersediaan brand

export type BrandAvailability = { ok: true } | { ok: false; reason: string };

/**
 * Apakah brand `d` bisa digambar pada gramasi `w` untuk tampilan `show`. Tabungan Emas (linear,
 * per gram) selalu tersedia. Selain Harga jual, butuh buyback: dicatat sumber atau dihitung dari
 * buyback 1 g (D-60), yang sudah tercermin di `first.buyback`.
 */
export function brandAvailability(
  d: CompareDef,
  w: number,
  show: ShowMode,
  options: readonly ExplorerOption[],
): BrandAvailability {
  if (d.linear) return { ok: true };
  const o = findOption(d, w, options);
  if (!o || o.first.sell === null) return { ok: false, reason: `Tidak ada ${formatWeight(w)}` };
  if (show !== 'sell' && o.first.buyback === null) return { ok: false, reason: 'tanpa buyback' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Keadaan dasar → seri

export interface BasicEntry {
  def: CompareDef;
  opt: ExplorerOption;
  sell: SeriesPick;
  buyback: SeriesPick;
}

function pickOf(o: ExplorerOption, price: SeriesPick['price']): SeriesPick {
  return {
    source: o.source,
    brand: o.brand,
    w: o.w,
    price,
    ...(o.variant ? { variant: o.variant } : {}),
  };
}

/** Brand terpilih yang tersedia pada `w`/`show`, urut `COMPARE_DEFS`, lengkap dengan pilihan jual dan buyback. */
export function basicEntries(
  ids: readonly string[],
  w: number,
  show: ShowMode,
  options: readonly ExplorerOption[],
): BasicEntry[] {
  const out: BasicEntry[] = [];
  for (const d of COMPARE_DEFS) {
    if (!ids.includes(d.id) || !brandAvailability(d, w, show, options).ok) continue;
    const opt = findOption(d, w, options);
    if (opt) out.push({ def: d, opt, sell: pickOf(opt, 'sell'), buyback: pickOf(opt, 'buyback') });
  }
  return out;
}

/** Pilihan seri untuk grafik harga: buyback bila `bb`, selain itu harga jual (spread tak punya grafik harga). */
export function basicPricePicks(entries: readonly BasicEntry[], show: ShowMode): SeriesPick[] {
  if (!showsPrice(show)) return [];
  return entries.map((e) => (show === 'bb' ? e.buyback : e.sell));
}

// ---------------------------------------------------------------------------
// Spread %

/** Deret spread % = (jual − buyback) ÷ jual per tanggal yang punya keduanya. */
export function spreadPoints(
  sell: readonly SeriesPoint[],
  buyback: readonly SeriesPoint[],
): SeriesPoint[] {
  return joinDays([...sell], [...buyback]).map((d) => ({ date: d.date, value: d.pct }));
}

export interface SpreadRangeStat {
  last: SeriesPoint;
  avg: number;
  count: number;
}

/** Spread terakhir dan rata-rata di rentang `[from, to]`; null bila tak ada titik. */
export function spreadRangeStats(
  points: readonly SeriesPoint[],
  from: string | null,
  to: string,
): SpreadRangeStat | null {
  const inRange = sliceDays([...points], from, to);
  const last = inRange.at(-1);
  if (!last) return null;
  const sum = inRange.reduce((a, p) => a + p.value, 0);
  return { last, avg: sum / inRange.length, count: inRange.length };
}
