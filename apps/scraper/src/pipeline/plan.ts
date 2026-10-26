import {
  jakartaDate,
  ScraperId,
  type Slot,
  type SourceStatusEntry,
  type SourceStatusFile,
  type Workflow,
} from '@gold/schema';
import type { ProjectConfig } from '../config';
import { isExpectedDay } from './calendar';

// WORKFLOWS §2.2 — job plan: pilih sumber yang dijalankan dan slotnya.

/** Cron slot `retry` per workflow; cron lain dari workflow yang sama = `primary`. */
export const RETRY_SCHEDULES: Partial<Record<Workflow, string>> = {
  'scrape-retail': '25 6 * * *',
};

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

export function slotOf(workflow: Workflow, event: string, schedule: string): Slot {
  if (event !== 'schedule') return 'manual';
  return schedule.trim() === RETRY_SCHEDULES[workflow] ? 'retry' : 'primary';
}

export function plan(input: PlanInput): PlanResult {
  const { workflow, config, status } = input;
  const today = jakartaDate(input.now);
  const slot = slotOf(workflow, input.event, input.schedule);
  const inWorkflow = config.sources.filter((s) => s.workflow === workflow);

  let candidates = inWorkflow.filter((s) => s.enabled);
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
  const selected = candidates.filter((s) => {
    const entry = status[s.id];
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
