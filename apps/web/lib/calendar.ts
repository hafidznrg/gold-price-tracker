import type { UpdateCalendar } from '@gold/schema';
import type { MetaFile } from './data/types';

/** Kalender terbit per sumber + tanggal libur, dari meta.json (untuk deteksi celah). */
export interface DataCalendar {
  calendars: Partial<Record<string, UpdateCalendar>>;
  holidays: string[];
}

export function calendarFromMeta(meta: Pick<MetaFile, 'sources' | 'holidays'>): DataCalendar {
  const calendars: DataCalendar['calendars'] = {};
  for (const s of meta.sources) calendars[s.id] = s.update_calendar;
  return { calendars, holidays: meta.holidays ?? [] };
}

// Salinan ringan `isExpectedDay` @gold/schema: impor nilai dari paket itu menyeret zod dan
// date-fns-tz (~117 KB) ke bundel klien. Aturannya identik (DATA-MODEL §7).
function isExpectedDay(
  calendar: UpdateCalendar,
  date: string,
  holidays: readonly { date: string }[],
): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const isWeekday = weekday >= 1 && weekday <= 5;
  switch (calendar) {
    case 'daily':
      return true;
    case 'weekdays':
      return isWeekday;
    case 'business_days_id':
      return isWeekday && !holidays.some((h) => h.date === date);
    case 'monthly':
      return false;
  }
}

/**
 * Hari yang diharapkan ada data untuk semua `sources`. Hari ketika salah satu sumber memang tidak
 * terbit (mis. Minggu atau libur untuk `business_days_id`) bukan celah: garis disambung.
 * Sumber tanpa kalender dianggap `daily`.
 */
export function expectedFor(
  cal: DataCalendar,
  sources: readonly string[],
): (date: string) => boolean {
  const holidays = cal.holidays.map((date) => ({ date }));
  return (date) => sources.every((s) => isExpectedDay(cal.calendars[s] ?? 'daily', date, holidays));
}

/** Celah grafik: label pil hanya bila sedikit (≤ 2) agar tidak menumpuk; selebihnya arsir saja. */
export function labelGaps<T extends { from: string; to: string }>(
  gaps: T[],
  label = 'Tidak ada data',
): (T & { label?: string })[] {
  return gaps.length <= 2 ? gaps.map((g) => ({ ...g, label })) : gaps;
}
