import { utcIso, type MacroRow } from '@gold/schema';
import * as XLSX from 'xlsx';
import { ScrapeError } from '../pipeline/errors';
import { findPinkSheetUrl } from '../probe/checks';
import { sleep } from '../probe/http';
import { fetchOk } from '../sources/http';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import type { MacroBackfillJob } from './types';

// P2-06 — rata-rata bulanan emas World Bank (Pink Sheet, TECH-SPEC §5.6). Tautan XLSX berganti
// hash setiap rilis, jadi halaman commodity-markets dibaca lebih dulu. Sheet `Monthly Prices`:
// baris nama komoditas (kolom `Gold`), baris satuan `($/troy oz)` tepat di bawahnya, lalu data
// berlabel `YYYYMmm`. Kolom dicari lewat nama, bukan posisi (tata letak bisa berubah antar rilis).
// Raw XLSX dibawa sebagai base64 di `RawPayload.body` (`application/octet-stream`).

export const PAGE_URL = 'https://www.worldbank.org/en/research/commodity-markets';
export const SHEET = 'Monthly Prices';
export const HISTORY_START = '1996-01-01';
const UNIT = '($/troy oz)';
const PERIOD = /^(\d{4})M(0[1-9]|1[0-2])$/;

export function parsePinkSheet(raw: RawPayload): ParseResult<MacroRow> {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(raw.body, 'base64'));
  } catch (err) {
    throw new ScrapeError('PARSE_ERROR', `XLSX Pink Sheet tidak terbaca: ${String(err)}`);
  }
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new ScrapeError('PARSE_ERROR', `sheet "${SHEET}" tidak ada`);
  const cells = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  const header = cells.findIndex((r) =>
    r.some((c) => typeof c === 'string' && c.trim() === 'Gold'),
  );
  if (header === -1) throw new ScrapeError('PARSE_ERROR', 'kolom "Gold" tidak ada');
  const col = cells[header]!.findIndex((c) => typeof c === 'string' && c.trim() === 'Gold');
  const unit = cells[header + 1]?.[col];
  if (unit !== UNIT) {
    throw new ScrapeError('PARSE_ERROR', `satuan kolom Gold bukan ${UNIT}: ${String(unit)}`);
  }

  const rows: ParsedRow<MacroRow>[] = [];
  for (const r of cells.slice(header + 2)) {
    const m = typeof r[0] === 'string' ? PERIOD.exec(r[0].trim()) : null;
    if (!m) continue;
    const date = `${m[1]}-${m[2]}-01`;
    if (date < HISTORY_START) continue;
    const value = r[col];
    // Emas punya nilai di setiap bulan sejak 1960; sel kosong atau "…" berarti format berubah.
    if (typeof value !== 'number' || !(value > 0)) {
      throw new ScrapeError(
        'PARSE_ERROR',
        `${r[0]}: nilai Gold bukan angka positif: ${String(value)}`,
      );
    }
    rows.push({
      date,
      series: 'xau_usd_oz',
      frequency: 'M',
      value,
      unit: 'USD/ozt',
      source: 'worldbank',
    });
  }
  if (rows.length === 0)
    throw new ScrapeError('PARSE_ERROR', `tidak ada bulan sejak ${HISTORY_START}`);

  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.date === rows[i - 1]!.date) {
      throw new ScrapeError('PARSE_ERROR', `periode ganda: ${rows[i]!.date.slice(0, 7)}`);
    }
  }
  return { rows, dataDate: rows.at(-1)!.date, sourceUpdatedAt: null, stale: null };
}

export const worldbank: MacroBackfillJob = {
  id: 'worldbank',
  kind: 'macro',
  series: 'xau_usd_oz',
  source: 'worldbank',
  parserVersion: 'worldbank@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const page = await fetchOk(ctx, PAGE_URL);
    const url = findPinkSheetUrl(page.body.toString('utf8'));
    if (!url) {
      throw new ScrapeError(
        'PARSE_ERROR',
        `tautan CMO-Historical-Data-Monthly.xlsx tidak ada di ${PAGE_URL}`,
      );
    }
    await sleep(ctx.pauseMs ?? 5_000);
    const xlsx = await fetchOk(ctx, url);
    return {
      body: xlsx.body.toString('base64'),
      contentType: 'application/octet-stream',
      fetchedAt,
    };
  },
  parse: parsePinkSheet,
};
