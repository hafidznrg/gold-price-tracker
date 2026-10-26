import {
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
 * Cron per workflow → slot dan jendela. Cron yang tidak terdaftar = `primary` tanpa saringan
 * jendela. Harus sama dengan `on.schedule` di `.github/workflows/`.
 */
export const SCHEDULES: Partial<Record<Workflow, Record<string, ScheduleSlot>>> = {
  'scrape-retail': {
    '25 3 * * *': { slot: 'primary', window: 'day' }, // 10.25 WIB
    '25 6 * * *': { slot: 'retry', window: 'day' }, // 13.25 WIB
    '5 12 * * *': { slot: 'primary', window: 'evening' }, // 19.05 WIB
    '5 14 * * *': { slot: 'retry', window: 'evening' }, // 21.05 WIB
  },
};

/**
 * Jam Jakarta (`HH:mm`) mulai jendela `evening`: snapshot Pegadaian terbit ±18.32 WIB (D-25).
 * Run manual tanpa daftar sumber melewati sumber `evening` sebelum jam ini.
 */
export const EVENING_FROM = '18:45';

export interface PlanInput {
  workflow: Workflow;
  /** `github.event_name`: `schedule` atau `workflow_dispatch`. */
  event: string;
  /** `github.event.schedule` (kosong untuk run manual). */
  schedule: string;
  /** Input manual `sources`, dipisah koma; kosong = semua yang aktif. */
  sources: string;
  force: boolean;
  config: ProjectConfig;
  status: SourceStatusFile;
  now: Date;
}

export interface PlanResult {
  slot: Slot;
  sources: ScraperId[];
  matrix: { include: { source: ScraperId; browser: boolean }[] };
  has_work: boolean;
  skipped: { source: ScraperId; reason: string }[];
}

export class PlanError extends Error {}

/** Sudah `success`/`partial` dengan waktu sukses pada tanggal Jakarta `today`. */
export function doneToday(entry: SourceStatusEntry | undefined, today: string): boolean {
  return (
    entry !== undefined &&
    (entry.last_status === 'success' || entry.last_status === 'partial') &&
    entry.last_success_at !== null &&
    jakartaDate(new Date(entry.last_success_at)) === today
  );
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
  const today = jakartaDate(input.now);
  const slot = slotOf(workflow, input.event, input.schedule);
  const inWorkflow = config.sources.filter((s) => s.workflow === workflow);

  let candidates = inWorkflow.filter((s) => s.enabled);
  const window = slot === 'manual' ? undefined : scheduleOf(workflow, input.schedule)?.window;
  if (window !== undefined) candidates = candidates.filter((s) => s.schedule_window === window);
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
  const beforeEvening = jakartaIso(input.now).slice(11, 16) < EVENING_FROM;
  const selected = candidates.filter((s) => {
    const entry = status[s.id];
    const manualAll = slot === 'manual' && requested.length === 0;
    if (manualAll && s.schedule_window === 'evening' && beforeEvening) {
      skipped.push({ source: s.id, reason: `jendela malam mulai ${EVENING_FROM} WIB` });
      return false;
    }
    if (slot === 'retry') {
      if (doneToday(entry, today)) {
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
    sources: selected.map((s) => s.id),
    matrix: {
      include: selected.map((s) => ({ source: s.id, browser: s.fetch_method === 'browser' })),
    },
    has_work: selected.length > 0,
    skipped,
  };
}
