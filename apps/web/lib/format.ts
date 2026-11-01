// Sama dengan JAKARTA_TZ di @gold/schema (tidak diimpor agar zod tidak masuk bundel klien).
const JAKARTA_TZ = 'Asia/Jakarta';

// Format tampilan id-ID mengikuti mockup: "Rp2.512.000", "+0,64%", "30 Okt 2026", "08.32 WIB".
// Tanda minus memakai U+2212 (−) seperti mockup.

const MINUS = '−';
export const EMPTY = '—';

export const MONTHS_SHORT = [
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
] as const;
export const MONTHS_LONG = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;
export const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

const JKT_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface JakartaParts {
  year: number;
  month: number;
  day: number;
  hour: string;
  minute: string;
}

function jakartaParts(at: Date): JakartaParts {
  const p = Object.fromEntries(JKT_PARTS.formatToParts(at).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: p.hour ?? '00',
    minute: p.minute ?? '00',
  };
}

function toDate(at: Date | string): Date {
  return typeof at === 'string' ? new Date(at) : at;
}

/** "30 Okt 2026 16.52 WIB" (format mockup). */
export function formatJakartaStamp(at: Date): string {
  const p = jakartaParts(at);
  return `${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year} ${p.hour}.${p.minute} WIB`;
}

// ---------------------------------------------------------------------------
// Angka

/** Angka id-ID dengan jumlah desimal tetap: `num(4118.4, 2)` → "4.118,40". */
export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** "Rp2.512.000"; null/NaN → "—". Dibulatkan ke rupiah kecuali `digits` diberi. */
export function formatRupiah(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return EMPTY;
  const abs = formatNumber(Math.abs(digits === 0 ? Math.round(n) : n), digits);
  return `${n < 0 && abs !== formatNumber(0, digits) ? MINUS : ''}Rp${abs}`;
}

/** "Rp2,51 jt", "Rp1,20 M", "Rp850 rb" (sumbu grafik). */
export function formatRupiahShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? MINUS : '';
  if (a >= 1e9) return `${sign}Rp${formatNumber(a / 1e9, 2)} M`;
  if (a >= 1e6) return `${sign}Rp${formatNumber(a / 1e6, 2)} jt`;
  if (a >= 1e3) return `${sign}Rp${formatNumber(a / 1e3, 0)} rb`;
  return `${sign}Rp${formatNumber(a, 0)}`;
}

/** Persen bertanda: "+0,64%", "−1,20%", "0,00%". `signed=false` → "6,13%". */
export function formatPct(n: number | null | undefined, digits = 2, signed = true): string {
  if (n === null || n === undefined || Number.isNaN(n)) return EMPTY;
  const body = `${formatNumber(Math.abs(n), digits)}%`;
  if (Number(Math.abs(n).toFixed(digits)) === 0) return body;
  if (n < 0) return `${MINUS}${body}`;
  return signed ? `+${body}` : body;
}

/** Perubahan rupiah: "▲ +Rp16.000", "▼ −Rp4.000", "Rp0". */
export function formatChangeRupiah(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return EMPTY;
  const r = Math.round(n);
  if (r > 0) return `▲ +${formatRupiah(r)}`;
  if (r < 0) return `▼ ${MINUS}${formatRupiah(-r)}`;
  return formatRupiah(0);
}

/** "▲ +Rp16.000 · +0,64%" (kolom Perubahan). */
export function formatChange(change: { abs: number; pct: number } | null | undefined): string {
  if (!change) return EMPTY;
  return `${formatChangeRupiah(change.abs)} · ${formatPct(change.pct)}`;
}

/** Arah perubahan untuk pewarnaan (`text-up` / `text-down`). */
export function changeDirection(n: number | null | undefined): 'up' | 'down' | 'flat' {
  if (n === null || n === undefined || n === 0 || Number.isNaN(n)) return 'flat';
  return n > 0 ? 'up' : 'down';
}

/** Gramasi: "0,5 g", "1 g", "1.000 g", "0,01 g". */
export function formatWeight(w: number): string {
  return `${w.toLocaleString('id-ID', { maximumFractionDigits: 4 })} g`;
}

// ---------------------------------------------------------------------------
// Tanggal (tanggal kalender `YYYY-MM-DD` tidak dikonversi zona waktu)

function splitIso(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return [y, m, d];
}

/** "30 Okt 2026"; `withYear=false` → "30 Okt". */
export function formatDate(date: string, withYear = true): string {
  const [y, m, d] = splitIso(date);
  return withYear ? `${d} ${MONTHS_SHORT[m - 1]} ${y}` : `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "Jumat, 30 Oktober 2026". */
export function formatDateLong(date: string): string {
  const [y, m, d] = splitIso(date);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** "Nov 2023" (cakupan histori). */
export function formatMonthYear(date: string): string {
  const [y, m] = splitIso(date);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** Jam Jakarta dari timestamp ISO: "08.32 WIB". */
export function formatTimeWib(at: Date | string): string {
  const p = jakartaParts(toDate(at));
  return `${p.hour}.${p.minute} WIB`;
}

/** "30 Okt 2026 · 08.32 WIB" dari timestamp; tanggal saja bila `at` null. */
export function formatDataStamp(date: string, at: string | null): string {
  return at ? `${formatDate(date)} · ${formatTimeWib(at)}` : formatDate(date);
}

/** Tanggal kalender Jakarta (`YYYY-MM-DD`) dari `Date`. */
export function jakartaDateOf(at: Date): string {
  const p = jakartaParts(at);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Umur data (kolom "Data terakhir" dan "Pembaruan terakhir"):
 * - dengan timestamp `at`: "baru saja", "15 menit lalu", "3 jam lalu" (dibulatkan), "2 hari lalu";
 * - hanya tanggal (sumber tanpa jam, D-19): "hari ini", "1 hari lalu", "3 hari lalu";
 * - `isStatic`: "tidak diperbarui".
 */
export function formatDataAge(
  input: { at?: string | null; date?: string | null; isStatic?: boolean },
  now: Date = new Date(),
): string {
  if (input.isStatic) return 'tidak diperbarui';
  if (input.at) {
    const minutes = Math.floor((now.getTime() - new Date(input.at).getTime()) / 60_000);
    if (minutes < 1) return 'baru saja';
    if (minutes < 60) return `${minutes} menit lalu`;
    // Dibulatkan seperti mockup: 2 jam 38 menit → "3 jam lalu".
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    return `${Math.max(1, Math.floor(minutes / 1440))} hari lalu`;
  }
  if (input.date) {
    const days = daysBetween(input.date, jakartaDateOf(now));
    if (days <= 0) return 'hari ini';
    return `${days} hari lalu`;
  }
  return EMPTY;
}
