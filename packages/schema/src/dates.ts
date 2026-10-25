import { formatInTimeZone } from 'date-fns-tz';

// NFR-11: tanggal harga dalam Asia/Jakarta, timestamp teknis dalam UTC.

export const JAKARTA_TZ = 'Asia/Jakarta';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Tanggal kalender Jakarta (`YYYY-MM-DD`) dari `Date` atau epoch milidetik. */
export function jakartaDate(at: Date | number): string {
  return formatInTimeZone(at, JAKARTA_TZ, 'yyyy-MM-dd');
}

export function jakartaToday(now: Date = new Date()): string {
  return jakartaDate(now);
}

/** Timestamp dengan offset Jakarta, untuk `source_updated_at`: `2026-10-24T10:12:08+07:00`. */
export function jakartaIso(at: Date | number): string {
  return formatInTimeZone(at, JAKARTA_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Timestamp UTC tanpa milidetik, untuk `scraped_at`: `2026-10-24T03:31:40Z`. */
export function utcIso(at: Date | number = new Date()): string {
  return new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function assertIsoDate(value: string): void {
  if (!isIsoDate(value)) throw new Error(`Tanggal tidak valid: "${value}"`);
}

/** Geser tanggal kalender `YYYY-MM-DD` sebanyak `days` hari. */
export function addDaysIso(date: string, days: number): string {
  assertIsoDate(date);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Hari dalam minggu untuk tanggal kalender: 0 = Minggu … 6 = Sabtu. */
export function weekdayIso(date: string): number {
  assertIsoDate(date);
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
