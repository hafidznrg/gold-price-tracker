import type { PriceRow, PriceSource } from '@gold/schema';
import type { ParseResult, RawPayload } from '../sources/types';

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
  pauseMs?: number;
  retryDelayMs?: number;
}

export interface BackfillJob {
  id: string;
  /** Sumber harga yang diisi. Job makro (Fase 2) menambah varian `macro`. */
  source: PriceSource;
  /** Dicatat di RUN, mis. `ubs-history@1.0.0`. */
  parserVersion: string;
  fetchRaw(ctx: BackfillContext): Promise<RawPayload>;
  /** Fungsi murni: tidak boleh melakukan I/O. */
  parse(raw: RawPayload): ParseResult<PriceRow>;
}
