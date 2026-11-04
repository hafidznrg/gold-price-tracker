import { isIsoDate, jakartaToday, utcIso, type MacroRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { fetchOk } from '../sources/http';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import type { MacroBackfillJob } from './types';

// P2-08 — kurs acuan ECB lewat Frankfurter (TECH-SPEC §5.6). Satu request `v2/rates.csv`
// memuat seluruh histori sejak 4 Jan 1999 dalam format long `date,base,quote,rate` dengan base
// EUR; `usd_idr_ecb` = EUR/IDR ÷ EUR/USD pada tanggal yang sama, dibulatkan 2 desimal (D-32).

export const HISTORY_START = '1999-01-04';
const HEADER = 'date,base,quote,rate';

export function ratesUrl(from: string, to: string): string {
  return `https://api.frankfurter.dev/v2/rates.csv?base=EUR&quotes=IDR,USD&from=${from}&to=${to}&providers=ecb`;
}

export function parseEcbRates(raw: RawPayload): ParseResult<MacroRow> {
  // trim() juga membuang BOM di awal respons.
  const lines = raw.body.trim().split(/\r?\n/);
  if (lines[0]?.trim() !== HEADER) {
    throw new ScrapeError('PARSE_ERROR', `header Frankfurter bukan "${HEADER}": ${lines[0]}`);
  }

  const byDate = new Map<string, { IDR?: number; USD?: number }>();
  for (const [i, line] of lines.slice(1).entries()) {
    const [date, base, quote, rate] = line.split(',');
    const value = Number(rate);
    if (!date || !isIsoDate(date) || base !== 'EUR' || !(value > 0)) {
      throw new ScrapeError('PARSE_ERROR', `baris Frankfurter ${i + 2} tidak valid: ${line}`);
    }
    if (quote !== 'IDR' && quote !== 'USD') continue;
    const entry = byDate.get(date) ?? {};
    if (entry[quote] !== undefined) {
      throw new ScrapeError('PARSE_ERROR', `kuotasi ${quote} ganda pada ${date}`);
    }
    entry[quote] = value;
    byDate.set(date, entry);
  }
  if (byDate.size === 0) throw new ScrapeError('PARSE_ERROR', 'respons Frankfurter tanpa data');

  const rows: ParsedRow<MacroRow>[] = [...byDate.keys()].sort().map((date) => {
    const { IDR, USD } = byDate.get(date)!;
    // Riset P0-10: tidak ada tanggal yang kehilangan salah satu kuotasi; bila terjadi, sumber
    // berubah dan run digagalkan alih-alih menulis seri berlubang diam-diam.
    if (IDR === undefined || USD === undefined) {
      throw new ScrapeError('PARSE_ERROR', `${date}: kuotasi ${IDR ? 'USD' : 'IDR'} tidak ada`);
    }
    return {
      date,
      series: 'usd_idr_ecb',
      frequency: 'D',
      value: Math.round((IDR / USD) * 100) / 100,
      unit: 'IDR/USD',
      source: 'ecb',
    };
  });
  return { rows, dataDate: rows.at(-1)!.date, sourceUpdatedAt: null, stale: null };
}

export const ecb: MacroBackfillJob = {
  id: 'ecb',
  kind: 'macro',
  series: 'usd_idr_ecb',
  source: 'ecb',
  scraper: 'jisdor',
  parserVersion: 'ecb@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const from = ctx.from && ctx.from > HISTORY_START ? ctx.from : HISTORY_START;
    const to = ctx.to ?? jakartaToday(ctx.now);
    const res = await fetchOk(ctx, ratesUrl(from, to), { headers: { Accept: 'text/csv' } });
    return { body: res.body.toString('utf8'), contentType: 'text/csv', fetchedAt };
  },
  parse: parseEcbRates,
};
