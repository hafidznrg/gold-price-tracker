/**
 * Tema grafik bersama: token warna dari CSS variable (globals.css), format angka/tanggal
 * Indonesia, dan gaya sumbu/grid/tooltip sesuai plan/mockup (Explorer, Spread).
 * Semua fungsi di sini murni kecuali `readTokens` (butuh DOM) agar mudah diuji.
 */

import { formatMultiple, formatMultipleAxis } from '../../lib/format';

/** Token tema yang dipakai grafik. Nilai = warna konkret (canvas tidak mengerti `var()`). */
export interface ChartTokens {
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  grid: string;
  text: string;
  muted: string;
  faint: string;
  gold: string;
  goldsoft: string;
  goldline: string;
  up: string;
  down: string;
  fontFamily: string;
}

const TOKEN_NAMES = [
  'bg',
  'surface',
  'surface2',
  'line',
  'grid',
  'text',
  'muted',
  'faint',
  'gold',
  'goldsoft',
  'goldline',
  'up',
  'down',
] as const;

/** Nilai tema gelap (default) — cadangan saat DOM belum ada (SSR/prerender, uji). */
export const FALLBACK_TOKENS: ChartTokens = {
  bg: '#0e0f12',
  surface: '#16181d',
  surface2: '#1d2027',
  line: '#2a2e37',
  grid: '#22252d',
  text: '#edeae3',
  muted: '#ababa4',
  faint: '#8e9097',
  gold: '#ddb563',
  goldsoft: 'rgba(221, 181, 99, 0.13)',
  goldline: 'rgba(221, 181, 99, 0.38)',
  up: '#6cc59a',
  down: '#f28c6c',
  fontFamily: 'Inter, system-ui, sans-serif',
};

/** Pencarian CSS variable berdasarkan nama tanpa `--` ("antam" → nilai `--antam`). */
export type CssVarLookup = (name: string) => string;

/** Lookup dari computed style elemen (default `<html>`, tempat `data-theme` dipasang). */
export function cssVarLookup(el?: Element): CssVarLookup {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => '';
  const style = getComputedStyle(el ?? document.documentElement);
  return (name) => style.getPropertyValue(`--${name}`).trim();
}

/** Baca token tema saat ini. Aman dipanggil di server (mengembalikan cadangan). */
export function readTokens(lookup: CssVarLookup = cssVarLookup()): ChartTokens {
  const out = { ...FALLBACK_TOKENS };
  for (const name of TOKEN_NAMES) {
    const v = lookup(name);
    if (v) out[name] = v;
  }
  if (typeof document !== 'undefined' && document.body) {
    const ff = getComputedStyle(document.body).fontFamily;
    if (ff) out.fontFamily = ff;
  }
  return out;
}

const LITERAL_COLOR = /^(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color\(|transparent$)/i;

/**
 * Warna seri → warna konkret. Menerima nama token ("antam", "tab"), `var(--antam)`,
 * `--antam`, atau warna literal (#hex, rgb(), …). Token tak dikenal → `fallback`.
 */
export function resolveColor(color: string, lookup: CssVarLookup, fallback = '#8e9097'): string {
  const c = color.trim();
  if (LITERAL_COLOR.test(c)) return c;
  const m = /^var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)$/.exec(c);
  const name = m?.[1] ?? c.replace(/^--/, '');
  return lookup(name) || fallback;
}

/** Warna seri → nilai CSS untuk SVG/HTML (tetap mengikuti tema tanpa membaca DOM). */
export function cssColor(color: string): string {
  const c = color.trim();
  if (LITERAL_COLOR.test(c) || c.startsWith('var(')) return c;
  return `var(--${c.replace(/^--/, '')})`;
}

// ---------------------------------------------------------------------------
// Format angka
// ---------------------------------------------------------------------------

const nfCache = new Map<number, Intl.NumberFormat>();
function nf(decimals: number): Intl.NumberFormat {
  let f = nfCache.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    nfCache.set(decimals, f);
  }
  return f;
}

/** Tanda minus tipografis (U+2212) seperti mockup. */
const MINUS = '−';

/** Angka gaya Indonesia: 1.234,5. */
export function formatNumber(v: number, decimals = 0): string {
  const s = nf(decimals).format(Math.abs(v));
  return v < 0 && s !== nf(decimals).format(0) ? MINUS + s : s;
}

/** "Rp2.396.500" (dibulatkan ke rupiah). `null` → "—". */
export function formatRupiah(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const r = Math.round(v);
  return (r < 0 ? MINUS : '') + 'Rp' + nf(0).format(Math.abs(r));
}

/** Label sumbu ringkas: "Rp2,35 jt", "Rp850 rb", "Rp1,20 M". */
export function formatRupiahShort(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? MINUS : '';
  if (a >= 1e9) return `${sign}Rp${nf(2).format(a / 1e9)} M`;
  if (a >= 1e6) return `${sign}Rp${nf(2).format(a / 1e6)} jt`;
  if (a >= 1e3) return `${sign}Rp${nf(0).format(a / 1e3)} rb`;
  return `${sign}Rp${nf(0).format(a)}`;
}

/** "4,85%" (tanpa tanda +). `null` → "—". */
export function formatPercent(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return formatNumber(v, decimals) + '%';
}

