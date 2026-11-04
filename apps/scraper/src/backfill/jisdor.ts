import { isIsoDate, jakartaToday, utcIso, type MacroRow } from '@gold/schema';
import * as XLSX from 'xlsx';
import { ScrapeError } from '../pipeline/errors';
import { cookieHeader, sleep } from '../probe/http';
import { fieldBySuffix, hiddenFields } from '../probe/targets';
import { fetchOk } from '../sources/http';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import type { MacroBackfillJob } from './types';

// P2-09 — histori JISDOR lewat ekspor XLSX halaman BI (TECH-SPEC §5.5, D-21): `GET` halaman
// (hidden field + cookie sesi), lalu postback `…$ButtonExport` dengan rentang `dd/mm/yyyy`.
// XLSX satu sheet: judul, header `NO | Tanggal | Kurs`, lalu data berupa teks — tanggal format
// AS `M/D/YYYY 12:00:00 AM`, kurs format Indonesia `9.760,00`. Raw dibawa sebagai base64.

export const PAGE_URL = 'https://www.bi.go.id/id/statistik/informasi-kurs/jisdor/default.aspx';
export const HISTORY_START = '2013-05-20';

const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: 12:00:00 AM)?$/;
const KURS = /^\d{1,3}(?:\.\d{3})*(?:,\d+)?$/;

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** `5/20/2013 12:00:00 AM` → `2013-05-20`; null bila bukan format itu. */
export function parseUsDate(cell: string): string | null {
  const m = US_DATE.exec(cell.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** `18.069,00` → `18069`; `9.760,5` → `9760.5`; null bila bukan format Indonesia. */
export function parseKurs(cell: string): number | null {
  const s = cell.trim().replace(/^Rp\s*/, '');
  if (!KURS.test(s)) return null;
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

export function parseJisdorExport(raw: RawPayload): ParseResult<MacroRow> {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(raw.body, 'base64'));
  } catch (err) {
    throw new ScrapeError('PARSE_ERROR', `XLSX JISDOR tidak terbaca: ${String(err)}`);
  }
  const ws = wb.Sheets[wb.SheetNames[0] ?? ''];
  if (!ws) throw new ScrapeError('PARSE_ERROR', 'XLSX JISDOR tanpa sheet');
  const cells = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  const header = cells.findIndex((r) => r[1] === 'Tanggal' && r[2] === 'Kurs');
  if (header === -1) throw new ScrapeError('PARSE_ERROR', 'header "NO | Tanggal | Kurs" tidak ada');

  const byDate = new Map<string, number>();
  for (const r of cells.slice(header + 1)) {
    if (r.every((c) => c === null || c === '')) continue;
    const [, tanggal, kurs] = r;
    const date = typeof tanggal === 'string' ? parseUsDate(tanggal) : null;
    const value = typeof kurs === 'string' ? parseKurs(kurs) : null;
    if (!date || !(value! > 0)) {
      throw new ScrapeError('PARSE_ERROR', `baris JISDOR tidak valid: ${JSON.stringify(r)}`);
    }
    if (byDate.has(date)) throw new ScrapeError('PARSE_ERROR', `tanggal JISDOR ganda: ${date}`);
    byDate.set(date, value!);
  }
  if (byDate.size === 0) throw new ScrapeError('PARSE_ERROR', 'ekspor JISDOR tanpa data');

  const rows: ParsedRow<MacroRow>[] = [...byDate.keys()].sort().map((date) => ({
    date,
    series: 'usd_idr_jisdor',
    frequency: 'D',
    value: byDate.get(date)!,
    unit: 'IDR/USD',
    source: 'bi',
  }));
  return { rows, dataDate: rows.at(-1)!.date, sourceUpdatedAt: null, stale: null };
}

export const jisdor: MacroBackfillJob = {
  id: 'jisdor',
  kind: 'macro',
  series: 'usd_idr_jisdor',
  source: 'bi',
  scraper: 'jisdor',
  parserVersion: 'jisdor@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const page = await fetchOk(ctx, PAGE_URL);
    const html = page.body.toString('utf8');
    const target = fieldBySuffix(html, 'ButtonExport');
    if (!target)
      throw new ScrapeError('PARSE_ERROR', 'form ekspor JISDOR (ButtonExport) tidak ada');

    const from = ddmmyyyy(ctx.from && ctx.from > HISTORY_START ? ctx.from : HISTORY_START);
    const to = ddmmyyyy(ctx.to ?? jakartaToday(ctx.now));
    const form = new URLSearchParams([...hiddenFields(html)]);
    form.set('__EVENTTARGET', target);
    form.set('__EVENTARGUMENT', '');
    for (const [suffix, value] of [
      ['TextBoxFrom', from],
      ['TextBoxDateTo', to],
      ['HiddenFieldDateFrom', from],
      ['HiddenFieldDateTo', to],
    ] as const) {
      const name = fieldBySuffix(html, suffix);
      if (!name) throw new ScrapeError('PARSE_ERROR', `field ekspor …$${suffix} tidak ada`);
      form.set(name, value);
    }

    await sleep(ctx.pauseMs ?? 5_000);
    const res = await fetchOk(ctx, PAGE_URL, {
      method: 'POST',
      body: form,
      headers: { Cookie: cookieHeader(page.setCookies), Referer: PAGE_URL },
    });
    // Postback yang gagal mengembalikan halaman HTML biasa dengan status 200.
    if (!/sheet|excel|octet/.test(res.contentType)) {
      throw new ScrapeError('PARSE_ERROR', `ekspor JISDOR bukan XLSX (${res.contentType})`);
    }
    return {
      body: res.body.toString('base64'),
      contentType: 'application/octet-stream',
      fetchedAt,
    };
  },
  parse: parseJisdorExport,
};
