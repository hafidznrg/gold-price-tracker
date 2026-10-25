import type { MacroRow, PriceRow, ScraperId, SourceConfig } from '@gold/schema';

// TECH-SPEC §3 — kontrak setiap modul sumber.

export interface FetchContext {
  /** Root repo (absolut), untuk membaca config/ dan data/. */
  root: string;
  config: SourceConfig;
  runId: string;
  userAgent: string;
  now: Date;
  signal?: AbortSignal;
}

export interface RawPayload {
  body: string;
  contentType: 'text/html' | 'application/json' | 'text/csv' | 'application/octet-stream';
  /** ISO UTC */
  fetchedAt: string;
}

/**
 * Baris hasil parse belum punya kolom yang diisi pipeline saat merge
 * (`scraped_at`, `run_id`, `origin`).
 */
export type ParsedRow<Row> = Omit<Row, 'scraped_at' | 'run_id' | 'origin'>;

export interface ParseResult<Row> {
  rows: ParsedRow<Row>[];
  /** Tanggal data menurut sumber (Asia/Jakarta). */
  dataDate: string | null;
  /** Waktu update yang tertera di sumber (ISO +07:00). */
  sourceUpdatedAt: string | null;
}

export interface SourceScraper<Row extends PriceRow | MacroRow = PriceRow | MacroRow> {
  id: ScraperId;
  kind: 'prices' | 'macro';
  /** Dicatat di RUN dan RAW_SNAPSHOT, mis. `ubslifestyle@1.0.0`. */
  parserVersion: string;
  fetchRaw(ctx: FetchContext): Promise<RawPayload>;
  /** Fungsi murni: tidak boleh melakukan I/O. */
  parse(raw: RawPayload): ParseResult<Row>;
}
