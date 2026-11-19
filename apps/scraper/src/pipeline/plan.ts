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
  /** Jendela sumber yang diikutkan slot ini (selain sumber `any`). */
  windows: readonly ScheduleWindow[];
  /**
   * Jendela percobaan awal (D-67): sumber di jendela ini ikut jadi kandidat dan dilewati bila sudah
   * sukses (seperti retry), tetapi hasil `stale`-nya tidak memicu alarm (`early` di matrix).
   */
  early?: readonly ScheduleWindow[];
}

/**
 * Cron per workflow → slot dan jendela (D-46, D-67). Cron yang tidak terdaftar = `primary` tanpa
 * saringan jendela. Dua sumber kunci:
 * - Cron tiruan pemicu Cloudflare (`apps/trigger`, tepat waktu, menit :20): tidak ada di
 *   `on.schedule` GitHub; tiba lewat `workflow_dispatch` dengan input `schedule` (`--emulate`).
 *   Semuanya `retry` (sumber yang sudah masuk dilewati) kecuali sapuan 19.20 WIB yang `primary`:
 *   menjalankan ulang semua sumber untuk menangkap revisi harga sore.
 * - Cron GitHub di `.github/workflows/` (rutin terlambat 4,5–10,5 jam, D-45): selalu `retry`,
 *   sehingga sumber yang sudah masuk dilewati dan keterlambatannya menjadi cadangan.
 */
export const SCHEDULES: Partial<Record<Workflow, Record<string, ScheduleSlot>>> = {
  'scrape-retail': {
    // Cloudflare 08.20 WIB: hanya percobaan awal Logam Mulia (terbit ±07.30–08.40).
    '20 1 * * *': { slot: 'retry', windows: [], early: ['day'] },
    '20 2 * * *': { slot: 'retry', windows: ['day'] }, // Cloudflare 09.20 WIB
    '20 4 * * *': { slot: 'retry', windows: ['day', 'midday'] }, // Cloudflare 11.20 WIB
    // Cloudflare 13.20 WIB: UBS dan Lotus Archi dicoba awal (belum tentu terbit).
    '20 6 * * *': { slot: 'retry', windows: ['day', 'midday'], early: ['afternoon'] },
    '20 9 * * *': { slot: 'retry', windows: ['day', 'midday', 'afternoon'] }, // Cloudflare 16.20 WIB
    // Cloudflare 19.20 WIB: sapuan, jalankan ulang semuanya (revisi harga sore).
    '20 12 * * *': { slot: 'primary', windows: ['day', 'midday', 'afternoon'] },
    '15 21 * * *': { slot: 'retry', windows: ['day', 'midday'] }, // GitHub 04.15 WIB → tiba ±09–14 WIB
    // GitHub 09.15 WIB → tiba ±14–19 WIB, jadi juga cadangan jendela sore (D-63).
    '15 2 * * *': { slot: 'retry', windows: ['day', 'midday', 'afternoon'] },
  },
  'scrape-macro': {
    '20 9 * * 1-5': { slot: 'primary', windows: ['day'] }, // Cloudflare 16.20 WIB, setelah JISDOR 15.15
    '45 9 * * 1-5': { slot: 'retry', windows: ['day'] }, // GitHub 16.45 WIB → tiba ±00 WIB
  },
};

/** Cron yang memang terdaftar di `on.schedule` GitHub (sisanya hanya dipicu Cloudflare). */
export const GITHUB_SCHEDULES: Partial<Record<Workflow, readonly string[]>> = {
  'scrape-retail': ['15 21 * * *', '15 2 * * *'],
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
 * Jam Jakarta (`HH:mm`) mulai jendela `day`: Logam Mulia terbit ±07.30–08.40 WIB; percobaan awal
 * Cloudflare 08.20 WIB harus lolos (D-67). Cron GitHub 04.15 WIB yang kebetulan tiba tepat waktu (atau run manual tanpa daftar sumber) melewati
 * sumber `day` sebelum jam ini, alih-alih mencatat `stale` (D-46).
 */
export const DAY_FROM = '08:15';

/**
 * Jam Jakarta (`HH:mm`) mulai jendela `afternoon`: UBS terbit ±12.00–16.30 WIB (D-63). Cron GitHub
 * 09.15 WIB yang tiba lebih awal (atau run manual tanpa daftar sumber) melewati sumber
 * `afternoon` sebelum jam ini, alih-alih mencatat `stale`.
 */
export const AFTERNOON_FROM = '12:00';

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
  matrix: { include: { source: ScraperId; browser: boolean; early: boolean }[] };
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
    entry.carry_over !== true &&
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
  const scheduled = slot === 'manual' ? undefined : scheduleOf(workflow, input.schedule);
  const windows = scheduled?.windows;
  const earlyWindows = scheduled?.early ?? [];
  const isEarly = (s: { schedule_window: ScheduleWindow }) =>
    !(windows?.includes(s.schedule_window) || s.schedule_window === 'any') &&
    earlyWindows.includes(s.schedule_window);
  if (windows !== undefined) {
    candidates = candidates.filter(
      (s) => windows.includes(s.schedule_window) || s.schedule_window === 'any' || isEarly(s),
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
  const onTargetDay = nowWib.slice(0, 10) === today;
  const beforeDay = onTargetDay && nowWib.slice(11, 16) < DAY_FROM;
  const beforeAfternoon = onTargetDay && nowWib.slice(11, 16) < AFTERNOON_FROM;
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
    if ((manualAll || slot !== 'manual') && s.schedule_window === 'afternoon' && beforeAfternoon) {
      skipped.push({ source: s.id, reason: `jendela sore mulai ${AFTERNOON_FROM} WIB` });
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
      const caughtUp =
        s.accept_previous_day &&
        windows?.includes('day') === true &&
        entry?.carry_over !== true &&
        successToday(entry, today);
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
      include: selected.map((s) => ({
        source: s.id,
        browser: s.fetch_method === 'browser',
        early: isEarly(s),
      })),
    },
    has_work: selected.length > 0,
    skipped,
  };
}
