import { isExpectedDay, type UpdateCalendar } from '@gold/schema';
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
