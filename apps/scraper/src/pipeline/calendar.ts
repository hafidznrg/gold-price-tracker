import { weekdayIso, type Holiday, type UpdateCalendar } from '@gold/schema';

// DATA-MODEL §7: hari yang diharapkan ada data = hari sesuai `update_calendar`
// dikurangi `holidays.yml` (untuk `business_days_id`).

/**
 * Apakah sumber diharapkan punya data baru pada `date` (tanggal Jakarta).
 * `monthly` tidak punya hari harian yang diharapkan: basi di hari mana pun bukan insiden.
 */
export function isExpectedDay(
  calendar: UpdateCalendar,
  date: string,
  holidays: readonly Pick<Holiday, 'date'>[],
): boolean {
  const weekday = weekdayIso(date);
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
