import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  Brand,
  ErrorCode,
  IsoDate,
  IsoDateTimeOffset,
  IsoDateTimeUtc,
  PriceSource,
  Product,
  QuarantineReason,
  RunStatus,
  ScraperId,
  Slot,
  Trigger,
  Workflow,
} from '@gold/schema';
import { z } from 'zod';

// WORKFLOWS §2.1 — artifact `out-{source}` dari job scrape ke job merge:
//   run.json   baris RUN tanpa hitungan insert/update/unchanged (+ metadata raw & kode keluar)
//   rows.json  baris lolos validasi run-level, belum berisi scraped_at/run_id/origin
//   held.json  batch karantina [{ reason_code, rows }]
//   raw.{html,json}.gz  respons mentah (fragmen yang dipakai parser)

export const ARTIFACT_FILES = {
  run: 'run.json',
  rows: 'rows.json',
  held: 'held.json',
} as const;

export const RAW_EXTENSIONS = ['html', 'json'] as const;
export type RawExtension = (typeof RAW_EXTENSIONS)[number];

const Count = z.number().int().nonnegative();

export const RawMeta = z.object({
  /** Nama file di folder artifact, mis. `raw.json.gz`. */
  file: z.string(),
  ext: z.enum(RAW_EXTENSIONS),
  fetched_at: IsoDateTimeUtc,
  /** sha256 isi sebelum gzip. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RawMeta = z.infer<typeof RawMeta>;

export const ScrapeRun = z.object({
  run_id: z.string(),
  source: ScraperId,
  workflow: Workflow,
  trigger: Trigger,
  slot: Slot,
  started_at: IsoDateTimeUtc,
  finished_at: IsoDateTimeUtc,
  status: RunStatus,
  error_code: ErrorCode.nullable(),
  error_message: z.string().max(500).nullable(),
  data_date: IsoDate.nullable(),
  rows_parsed: Count,
  rows_held: Count,
  rows_rejected: Count,
  parser_version: z.string(),
  /** Hari ini termasuk hari yang diharapkan menurut `update_calendar` (DATA-MODEL §7). */
  expected_day: z.boolean(),
  /** Kode keluar job scrape (WORKFLOWS §2.3). */
  exit_code: z.number().int(),
  history_points: Count.optional(),
  raw: RawMeta.nullable(),
});
export type ScrapeRun = z.infer<typeof ScrapeRun>;

export const CandidateRow = z.object({
  date: IsoDate,
  source: PriceSource,
  brand: Brand,
  product: Product,
  variant: z.string(),
  weight_g: z.number().positive(),
  location: z.string(),
  sell_price: z.number().int().positive().nullable(),
  buyback_price: z.number().int().positive().nullable(),
  source_updated_at: IsoDateTimeOffset.nullable(),
});

export const HeldFile = z.array(
  z.object({ reason_code: QuarantineReason, rows: z.array(CandidateRow).min(1) }),
);

async function readJson<T extends z.ZodType>(file: string, schema: T): Promise<z.infer<T>> {
  const result = schema.safeParse(JSON.parse(await readFile(file, 'utf8')));
  if (!result.success) throw new Error(`${file} tidak valid:\n${result.error.message}`);
  return result.data;
}

export interface Artifact {
  dir: string;
  run: ScrapeRun;
  rows: z.infer<typeof CandidateRow>[];
  held: z.infer<typeof HeldFile>;
}

export async function readArtifact(dir: string): Promise<Artifact> {
  const [run, rows, held] = await Promise.all([
    readJson(path.join(dir, ARTIFACT_FILES.run), ScrapeRun),
    readJson(path.join(dir, ARTIFACT_FILES.rows), z.array(CandidateRow)),
    readJson(path.join(dir, ARTIFACT_FILES.held), HeldFile),
  ]);
  return { dir, run, rows, held };
}
