import { addDaysIso, jakartaDate, parseRupiah, utcIso, type MacroRow } from '@gold/schema';
import { tableRows, tables } from '../html';
import { errorCodeOf, errorMessageOf, ScrapeError } from '../pipeline/errors';
import { PAGE_URL } from '../backfill/jisdor';
import { parseEcbRates, ratesUrl } from '../backfill/ecb';
import { parseTanggalIndonesia } from '../probe/checks';
import { fetchOk } from './http';
import type { ParsedRow, ParseResult, RawPayload, SourceScraper } from './types';

// TECH-SPEC §5.5 — JISDOR harian: `GET` halaman BI memuat tabel 10 hari kerja terakhir (D-21),
// semuanya di-upsert ke `usd_idr_jisdor`. Bila BI tidak dapat diakses, fallback ke Frankfurter
// (jendela yang sama) yang ditulis ke `usd_idr_ecb` — seri terpisah, tidak pernah menimpa JISDOR.
// Hanya kegagalan akses yang memicu fallback; halaman terbaca tapi tabelnya hilang = PARSE_ERROR.

/** Jendela fallback Frankfurter (hari kalender); setara 10 hari kerja BI. */
export const FALLBACK_DAYS = 14;

/**
 * Isi raw snapshot. `bi`: hanya tabel (seluruh halaman bila tabel tidak ada, untuk diagnosis).
 * `frankfurter`: CSV apa adanya + alasan BI gagal.
 */
export type JisdorRaw =
  | { source: 'bi'; table: string; page?: string }
  | { source: 'frankfurter'; csv: string; reason: string };

const STRIPED = /^<table[^>]*table-striped/;

/** Tabel JISDOR halaman BI → baris `usd_idr_jisdor` (urut tanggal). */
export function parseTable(table: string): ParsedRow<MacroRow>[] {
  const rows = tableRows(table);
  if (rows[0]?.join('|') !== 'Tanggal|Kurs') {
    throw new ScrapeError('PARSE_ERROR', `header tabel JISDOR bukan "Tanggal | Kurs": ${rows[0]}`);
  }
  const byDate = new Map<string, number>();
  for (const [tanggal, kurs] of rows.slice(1)) {
    try {
      const date = parseTanggalIndonesia(tanggal ?? '');
      const value = parseRupiah(kurs ?? '');
      if (!(value > 0)) throw new Error(`kurs bukan angka positif: "${kurs}"`);
      if (byDate.has(date)) throw new Error('tanggal ganda');
      byDate.set(date, value);
    } catch (err) {
      throw new ScrapeError(
        'PARSE_ERROR',
        `baris JISDOR "${tanggal} | ${kurs}": ${errorMessageOf(err)}`,
      );
    }
  }
  if (byDate.size === 0) throw new ScrapeError('PARSE_ERROR', 'tabel JISDOR tanpa data');
  return [...byDate.keys()].sort().map((date) => ({
    date,
    series: 'usd_idr_jisdor',
    frequency: 'D',
    value: byDate.get(date)!,
    unit: 'IDR/USD',
    source: 'bi',
  }));
}

export function parse(raw: RawPayload): ParseResult<MacroRow> {
  const body = JSON.parse(raw.body) as JisdorRaw;
  if (body.source === 'frankfurter') {
    const ecb = parseEcbRates({ ...raw, body: body.csv, contentType: 'text/csv' });
    return {
      ...ecb,
      note: `fallback Frankfurter → usd_idr_ecb; BI gagal: ${body.reason}`.slice(0, 500),
    };
  }
  const table = body.table;
  if (!table)
    throw new ScrapeError('PARSE_ERROR', 'tabel JISDOR (table-striped) tidak ada di halaman');
  const rows = parseTable(table);
  return { rows, dataDate: rows.at(-1)!.date, sourceUpdatedAt: null, stale: null };
}

/** Pesan galat jaringan beserta kode penyebabnya (`fetch failed` saja tidak informatif). */
function describe(err: unknown): string {
  const cause = (err as { cause?: { code?: string } } | undefined)?.cause?.code;
  return `${errorMessageOf(err)}${cause ? ` (${cause})` : ''}`;
}

export const jisdor: SourceScraper<MacroRow> = {
  id: 'jisdor',
  kind: 'macro',
  parserVersion: 'jisdor@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const today = ctx.date ?? jakartaDate(ctx.now);
    try {
      const page = await fetchOk(ctx, PAGE_URL);
      const html = page.body.toString('utf8');
      const table = tables(html).find((t) => STRIPED.test(t)) ?? '';
      const raw: JisdorRaw = table ? { source: 'bi', table } : { source: 'bi', table, page: html };
      return { body: JSON.stringify(raw), contentType: 'application/json', fetchedAt };
    } catch (err) {
      const reason = describe(err);
      try {
        const from = addDaysIso(today, -FALLBACK_DAYS);
        const res = await fetchOk(ctx, ratesUrl(from, today), { headers: { Accept: 'text/csv' } });
        const raw: JisdorRaw = { source: 'frankfurter', csv: res.body.toString('utf8'), reason };
        return { body: JSON.stringify(raw), contentType: 'application/json', fetchedAt };
      } catch (fallbackErr) {
        const message = `${reason}; fallback Frankfurter gagal: ${describe(fallbackErr)}`;
        throw new ScrapeError(errorCodeOf(err), message.slice(0, 500));
      }
    }
  },
  parse,
};
