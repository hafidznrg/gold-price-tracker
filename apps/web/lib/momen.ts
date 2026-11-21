import { formatNumber, formatPct } from './format';
import { encodeBrandIds, encodeShow, type ShowMode } from './riwayat';
import type { CardModel } from './today';

// Logika murni blok "Momen hari ini" di beranda (D-76): maksimal 3 kalimat deskriptif yang dihitung
// dari kartu Hari ini dan spark 30 hari kalendernya. Tanpa kata perintah (beli/jual/tunggu).

export interface Momen {
  text: string;
  href: string;
}

/** Peta berkas kartu → id brand Riwayat harga (D-76). */
export const CARD_BRAND_ID: Record<string, string> = {
  'logammulia-antam': 'lm-antam',
  'ubslifestyle-ubs': 'ubsl-ubs',
  'galeri24-galeri24': 'g24-g24',
  'galeri24-lotusarchi': 'g24-lotus',
  'hrtagold-emasku': 'hr-emasku',
  'pegadaian-pegadaian': 'tab',
};

/** Ambang spread melebar: hari ini ≥ 1,25× rata-rata 30 hari. */
export const WIDEN_RATIO = 1.25;
/** Data minimum (hari pasangan jual+buyback / nilai harga jual) agar rata-rata dan titik ekstrem dinilai. */
export const MIN_DAYS = 10;

type CardInput = Pick<
  CardModel,
  'id' | 'kind' | 'title' | 'sell' | 'buyback' | 'spreadPct' | 'sellSpark' | 'buySpark'
>;

/** Alamat Riwayat harga mode dasar; nilai bawaan (b, v) tidak ditulis. */
export function riwayatHref(ids: readonly string[], show: ShowMode): string {
  const q: string[] = [];
  const b = encodeBrandIds(ids);
  if (b !== null) q.push(`b=${b}`);
  const v = encodeShow(show);
  if (v !== null) q.push(`v=${v}`);
  return q.length > 0 ? `/explorer?${q.join('&')}` : '/explorer';
}

const idOf = (c: CardInput): string => CARD_BRAND_ID[c.id] ?? c.id;

/** Rata-rata spread % harian dari hari yang punya jual dan buyback sekaligus; null bila < MIN_DAYS hari. */
function avgSpreadPct(c: CardInput): number | null {
  if (!c.buySpark) return null;
  const vals: number[] = [];
  c.sellSpark.forEach((s, i) => {
    const b = c.buySpark?.[i] ?? null;
    if (s !== null && b !== null && s > 0) vals.push(((s - b) / s) * 100);
  });
  return vals.length >= MIN_DAYS ? vals.reduce((a, x) => a + x, 0) / vals.length : null;
}

function widening(cards: readonly CardInput[]): Momen | null {
  const hits: { c: CardInput; ratio: number; avg: number }[] = [];
  for (const c of cards) {
    const avg = avgSpreadPct(c);
    if (avg === null || avg <= 0 || c.spreadPct === null) continue;
    const ratio = c.spreadPct / avg;
    if (ratio >= WIDEN_RATIO) hits.push({ c, ratio, avg });
  }
  // Sort stabil: rasio sama → urutan kartu.
  hits.sort((a, b) => b.ratio - a.ratio);
  const top = hits[0];
  if (!top) return null;
  const more = hits.length - 1;
  const text =
    `Spread ${top.c.title} ${formatPct(top.c.spreadPct, 1, false)}, ` +
    `${formatNumber(top.ratio, 1)}× rata-rata 30 hari (${formatPct(top.avg, 1, false)})` +
    (more > 0 ? `; +${more} brand lain juga melebar.` : '.');
  return { text, href: riwayatHref([idOf(top.c)], 'both') };
}

function position(cards: readonly CardInput[]): Momen | null {
  const lows: CardInput[] = [];
  const highs: CardInput[] = [];
  let eligible = 0;
  for (const c of cards) {
    const v = c.sellSpark.filter((x): x is number => x !== null);
    if (c.sell === null || v.length < MIN_DAYS) continue;
    eligible += 1;
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    if (hi === lo) continue; // harga datar: bukan titik ekstrem
    if (c.sell === lo) lows.push(c);
    else if (c.sell === hi) highs.push(c);
  }
  const low = lows.length >= highs.length;
  const hit = low ? lows : highs;
  if (hit.length === 0) return null;
  const n = hit.length;
  // "semua" hanya bila semua kartu ikut dinilai; brand dengan data < 30 hari (mis. EMASKU baru)
  // membuat jumlah yang dinilai lebih kecil dari jumlah kartu, jadi tulis "n dari m".
  const total = cards.filter((c) => c.sell !== null).length;
  const subject =
    n === eligible && eligible === total ? `semua ${n} brand` : `${n} dari ${total} brand`;
  return {
    text: `Harga jual ${subject} ada di titik ${low ? 'terendah' : 'tertinggi'} 30 hari.`,
    href: riwayatHref(hit.map(idOf), 'sell'),
  };
}

function narrowest(cards: readonly CardInput[]): Momen | null {
  type Ranked = CardInput & { spreadPct: number };
  const withBb = cards.filter((c): c is Ranked => c.buyback !== null && c.spreadPct !== null);
  if (withBb.length < 2) return null;
  const minOf = (xs: Ranked[]) =>
    xs.reduce<Ranked | null>((m, c) => (m === null || c.spreadPct < m.spreadPct ? c : m), null);
  const best = minOf(withBb);
  if (!best) return null;
  let text = `Selisih jual-beli tersempit: ${best.title} ${formatPct(best.spreadPct, 2, false)}`;
  if (best.kind === 'tabungan') {
    const phys = minOf(withBb.filter((c) => c.kind !== 'tabungan'));
    if (phys) text += ` · keping fisik: ${phys.title} ${formatPct(phys.spreadPct, 2, false)}`;
  }
  return { text: `${text}.`, href: riwayatHref(withBb.map(idOf), 'spread') };
}

/** Maksimal 3 kalimat, urut prioritas D-76: spread melebar, posisi harga, bolak-balik tersempit. */
export function buildMomen(cards: readonly CardInput[]): Momen[] {
  return [widening(cards), position(cards), narrowest(cards)].filter((m): m is Momen => m !== null);
}
