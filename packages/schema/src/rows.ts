import { z } from 'zod';
import { isIsoDate } from './dates';
import {
  Brand,
  ErrorCode,
  Frequency,
  MacroSource,
  MacroUnit,
  Origin,
  PriceSource,
  Product,
  QuarantineDecision,
  QuarantineReason,
  RevisionReason,
  RunStatus,
  ScraperId,
  Series,
  Slot,
  Trigger,
  Workflow,
} from './enums';

// DATA-MODEL §3. Skema memvalidasi bentuk di memori; konversi dari/ke CSV ada di csv.ts.

export const IsoDate = z.string().refine(isIsoDate, 'tanggal harus YYYY-MM-DD yang valid');
/** `2026-10-24T10:12:08+07:00` */
export const IsoDateTimeOffset = z.iso.datetime({ offset: true });
/** `2026-10-24T03:31:40Z` */
export const IsoDateTimeUtc = z.iso.datetime();

const Rupiah = z.number().int().positive();
const RunId = z.string().regex(/^\d+-\d+$|^local-[\w-]+$/, 'run_id harus `${run_id}-${attempt}`');

export const PriceRow = z
  .object({
    date: IsoDate,
    source: PriceSource,
    brand: Brand,
    product: Product,
    variant: z.string(),
    weight_g: z.number().positive(),
    location: z.string(),
    sell_price: Rupiah.nullable(),
    buyback_price: Rupiah.nullable(),
    source_updated_at: IsoDateTimeOffset.nullable(),
    scraped_at: IsoDateTimeUtc,
    run_id: RunId,
    origin: Origin,
  })
  .refine((r) => r.sell_price !== null || r.buyback_price !== null, {
    message: 'minimal satu dari sell_price / buyback_price harus terisi (V-01)',
    path: ['sell_price'],
  });
export type PriceRow = z.infer<typeof PriceRow>;

export const MacroRow = z.object({
  date: IsoDate,
  series: Series,
  frequency: Frequency,
  value: z.number().positive(),
  unit: MacroUnit,
  source: MacroSource,
  scraped_at: IsoDateTimeUtc,
  run_id: RunId,
  origin: Origin,
});
export type MacroRow = z.infer<typeof MacroRow>;

export const SpotSnapshot = z.object({
  fetched_at: IsoDateTimeUtc,
  xau_usd_oz: z.number().positive(),
  usd_idr: z.number().positive(),
  usd_idr_series: Series,
  usd_idr_date: IsoDate,
  source: MacroSource,
  stale: z.boolean(),
});
export type SpotSnapshot = z.infer<typeof SpotSnapshot>;

const Count = z.number().int().nonnegative();

export const RunRecord = z
  .object({
    run_id: RunId,
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
    rows_inserted: Count,
    rows_updated: Count,
    rows_unchanged: Count,
    rows_held: Count,
    rows_rejected: Count,
    raw_paths: z.array(z.string()),
    parser_version: z.string(),
  })
  .refine(
    (r) =>
      r.rows_parsed ===
      r.rows_inserted + r.rows_updated + r.rows_unchanged + r.rows_held + r.rows_rejected,
    {
      message: 'rows_parsed harus sama dengan jumlah lima hitungan lainnya',
      path: ['rows_parsed'],
    },
  )
  .refine((r) => (r.status === 'failed') === (r.error_code !== null), {
    message: 'error_code wajib bila status failed dan kosong bila tidak',
    path: ['error_code'],
  });
export type RunRecord = z.infer<typeof RunRecord>;

export const SourceStatusEntry = z.object({
  last_run_id: RunId,
  last_status: RunStatus,
  last_success_at: IsoDateTimeUtc.nullable(),
  last_data_date: IsoDate.nullable(),
  consecutive_failures: Count,
  /** Khusus Logam Mulia: jumlah titik histori untuk aturan V-07. */
  history_points: Count.optional(),
  updated_at: IsoDateTimeUtc,
});
export type SourceStatusEntry = z.infer<typeof SourceStatusEntry>;

export const SourceStatusFile = z.partialRecord(ScraperId, SourceStatusEntry);
export type SourceStatusFile = z.infer<typeof SourceStatusFile>;

export const Revision = z.object({
  table: z.enum(['price', 'macro']),
  row_key: z.string(),
  field: z.string(),
  old_value: z.string(),
  new_value: z.string(),
  run_id: RunId,
  revised_at: IsoDateTimeUtc,
  reason: RevisionReason,
});
export type Revision = z.infer<typeof Revision>;

export const QuarantineBatch = z.object({
  run_id: RunId,
  source: ScraperId,
  reason_code: QuarantineReason,
  rows: z.array(z.union([PriceRow, MacroRow])).min(1),
  decision: QuarantineDecision,
  decided_at: IsoDateTimeUtc.optional(),
  decided_by: z.string().optional(),
  note: z.string().optional(),
});
export type QuarantineBatch = z.infer<typeof QuarantineBatch>;
