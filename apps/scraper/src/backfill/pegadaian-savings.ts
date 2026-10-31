import { utcIso, type PriceRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { fetchOk } from '../sources/http';
import { readData, savingsRow } from '../sources/pegadaian';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import type { BackfillJob } from './types';

// D-30 — histori Tabungan Emas Pegadaian dari `GET /gold/prices/chart`. Respons memuat
// `allGrafik[]` per `tipe` (`jual`, `beli`) × `timeInterval` (7/30/90/180/360 hari); dipakai
// interval terpanjang. `priceList[]`: `{ id (epoch ms entri harga), harga, unit, lastUpdate }`,
// `lastUpdate` = `YYYY-MM-DD 00:00:00` tanggal harga. `jual` → sell_price, `beli` → buyback.

export const CHART_URL = 'https://pegadaian.co.id/gold/prices/chart';

interface PricePoint {
  id: string;
  harga: string;
  unit: string;
  lastUpdate: string;
}

interface Grafik {
  tipe: string;
  timeInterval: number;
  jsonFluktuasi?: { priceList?: PricePoint[] };
}

function longest(grafik: Grafik[], tipe: 'jual' | 'beli'): PricePoint[] {
  const best = grafik
    .filter((g) => g.tipe === tipe && Array.isArray(g.jsonFluktuasi?.priceList))
    .sort((a, b) => b.timeInterval - a.timeInterval)[0];
  if (!best) throw new ScrapeError('PARSE_ERROR', `grafik tabungan tanpa tipe ${tipe}`);
  return best.jsonFluktuasi!.priceList!;
}

const byDate = (points: PricePoint[]) =>
  new Map(points.map((p) => [String(p.lastUpdate).slice(0, 10), p] as const));

export function parseSavingsChart(raw: RawPayload): ParseResult<PriceRow> {
  const data = readData(raw.body, 'grafik tabungan') as { allGrafik?: unknown } | null;
  if (!Array.isArray(data?.allGrafik)) {
    throw new ScrapeError('PARSE_ERROR', 'grafik tabungan tanpa allGrafik');
  }
  const sell = byDate(longest(data.allGrafik as Grafik[], 'jual'));
  const buyback = byDate(longest(data.allGrafik as Grafik[], 'beli'));
  const dates = [...new Set([...sell.keys(), ...buyback.keys()])].sort();
  const rows: ParsedRow<PriceRow>[] = dates.map((date) => {
    const s = sell.get(date);
    const b = buyback.get(date);
    return savingsRow(date, s?.harga ?? null, b?.harga ?? null, (s ?? b)!.unit, (s ?? b)!.id);
  });
  return { rows, dataDate: dates.at(-1) ?? null, sourceUpdatedAt: null, stale: null };
}

export const pegadaianSavings: BackfillJob = {
  id: 'pegadaian-savings',
  source: 'pegadaian',
  parserVersion: 'pegadaian-savings@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const res = await fetchOk(ctx, CHART_URL, { headers: { Accept: 'application/json' } });
    return { body: res.body.toString('utf8'), contentType: 'application/json', fetchedAt };
  },
  parse: parseSavingsChart,
};
