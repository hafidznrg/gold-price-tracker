import {
  addDaysIso,
  jakartaDate,
  jakartaIso,
  ScraperId,
  type ScheduleWindow,
  type Slot,
  type SourceStatusEntry,
  type SourceStatusFile,
  type Workflow,
} from '@gold/schema';
import type { ProjectConfig } from '../config';
import { isExpectedDay } from './calendar';

// WORKFLOWS §2.2 — job plan: pilih sumber yang dijalankan dan slotnya.

interface ScheduleSlot {
  slot: 'primary' | 'retry';
  window: ScheduleWindow;
}

/**
 * Cron per workflow → slot dan jendela (D-46). Cron yang tidak terdaftar = `primary` tanpa saringan
 * jendela. Dua sumber kunci:
 * - Cron tiruan pemicu Cloudflare (`apps/trigger`, tepat waktu): slot utama. Tidak ada di
 *   `on.schedule` GitHub; tiba lewat `workflow_dispatch` dengan input `schedule` (`--emulate`).
 * - Cron GitHub di `.github/workflows/` (rutin terlambat 4,5–10,5 jam, D-45): selalu `retry`,
 *   sehingga sumber yang sudah masuk dilewati dan keterlambatannya menjadi cadangan.
 */
export const SCHEDULES: Partial<Record<Workflow, Record<string, ScheduleSlot>>> = {
  'scrape-retail': {
    '5 2 * * *': { slot: 'primary', window: 'day' }, // Cloudflare 09.05 WIB
    '5 5 * * *': { slot: 'retry', window: 'day' }, // Cloudflare 12.05 WIB
    '5 12 * * *': { slot: 'primary', window: 'evening' }, // Cloudflare 19.05 WIB
    '5 15 * * *': { slot: 'retry', window: 'evening' }, // Cloudflare 22.05 WIB
    '15 21 * * *': { slot: 'retry', window: 'day' }, // GitHub 04.15 WIB → tiba ±09–14 WIB
    '15 2 * * *': { slot: 'retry', window: 'day' }, // GitHub 09.15 WIB → tiba ±14–19 WIB
    '15 12 * * *': { slot: 'retry', window: 'evening' }, // GitHub 19.15 WIB → tiba ±02 WIB esok
  },
  'scrape-macro': {
    '40 9 * * 1-5': { slot: 'primary', window: 'day' }, // Cloudflare 16.40 WIB, setelah JISDOR 15.15
    '45 9 * * 1-5': { slot: 'retry', window: 'day' }, // GitHub 16.45 WIB → tiba ±00 WIB
  },
};

/** Cron yang memang terdaftar di `on.schedule` GitHub (sisanya hanya dipicu Cloudflare). */
export const GITHUB_SCHEDULES: Partial<Record<Workflow, readonly string[]>> = {
  'scrape-retail': ['15 21 * * *', '15 2 * * *', '15 12 * * *'],
  'scrape-macro': ['45 9 * * 1-5'],
};

/** World Bank (bulanan) baru dipilih mulai tanggal ini: rilis Pink Sheet ±tanggal 2 (TECH-SPEC §5.6). */
export const WORLDBANK_FROM_DAY = 5;

/**
 * Jam Jakarta (`HH:mm`) mulai jendela `evening`: snapshot Pegadaian terbit ±18.32 WIB (D-25).
 * Run manual tanpa daftar sumber melewati sumber `evening` sebelum jam ini.
 */
export const EVENING_FROM = '18:45';

/**
 * Jam Jakarta (`HH:mm`) mulai jendela `day`: Logam Mulia terbit ±07.30–08.40 WIB. Cron GitHub
 * 04.15 WIB yang kebetulan tiba tepat waktu (atau run manual tanpa daftar sumber) melewati
 * sumber `day` sebelum jam ini, alih-alih mencatat `stale` (D-46).
 */
export const DAY_FROM = '08:30';

export interface PlanInput {
  workflow: Workflow;
  /** `github.event_name`: `schedule` atau `workflow_dispatch`. */
  event: string;
  /** `github.event.schedule` (kosong untuk run manual). */
  schedule: string;
  /** Input manual `sources`, dipisah koma; kosong = semua yang aktif. */
  sources: string;
  force: boolean;
  /**
   * Tanggal (`YYYY-MM-01`) baris `xau_usd_oz` frekuensi `M` yang sudah ada; menentukan apakah
   * rata-rata bulan lalu masih perlu diambil (scrape-macro). Kosong = belum ada satu pun.
   */
  monthlyGold?: readonly string[];
  config: ProjectConfig;
  status: SourceStatusFile;
  now: Date;
}

