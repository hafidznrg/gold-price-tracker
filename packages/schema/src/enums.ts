import { z } from 'zod';

// DATA-MODEL §3.6

/** Modul scraper (`apps/scraper/src/sources/*`); juga kunci di `config/sources.yml` dan `status.json`. */
export const SCRAPER_IDS = [
  'ubslifestyle',
  'pegadaian',
  'logammulia',
  'xaus',
  'jisdor',
  'worldbank',
] as const;
export const ScraperId = z.enum(SCRAPER_IDS);
export type ScraperId = z.infer<typeof ScraperId>;

export const PRICE_SOURCES = ['logammulia', 'pegadaian', 'ubslifestyle'] as const;
export const PriceSource = z.enum(PRICE_SOURCES);
export type PriceSource = z.infer<typeof PriceSource>;

/** Nilai kolom `source` di CSV makro (penyedia data, bukan modul scraper). */
export const MACRO_SOURCES = ['xaus', 'worldbank', 'bi', 'ecb', 'wdi'] as const;
export const MacroSource = z.enum(MACRO_SOURCES);
export type MacroSource = z.infer<typeof MacroSource>;

/** `pegadaian` = produk milik Pegadaian sendiri (Tabungan Emas, D-30). */
export const BRANDS = ['antam', 'ubs', 'galeri24', 'pegadaian'] as const;
export const Brand = z.enum(BRANDS);
export type Brand = z.infer<typeof Brand>;

/** `gold_bar` default; varian lain ditambah lewat katalog, mis. `gold_bar_retro`. */
export const Product = z.string().regex(/^[a-z][a-z0-9_]*$/, 'product harus snake_case');
export type Product = z.infer<typeof Product>;

export const SERIES = ['xau_usd_oz', 'usd_idr_jisdor', 'usd_idr_ecb', 'usd_idr_annual'] as const;
export const Series = z.enum(SERIES);
export type Series = z.infer<typeof Series>;

export const FREQUENCIES = ['D', 'M', 'A'] as const;
export const Frequency = z.enum(FREQUENCIES);
export type Frequency = z.infer<typeof Frequency>;

export const MACRO_UNITS = ['USD/ozt', 'IDR/USD'] as const;
export const MacroUnit = z.enum(MACRO_UNITS);
export type MacroUnit = z.infer<typeof MacroUnit>;

export const ORIGINS = ['scrape', 'backfill', 'manual'] as const;
export const Origin = z.enum(ORIGINS);
export type Origin = z.infer<typeof Origin>;

export const RUN_STATUSES = ['success', 'partial', 'stale', 'failed', 'skipped'] as const;
export const RunStatus = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatus>;

export const ERROR_CODES = [
  'FETCH_HTTP',
  'FETCH_TIMEOUT',
  'BLOCKED',
  'TOKEN_MISSING',
  'PARSE_ERROR',
  'SCHEMA_INVALID',
  'VALIDATION_FAILED',
  'STALE_SOURCE',
  'UNKNOWN',
] as const;
export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Alasan karantina (TECH-SPEC §7). */
export const QUARANTINE_REASONS = ['UNKNOWN_ITEM', 'PRICE_JUMP', 'MASS_REVISION'] as const;
export const QuarantineReason = z.enum(QUARANTINE_REASONS);
export type QuarantineReason = z.infer<typeof QuarantineReason>;

export const QUARANTINE_DECISIONS = ['pending', 'approved', 'rejected'] as const;
export const QuarantineDecision = z.enum(QUARANTINE_DECISIONS);
export type QuarantineDecision = z.infer<typeof QuarantineDecision>;

export const REVISION_REASONS = [
  'source_changed',
  'quarantine_approved',
  'reparse',
  'manual',
] as const;
export const RevisionReason = z.enum(REVISION_REASONS);
export type RevisionReason = z.infer<typeof RevisionReason>;

export const TRIGGERS = ['schedule', 'workflow_dispatch'] as const;
export const Trigger = z.enum(TRIGGERS);
export type Trigger = z.infer<typeof Trigger>;

export const SLOTS = ['primary', 'retry', 'manual', 'backfill'] as const;
export const Slot = z.enum(SLOTS);
export type Slot = z.infer<typeof Slot>;

export const WORKFLOWS = ['scrape-retail', 'scrape-macro', 'backfill', 'quarantine'] as const;
export const Workflow = z.enum(WORKFLOWS);
export type Workflow = z.infer<typeof Workflow>;
