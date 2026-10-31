import type { MacroRow, MacroSource, PriceRow, PriceSource, Series } from '@gold/schema';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';

// WORKFLOWS §3.4 — kontrak job backfill. Sama dengan modul sumber (TECH-SPEC §3): fetch
// mentah lalu parse murni, tetapi menghasilkan histori bertanggal lampau.

export interface BackfillContext {
  /** Root repo (absolut), untuk membaca config/ dan data/. */
  root: string;
  runId: string;
  userAgent: string;
  now: Date;
  /** Rentang opsional dari input workflow (`YYYY-MM-DD`, inklusif). */
  from?: string;
  to?: string;
  /** Folder berisi file sumber untuk job `localOnly` (`--input`, absolut). */
  input?: string;
  pauseMs?: number;
  retryDelayMs?: number;
}

interface BaseBackfillJob {
  id: string;
  /** Dicatat di RUN, mis. `ubs-history@1.0.0`. */
  parserVersion: string;
  /**
   * Job yang membaca file lokal (`--input`), bukan situs: hanya dijalankan dari terminal dan
   * tidak muncul sebagai pilihan di backfill.yml.
   */
  localOnly?: boolean;
  fetchRaw(ctx: BackfillContext): Promise<RawPayload>;
}

export interface PriceBackfillJob extends BaseBackfillJob {
  kind?: 'prices';
  /** Sumber harga yang diisi. */
  source: PriceSource;
  /** Fungsi murni: tidak boleh melakukan I/O. */
  parse(raw: RawPayload): ParseResult<PriceRow>;
  /**
   * Opsional, murni: buang baris yang sudah tercakup data sumber itu (mis. tanggal yang sudah
   * di-scrape harian). Baris yang dibuang dihitung `rows_rejected`.
   */
  select?(rows: ParsedRow<PriceRow>[], existing: readonly PriceRow[]): ParsedRow<PriceRow>[];
}

/**
 * Job histori makro (TECH-SPEC §5.6): mengisi satu seri `data/macro/{series}.csv`. Pipeline
 * `backfill`/`merge` untuk baris makro menyusul di P2-01/P2-02; sampai itu CLI menolak job ini.
 */
export interface MacroBackfillJob extends BaseBackfillJob {
  kind: 'macro';
  series: Series;
  /** Penyedia data (kolom `source` CSV makro). */
  source: MacroSource;
  /** Fungsi murni: tidak boleh melakukan I/O. */
  parse(raw: RawPayload): ParseResult<MacroRow>;
}

export type BackfillJob = PriceBackfillJob | MacroBackfillJob;