export interface PlanResult {
  slot: Slot;
  /** Tanggal Jakarta sasaran (`YYYY-MM-DD`), diteruskan ke scrape dan merge. */
  date: string;
  sources: ScraperId[];
  matrix: { include: { source: ScraperId; browser: boolean }[] };
  has_work: boolean;
  skipped: { source: ScraperId; reason: string }[];
}

export class PlanError extends Error {}

/**
 * Sudah `success`/`partial` untuk tanggal data `today`. Memakai `last_data_date`, bukan jam
 * sukses, karena run yang terlambat bisa sukses lewat tengah malam untuk tanggal kemarin.
 */
export function doneToday(entry: SourceStatusEntry | undefined, today: string): boolean {
  return (
    entry !== undefined &&
    (entry.last_status === 'success' || entry.last_status === 'partial') &&
    entry.last_data_date === today
  );
}

/** Sukses makro sebelum jam ini (WIB) dianggap milik run kemarin yang terlambat lewat tengah malam. */
const MACRO_DAY_FROM = '12:00';

/**
 * Run makro untuk tanggal WIB `today` sudah sukses/partial (D-44). `xaus` selalu mencatat
 * penutupan hari bursa sebelumnya, jadi `last_data_date` tidak pernah sama dengan hari run dan
 * `doneToday` saja akan membuat slot retry makro selalu mengulang. Yang dipakai jam sukses:
 * cron makro paling awal 16.40 WIB, sehingga sukses sebelum 12.00 WIB pada `today` adalah run
 * kemarin yang terlambat (10 Nov 2026: selesai 00.18 WIB tanggal 11).
 */
export function succeededOn(entry: SourceStatusEntry | undefined, today: string): boolean {
  if (entry === undefined || entry.last_success_at === null) return false;
  if (entry.last_status !== 'success' && entry.last_status !== 'partial') return false;
  const at = jakartaIso(new Date(entry.last_success_at));
  return at.slice(0, 10) === today && at.slice(11, 16) >= MACRO_DAY_FROM;
}

/** Ada run sukses/partial yang selesai pada tanggal WIB `today`. */
function successToday(entry: SourceStatusEntry | undefined, today: string): boolean {
  if (entry === undefined || entry.last_success_at === null) return false;
  if (entry.last_status !== 'success' && entry.last_status !== 'partial') return false;
  return jakartaDate(new Date(entry.last_success_at)) === today;
}

const DAY_MS = 24 * 3600_000;

/** Hari dalam seminggu (0 = Minggu) dari field cron `*`, `1-5`, `1,3`, `1-3,5`. */
function weekdays(field: string): Set<number> {
  const days = new Set<number>();
  for (const part of field === '*' ? ['0-6'] : field.split(',')) {
    const [from, to = from] = part.split('-').map(Number);
    for (let d = from!; d <= to!; d++) days.add(d % 7);
  }
  return days;
}

/**
 * Tanggal Jakarta yang menjadi sasaran run (D-27). Run terjadwal memakai tanggal kemunculan
 * cron terakhir ≤ `now`, karena cron GitHub bisa terlambat berjam-jam (26 Okt: 5,7–6,9 jam)
 * sehingga slot malam berjalan lewat tengah malam WIB. Run manual dan cron yang tidak
 * berbentuk `M H * * D` (D = `*` atau hari-minggu `1-5`) memakai tanggal `now`.
 */
export function targetDate(event: string, schedule: string, now: Date): string {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-7](?:-[0-7])?(?:,[0-7](?:-[0-7])?)*)$/.exec(
    schedule.trim(),
  );
  if (event !== 'schedule' || !m) return jakartaDate(now);
  const days = weekdays(m[3]!);
  const at = new Date(now);
  at.setUTCHours(Number(m[2]), Number(m[1]), 0, 0);
  for (let i = 0; i < 8 && !(at.getTime() <= now.getTime() && days.has(at.getUTCDay())); i++) {
    at.setTime(at.getTime() - DAY_MS);
  }
  return jakartaDate(at);
}

function scheduleOf(workflow: Workflow, schedule: string): ScheduleSlot | undefined {
  return SCHEDULES[workflow]?.[schedule.trim()];
}

