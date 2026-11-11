import { jakartaIso, type SourceStatusFile } from '@gold/schema';
import type { ProjectConfig } from '../config';
import { isExpectedDay } from './calendar';
import { doneToday, succeededOn, targetDate } from './plan';

// D-44 — alarm "data hari ini belum masuk". Cron GitHub bisa terlambat berjam-jam atau tidak
// muncul sama sekali (11 Nov 2026), dan notify hanya berjalan bila scrape berjalan. Watchdog
// membaca data/meta/status.json lewat cron tersendiri dan melapor ke Telegram bila sumber yang
// diharapkan hari itu belum punya data.

export type WatchdogScope = 'day' | 'all';

/**
 * Cron watchdog → cakupan. Harus sama dengan `on.schedule` di `.github/workflows/watchdog.yml`.
 * `day` setelah retry siang terakhir (15.25 WIB): hanya sumber ritel berjendela `day`.
 * `all` setelah retry malam terakhir (22.35 WIB): semua sumber aktif.
 */
export const WATCHDOG_SCHEDULES: Record<string, WatchdogScope> = {
  '50 9 * * *': 'day', // 16.50 WIB
  '20 16 * * *': 'all', // 23.20 WIB
};

export interface Overdue {
  source: string;
  last_status: string | null;
  last_data_date: string | null;
  last_success_at: string | null;
}

export interface WatchdogResult {
  /** Tanggal WIB yang diperiksa. */
  date: string;
  scope: WatchdogScope;
  checked: string[];
  overdue: Overdue[];
}

export function watchdog(input: {
  event: string;
  schedule: string;
  config: ProjectConfig;
  status: SourceStatusFile;
  now: Date;
}): WatchdogResult {
  const { config, status } = input;
  // Watchdog yang terlambat lewat tengah malam tetap memeriksa tanggal cron-nya (D-27).
  const date = targetDate(input.event, input.schedule, input.now);
  const scope: WatchdogScope =
    input.event === 'schedule' ? (WATCHDOG_SCHEDULES[input.schedule.trim()] ?? 'all') : 'all';

  const sources = config.sources.filter(
    (s) =>
      s.enabled &&
      isExpectedDay(s.update_calendar, date, config.holidays) &&
      (scope === 'all' || (s.workflow === 'scrape-retail' && s.schedule_window === 'day')),
  );
  const overdue: Overdue[] = [];
  for (const s of sources) {
    const entry = status[s.id];
    // Ritel: harus ada data bertanggal hari itu. Makro: cukup run sukses hari itu, karena xaus
    // mencatat penutupan hari bursa sebelumnya.
    const ok = s.kind === 'macro' ? succeededOn(entry, date) : doneToday(entry, date);
    if (ok) continue;
    overdue.push({
      source: s.id,
      last_status: entry?.last_status ?? null,
      last_data_date: entry?.last_data_date ?? null,
      last_success_at: entry?.last_success_at ?? null,
    });
  }
  return { date, scope, checked: sources.map((s) => s.id), overdue };
}

const wibTime = (iso: string) => jakartaIso(new Date(iso)).slice(0, 16).replace('T', ' ');

/** Pesan Telegram (teks polos); null bila tidak ada yang terlambat. */
export function formatWatchdog(r: WatchdogResult, actionsUrl: string): string | null {
  if (r.overdue.length === 0) return null;
  const lines = r.overdue.map((o) => {
    const last = o.last_success_at
      ? `sukses terakhir ${wibTime(o.last_success_at)} WIB`
      : 'belum pernah sukses';
    return `• ${o.source}: data terakhir ${o.last_data_date ?? '—'}, status ${o.last_status ?? '—'}, ${last}`;
  });
  return [
    `⏰ watchdog — data ${r.date} belum masuk (${r.overdue.length} dari ${r.checked.length} sumber)`,
    ...lines,
    '',
    'Kemungkinan cron GitHub terlambat/terlewat atau scrape gagal. Picu manual:',
    'gh workflow run scrape-retail.yml   ·   gh workflow run scrape-macro.yml',
    actionsUrl,
  ]
    .join('\n')
    .trim();
}
