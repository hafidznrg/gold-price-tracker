import { annualFx } from './annual-fx';
import { ecb } from './ecb';
import { galeri24History } from './galeri24-history';
import { jisdor } from './jisdor';
import { logammuliaArchive } from './logammulia-archive';
import { lotusarchiHistory } from './lotusarchi-history';
import { pegadaianRawBrand } from './pegadaian-raw-brand';
import { pegadaianSavings } from './pegadaian-savings';
import type { BackfillJob } from './types';
import { ubsHistory } from './ubs-history';
import { ubsRawSell } from './ubs-raw-sell';
import { worldbank } from './worldbank';
import { xaus } from './xaus';

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
  'ubs-raw-sell',
  'logammulia-archive',
  'pegadaian-savings',
  'pegadaian-raw-brand',
  'galeri24-history',
  'lotusarchi-history',
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
  'ubs-raw-sell': 'D-78',
  'logammulia-archive': 'D-29',
  'pegadaian-savings': 'D-30',
  'pegadaian-raw-brand': 'P6-08',
  'galeri24-history': 'P6-11',
  'lotusarchi-history': 'P6-09',
};

/** Modul job yang sudah diimplementasikan. */
const registry: Partial<Record<BackfillJobId, BackfillJob>> = {
  'annual-fx': annualFx,
  ecb,
  jisdor,
  worldbank,
  xaus,
  'ubs-history': ubsHistory,
  'ubs-raw-sell': ubsRawSell,
  'logammulia-archive': logammuliaArchive,
  'pegadaian-savings': pegadaianSavings,
  'pegadaian-raw-brand': pegadaianRawBrand,
  'galeri24-history': galeri24History,
  'lotusarchi-history': lotusarchiHistory,
};

export function getBackfillJob(id: BackfillJobId): BackfillJob | undefined {
  return registry[id];
}
