import { jakartaToday, utcIso, type MacroRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { closingRows, HISTORY_URL, parseHistory } from '../sources/xaus';
import { fetchOk } from '../sources/http';
import type { ParseResult, RawPayload } from '../sources/types';
import type { MacroBackfillJob } from './types';

// P2-07 — histori harian xaus.com (TECH-SPEC §5.4, §5.6). Satu request `/api/v1/history`
// memuat ±5 tahun penutupan (D-21: 1.258 titik pada 25 Okt 2026), jadi `fetchOk` + parse murni
// memakai ulang `parseHistory` (V-10) dan `closingRows` milik scraper harian. Beda dengan scrape
// harian: tanpa spot dan tanpa jendela 10 hari — seluruh histori sampai kemarin. Kunci baris
// sama dengan scrape harian (date+series+frequency), jadi tumpang tindih nilai yang sama =
// unchanged dan nilai berbeda = update/revisi; tidak pernah ganda. Baris `M` World Bank berkunci
// frekuensi lain sehingga tidak bertabrakan.

/** Raw job ini: respons histori + tanggal sasaran (parse tidak boleh membaca jam). */
export interface XausBackfillRaw {
  today: string;
  history: string;
}

export function parseXausHistory(raw: RawPayload): ParseResult<MacroRow> {
  const body = JSON.parse(raw.body) as XausBackfillRaw;
  const rows = closingRows(parseHistory(body.history), '0000-01-01', body.today);
  if (rows.length === 0) throw new ScrapeError('PARSE_ERROR', 'histori xaus tanpa penutupan');
  return { rows, dataDate: rows.at(-1)!.date, sourceUpdatedAt: null, stale: null };
}

export const xaus: MacroBackfillJob = {
  id: 'xaus',
  kind: 'macro',
  series: 'xau_usd_oz',
  source: 'xaus',
  scraper: 'xaus',
  parserVersion: 'xaus-backfill@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const res = await fetchOk(ctx, HISTORY_URL, { headers: { Accept: 'application/json' } });
    const raw: XausBackfillRaw = {
      today: jakartaToday(ctx.now),
      history: res.body.toString('utf8'),
    };
    return { body: JSON.stringify(raw), contentType: 'application/json', fetchedAt };
  },
  parse: parseXausHistory,
};
