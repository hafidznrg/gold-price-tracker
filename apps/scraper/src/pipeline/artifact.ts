import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  Brand,
  ErrorCode,
  IsoDate,
  IsoDateTimeOffset,
  Frequency,
  IsoDateTimeUtc,
  MacroSource,
  MacroUnit,
  PriceSource,
  Product,
  QuarantineReason,
  RunStatus,
  ScraperId,
  Series,
  Slot,
  SpotSnapshot,
  Trigger,
  Workflow,
} from '@gold/schema';
import { z } from 'zod';
import type { RawPayload } from '../sources/types';

// WORKFLOWS §2.1 — artifact `out-{source}` dari job scrape ke job merge:
//   run.json   baris RUN tanpa hitungan insert/update/unchanged (+ metadata raw & kode keluar)
//   rows.json  baris lolos validasi run-level, belum berisi scraped_at/run_id/origin
//   held.json  batch karantina [{ reason_code, rows }]
//   raw.{html,json,csv,xlsx}.gz  respons mentah (fragmen yang dipakai parser)
//   spot.json  (opsional, hanya sumber makro) SPOT_SNAPSHOT yang ditimpa merge ke data/macro/
// `run.kind = 'macro'` mengganti bentuk baris di rows.json/held.json menjadi baris makro.

export const ARTIFACT_FILES = {
  run: 'run.json',
  rows: 'rows.json',
  held: 'held.json',
  spot: 'spot.json',
} as const;

export const RAW_EXTENSIONS = ['html', 'json', 'csv', 'xlsx'] as const;
export type RawExtension = (typeof RAW_EXTENSIONS)[number];

/** Ekstensi berkas raw menurut tipe isi `RawPayload`; `octet-stream` = XLSX (dibawa base64). */
export function rawExtension(raw: Pick<RawPayload, 'contentType'>): RawExtension {
  switch (raw.contentType) {
    case 'text/html':
      return 'html';
    case 'text/csv':
      return 'csv';
    case 'application/octet-stream':
      return 'xlsx'; // sumber makro: berkas XLSX yang dibawa sebagai base64 (worldbank, jisdor)
    default:
      return 'json';
  }
}

/** Isi berkas raw: XLSX disimpan sebagai byte aslinya, bukan base64. */
export const rawBytes = (raw: RawPayload): string | Buffer =>
  raw.contentType === 'application/octet-stream' ? Buffer.from(raw.body, 'base64') : raw.body;

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
  /** Bentuk baris artifact; kosong = `prices` (artifact lama tidak berubah). */
  kind: z.enum(['prices', 'macro']).optional(),
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

export const MacroCandidateRow = z.object({
  date: IsoDate,
  series: Series,
  frequency: Frequency,
  value: z.number().positive(),
  unit: MacroUnit,
  source: MacroSource,
});

export const MacroHeldFile = z.array(
  z.object({ reason_code: QuarantineReason, rows: z.array(MacroCandidateRow).min(1) }),
);

async function readJson<T extends z.ZodType>(file: string, schema: T): Promise<z.infer<T>> {
  const result = schema.safeParse(JSON.parse(await readFile(file, 'utf8')));
  if (!result.success) throw new Error(`${file} tidak valid:\n${result.error.message}`);
  return result.data;
}

interface ArtifactBase {
  dir: string;
  run: ScrapeRun;
}

export interface PriceArtifact extends ArtifactBase {
  kind: 'prices';
  rows: z.infer<typeof CandidateRow>[];
  held: z.infer<typeof HeldFile>;
}

export interface MacroArtifact extends ArtifactBase {
  kind: 'macro';
  rows: z.infer<typeof MacroCandidateRow>[];
  held: z.infer<typeof MacroHeldFile>;
  /** Hanya scraper harian xaus yang membawa spot; null untuk backfill. */
  spot: SpotSnapshot | null;
}

export type Artifact = PriceArtifact | MacroArtifact;

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function readArtifact(dir: string): Promise<Artifact> {
  const run = await readJson(path.join(dir, ARTIFACT_FILES.run), ScrapeRun);
  if (run.kind === 'macro') {
    const spotFile = path.join(dir, ARTIFACT_FILES.spot);
    const [rows, held, spot] = await Promise.all([
      readJson(path.join(dir, ARTIFACT_FILES.rows), z.array(MacroCandidateRow)),
      readJson(path.join(dir, ARTIFACT_FILES.held), MacroHeldFile),
      (await fileExists(spotFile)) ? readJson(spotFile, SpotSnapshot) : Promise.resolve(null),
    ]);
    return { kind: 'macro', dir, run, rows, held, spot };
  }
  const [rows, held] = await Promise.all([
    readJson(path.join(dir, ARTIFACT_FILES.rows), z.array(CandidateRow)),
    readJson(path.join(dir, ARTIFACT_FILES.held), HeldFile),
  ]);
  return { kind: 'prices', dir, run, rows, held };
}
