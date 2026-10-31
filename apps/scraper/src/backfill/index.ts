import { logammuliaArchive } from './logammulia-archive';
import { pegadaianSavings } from './pegadaian-savings';
import type { BackfillJob } from './types';
import { ubsHistory } from './ubs-history';

// Job backfill (WORKFLOWS §3.4). Pilihan `job` di backfill.yml harus sama dengan
// BACKFILL_JOB_IDS tanpa job `localOnly`; job yang belum ada modulnya keluar dengan kode 2 dan
// menyebut tugasnya.

export const BACKFILL_JOB_IDS = [
  'worldbank',
  'xaus',
  'ecb',
  'jisdor',
  'annual-fx',
  'ubs-history',
  'logammulia-archive',
  'pegadaian-savings',
] as const;
export type BackfillJobId = (typeof BACKFILL_JOB_IDS)[number];

/** Tugas rencana yang mengimplementasikan tiap job. */
export const BACKFILL_TASKS: Record<BackfillJobId, string> = {
  worldbank: 'P2-06',
  xaus: 'P2-07',
  ecb: 'P2-08',
  jisdor: 'P2-09',
  'annual-fx': 'P2-10',
  'ubs-history': 'P1-09',
  'logammulia-archive': 'D-29',
  'pegadaian-savings': 'D-30',
};

/** Modul job yang sudah diimplementasikan. */
const registry: Partial<Record<BackfillJobId, BackfillJob>> = {
  'ubs-history': ubsHistory,
  'logammulia-archive': logammuliaArchive,
  'pegadaian-savings': pegadaianSavings,
};

export function getBackfillJob(id: BackfillJobId): BackfillJob | undefined {
  return registry[id];
}