export function slotOf(workflow: Workflow, event: string, schedule: string): Slot {
  if (event !== 'schedule') return 'manual';
  return scheduleOf(workflow, schedule)?.slot ?? 'primary';
}

export function plan(input: PlanInput): PlanResult {
  const { workflow, config, status } = input;
  const today = targetDate(input.event, input.schedule, input.now);
  const slot = slotOf(workflow, input.event, input.schedule);
  const inWorkflow = config.sources.filter((s) => s.workflow === workflow);

  let candidates = inWorkflow.filter((s) => s.enabled);
  const window = slot === 'manual' ? undefined : scheduleOf(workflow, input.schedule)?.window;
  if (window !== undefined) {
    candidates = candidates.filter(
      (s) => s.schedule_window === window || s.schedule_window === 'any',
    );
  }
  const requested = input.sources
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (slot === 'manual' && requested.length > 0) {
    candidates = requested.map((id) => {
      const parsed = ScraperId.safeParse(id);
      const found = parsed.success && inWorkflow.find((s) => s.id === parsed.data);
      if (!found) {
        throw new PlanError(
          `sumber "${id}" tidak dikenal untuk ${workflow}; pilihan: ${inWorkflow.map((s) => s.id).join(', ')}`,
        );
      }
      return found; // sumber nonaktif boleh dijalankan manual bila disebut eksplisit
    });
  }

  const skipped: PlanResult['skipped'] = [];
  const nowWib = jakartaIso(input.now);
  const beforeEvening = nowWib.slice(11, 16) < EVENING_FROM;
  // Hanya untuk run yang tiba pada tanggal sasarannya sendiri; run kemarin yang terlambat lewat
  // tengah malam tetap jalan (data hari itu sudah terbit).
  const beforeDay = nowWib.slice(0, 10) === today && nowWib.slice(11, 16) < DAY_FROM;
  const selected = candidates.filter((s) => {
    const entry = status[s.id];
    const manualAll = slot === 'manual' && requested.length === 0;
    if (manualAll && s.schedule_window === 'evening' && beforeEvening) {
      skipped.push({ source: s.id, reason: `jendela malam mulai ${EVENING_FROM} WIB` });
      return false;
    }
    if ((manualAll || slot !== 'manual') && s.schedule_window === 'day' && beforeDay) {
      skipped.push({ source: s.id, reason: `jendela siang mulai ${DAY_FROM} WIB` });
      return false;
    }
    if (s.id === 'worldbank' && !(slot === 'manual' && requested.length > 0)) {
      const lastMonth = `${addDaysIso(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
      if (Number(today.slice(8, 10)) < WORLDBANK_FROM_DAY) {
        skipped.push({ source: s.id, reason: `tanggal < ${WORLDBANK_FROM_DAY}` });
        return false;
      }
      if (input.monthlyGold?.includes(lastMonth)) {
        skipped.push({ source: s.id, reason: `rata-rata ${lastMonth.slice(0, 7)} sudah ada` });
        return false;
      }
    }
    if (slot === 'retry') {
      // Sumber `accept_previous_day` (Pegadaian) di siang hari hanya bisa mendapat snapshot
      // kemarin; sekali sukses hari ini, retry siang berikutnya cuma menghasilkan commit `+0`.
      const caughtUp = s.accept_previous_day && window === 'day' && successToday(entry, today);
      if (
        doneToday(entry, today) ||
        caughtUp ||
        (s.kind === 'macro' && succeededOn(entry, today))
      ) {
        skipped.push({ source: s.id, reason: 'sudah sukses hari ini' });
        return false;
      }
      const staleToday =
        entry?.last_status === 'stale' && jakartaDate(new Date(entry.updated_at)) === today;
      if (staleToday && !isExpectedDay(s.update_calendar, today, config.holidays)) {
        skipped.push({ source: s.id, reason: 'stale di hari yang tidak diharapkan' });
        return false;
      }
    }
    if (slot === 'manual' && !input.force && doneToday(entry, today)) {
      skipped.push({ source: s.id, reason: 'sudah sukses hari ini (pakai force)' });
      return false;
    }
    return true;
  });

  return {
    slot,
    date: today,
    sources: selected.map((s) => s.id),
    matrix: {
      include: selected.map((s) => ({ source: s.id, browser: s.fetch_method === 'browser' })),
    },
    has_work: selected.length > 0,
    skipped,
  };
}