export type ValueFormat = 'rupiah' | 'percent' | 'number' | 'multiple' | ((v: number) => string);

/** Formatter sumbu (ringkas) dan tooltip (lengkap) untuk satu `ValueFormat`. */
export function valueFormatters(format: ValueFormat = 'rupiah'): {
  axis: (v: number) => string;
  tooltip: (v: number | null) => string;
} {
  if (typeof format === 'function') {
    return { axis: format, tooltip: (v) => (v === null ? '—' : format(v)) };
  }
  switch (format) {
    case 'percent':
      return { axis: (v) => formatPercent(v, 1), tooltip: (v) => formatPercent(v, 2) };
    case 'multiple':
      return {
        axis: formatMultipleAxis,
        tooltip: (v) => (v === null ? '—' : formatMultiple(v)),
      };
    case 'number':
      return {
        axis: (v) => formatNumber(v, Math.abs(v) < 10 ? 1 : 0),
        tooltip: (v) => (v === null ? '—' : formatNumber(v, 2)),
      };
    default:
      return { axis: formatRupiahShort, tooltip: formatRupiah };
  }
}

// ---------------------------------------------------------------------------
// Format tanggal (selalu UTC: tanggal ISO "YYYY-MM-DD" = hari kalender WIB)
// ---------------------------------------------------------------------------

export const MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];
export const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const DAY_MS = 86_400_000;

/** "2026-10-30" → timestamp UTC tengah malam. Tanggal tak valid → NaN. */
export function isoToTime(iso: string): number {
  // Jalur cepat tanpa regex: dipanggil per titik data (ribuan kali).
  if (iso.length >= 10 && iso.charCodeAt(4) === 45 && iso.charCodeAt(7) === 45) {
    const y = +iso.slice(0, 4);
    const m = +iso.slice(5, 7);
    const d = +iso.slice(8, 10);
    if (y >= 0 && m >= 0 && d >= 0) return Date.UTC(y, m - 1, d);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Timestamp → "2026-10-30" (UTC). */
export function timeToIso(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Label sumbu X sesuai lebar rentang terlihat:
 * ≤ 120 hari → "30 Okt"; ≤ 4 tahun → "Okt 26"; lebih → "2026".
 */
export function formatAxisDate(t: number, spanDays: number): string {
  const d = new Date(t);
  const mon = MONTHS_ID[d.getUTCMonth()];
  const b = spanBucket(spanDays);
  if (b === 0) return `${d.getUTCDate()} ${mon}`;
  if (b === 1) return `${mon} ${String(d.getUTCFullYear()).slice(-2)}`;
  return String(d.getUTCFullYear());
}

/** Kelompok format label sumbu X: 0 = hari, 1 = bulan, 2 = tahun. */
export function spanBucket(spanDays: number): 0 | 1 | 2 {
  if (spanDays <= 120) return 0;
  if (spanDays <= 4 * 366) return 1;
  return 2;
}

/** "30 Okt 2026". */
export function formatDateShort(t: number): string {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Judul tooltip: "Jum, 30 Okt 2026". */
export function formatTooltipDate(t: number): string {
  return `${DAYS_ID[new Date(t).getUTCDay()]}, ${formatDateShort(t)}`;
}

// ---------------------------------------------------------------------------
// Gaya ECharts bersama
// ---------------------------------------------------------------------------

/** Ukuran teks sumbu mockup (11,5 px, warna --faint). */
export const AXIS_FONT_SIZE = 11.5;

export function axisLabelStyle(t: ChartTokens) {
  return { color: t.faint, fontSize: AXIS_FONT_SIZE, fontFamily: t.fontFamily };
}

/** Kotak tooltip: sel --surface2, garis --line, radius 14, bayangan lembut, angka tabular. */
export function tooltipBoxStyle(t: ChartTokens) {
  return {
    backgroundColor: t.surface2,
    borderColor: t.line,
    borderWidth: 1,
    padding: [12, 14] as [number, number],
    textStyle: { color: t.text, fontFamily: t.fontFamily, fontSize: 12.5 },
    extraCssText:
      'border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.25);font-variant-numeric:tabular-nums;min-width:220px;max-width:min(320px,85vw);',
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

export interface TooltipRow {
  label: string;
  color: string;
  value: string;
  muted?: boolean;
}

/** Isi HTML tooltip seperti mockup: tanggal (muted) lalu baris warna · nama · nilai tebal. */
export function tooltipHtml(title: string, rows: TooltipRow[], t: ChartTokens): string {
  const head = `<div style="font-size:12px;color:${t.muted};margin-bottom:8px">${escapeHtml(title)}</div>`;
  const body = rows
    .map(
      (r) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;font-size:12.5px;padding:3px 0">` +
        `<span style="display:flex;align-items:center;gap:7px;min-width:0"><span style="flex:none;width:8px;height:8px;border-radius:2px;background:${r.color}"></span>` +
        `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.label)}</span></span>` +
        `<span style="font-weight:600;color:${r.muted ? t.faint : t.text};white-space:nowrap">${escapeHtml(r.value)}</span></div>`,
    )
    .join('');
  return head + body;
}
