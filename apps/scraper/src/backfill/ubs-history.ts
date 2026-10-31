import { utcIso, type PriceRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { fetchOk } from '../sources/http';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import { CHART_URL } from '../sources/ubslifestyle';
import type { BackfillJob } from './types';

// P1-09 (FR-08, D-28) — histori buyback 1 g UBS dari endpoint grafik (TECH-SPEC §5.1):
// `chart_interval/GOLD/{hari}` mengembalikan seluruh histori (±20 Nov 2023 → kini) berapa pun
// `{hari}`. Titik `[ts_ms, a, a, a, b]`: `ts` = 00:00 UTC tanggal harga, `a` = buyback 1 g.
// Tahun produksi tidak tercantum → `variant = ''`; harga beli tidak ada → `sell_price = null`.

export const HISTORY_PATH = 'ajax/chart_interval/GOLD/1095';

type Row = ParsedRow<PriceRow>;

export function parseHistory(raw: RawPayload): ParseResult<PriceRow> {
  let series: unknown;
  try {
    series = JSON.parse(raw.body);
  } catch {
    throw new ScrapeError('PARSE_ERROR', `grafik bukan JSON: ${raw.body.slice(0, 80)}`);
  }
  const data = (series as { name?: string; data?: unknown[] }[] | null)?.find(
    (s) => s.name === 'GOLD',
  )?.data;
  if (!Array.isArray(data)) throw new ScrapeError('PARSE_ERROR', 'grafik tanpa seri GOLD');

  const byDate = new Map<string, Row>();
  for (const point of data) {
    if (
      !Array.isArray(point) ||
      typeof point[0] !== 'number' ||
      !Number.isInteger(point[1]) ||
      (point[1] as number) <= 0
    ) {
      throw new ScrapeError('PARSE_ERROR', `titik grafik tidak valid: ${JSON.stringify(point)}`);
    }
    const date = new Date(point[0]).toISOString().slice(0, 10);
    // Titik terakhir per tanggal menang, sama seperti merge harian.
    byDate.set(date, {
      date,
      source: 'ubslifestyle',
      brand: 'ubs',
      product: 'gold_bar',
      variant: '',
      weight_g: 1,
      location: '',
      sell_price: null,
      buyback_price: point[1] as number,
      source_updated_at: null,
    });
  }
  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    rows,
    dataDate: rows.at(-1)?.date ?? null,
    sourceUpdatedAt: null,
    stale: null,
  };
}

/** Buang tanggal yang sudah punya baris 1 g hasil scrape harian (tahun produksi apa pun). */
export function selectUncovered(rows: Row[], existing: readonly PriceRow[]): Row[] {
  const scraped = new Set(
    existing.filter((r) => r.origin === 'scrape' && r.weight_g === 1).map((r) => r.date),
  );
  return rows.filter((r) => !scraped.has(r.date));
}

export const ubsHistory: BackfillJob = {
  id: 'ubs-history',
  source: 'ubslifestyle',
  parserVersion: 'ubs-history@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const res = await fetchOk(ctx, CHART_URL, {
      method: 'POST',
      body: new URLSearchParams({ action: 'get_harga_emas_hari_ini', path: HISTORY_PATH }),
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    return { body: res.body.toString('utf8'), contentType: 'application/json', fetchedAt };
  },
  parse: parseHistory,
  select: selectUncovered,
};
