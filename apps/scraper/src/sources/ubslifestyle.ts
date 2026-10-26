import { parseRupiah, parseWeight, utcIso, type PriceRow } from '@gold/schema';
import { tableRows, tables } from '../html';
import { ScrapeError } from '../pipeline/errors';
import { newestVariant } from '../pipeline/validate';
import { sleep } from '../probe/http';
import { fetchOk } from './http';
import type { ParsedRow, ParseResult, RawPayload, SourceScraper } from './types';

// TECH-SPEC §5.1 — UBS Lifestyle. Halaman: tabel per tahun produksi (D-08). Tanggal data dari
// titik terakhir endpoint grafik bila sama dengan buyback 1 g tahun berjalan (D-19).

export const PAGE_URL = 'https://ubslifestyle.com/harga-buyback-hari-ini/';
export const CHART_URL = 'https://ubslifestyle.com/wp-admin/admin-ajax.php';
export const CHART_PATH = 'ajax/chart_interval/GOLD/7';

/**
 * Isi raw snapshot: hanya fragmen yang dipakai parser (semua `<table>` halaman + respons grafik
 * apa adanya). Bila halaman tidak memuat tabel, seluruh halaman disimpan untuk diagnosis.
 */
export interface UbsRaw {
  tables: string;
  chart: string;
  page?: string;
}

type Row = ParsedRow<PriceRow>;

const cellPrice = (s: string | undefined): number | null => {
  const t = (s ?? '').trim();
  return t === '' || /^-+$/.test(t) ? null : parseRupiah(t);
};

/** Baris harga semua tabel tahun produksi, tanpa tanggal. */
export function parseTables(html: string): Omit<Row, 'date'>[] {
  const blocks = tables(html);
  if (blocks.length === 0) throw new ScrapeError('PARSE_ERROR', 'tidak ada <table> harga');
  const out: Omit<Row, 'date'>[] = [];
  for (const block of blocks) {
    const rows = tableRows(block);
    const variant = rows
      .flat()
      .map((c) => /^Tahun (\d{4})$/.exec(c)?.[1])
      .find(Boolean);
    if (!variant) throw new ScrapeError('PARSE_ERROR', 'tabel tanpa label "Tahun YYYY"');
    const header = rows.find((r) => r.includes('Harga Beli'));
    const sellCol = header?.indexOf('Harga Beli') ?? -1;
    const buybackCol = header?.findIndex((c) => /^Harga Jual\b/.test(c)) ?? -1;
    if (sellCol === -1 || buybackCol === -1) {
      throw new ScrapeError(
        'PARSE_ERROR',
        `tahun ${variant}: header "Harga Beli | Harga Jual" tidak ada`,
      );
    }
    for (const r of rows.filter((x) => /Gram$/i.test(x[0] ?? ''))) {
      try {
        const sell = cellPrice(r[sellCol]);
        const buyback = cellPrice(r[buybackCol]);
        if (sell === null && buyback === null) continue;
        out.push({
          source: 'ubslifestyle',
          brand: 'ubs',
          product: 'gold_bar',
          variant,
          weight_g: parseWeight(r[0]!),
          location: '',
          sell_price: sell,
          buyback_price: buyback,
          source_updated_at: null,
        });
      } catch (err) {
        throw new ScrapeError(
          'PARSE_ERROR',
          `tahun ${variant}, ${r[0]}: ${(err as Error).message}`,
        );
      }
    }
  }
  return out;
}

/** Titik terakhir grafik: tanggal (UTC 00:00 = tanggal harga) dan nilai `a` (buyback 1 g). */
export function lastChartPoint(chart: string): { date: string; buyback: number } {
  let series: unknown;
  try {
    series = JSON.parse(chart);
  } catch {
    throw new ScrapeError('PARSE_ERROR', `grafik bukan JSON: ${chart.slice(0, 80)}`);
  }
  const last = (series as { data?: unknown[] }[] | null)?.[0]?.data?.at(-1);
  if (!Array.isArray(last) || typeof last[0] !== 'number' || typeof last[1] !== 'number') {
    throw new ScrapeError('PARSE_ERROR', 'grafik tanpa titik [ts, a, …]');
  }
  return { date: new Date(last[0]).toISOString().slice(0, 10), buyback: last[1] };
}

export function parse(raw: RawPayload): ParseResult<PriceRow> {
  const body = JSON.parse(raw.body) as UbsRaw;
  const rows = parseTables(body.tables);
  const point = lastChartPoint(body.chart);
  const variant = newestVariant(rows);
  const oneGram = rows.find((r) => r.variant === variant && r.weight_g === 1)?.buyback_price;
  const stale =
    oneGram === point.buyback
      ? null
      : `titik terakhir grafik ${point.date} (${point.buyback}) ≠ buyback 1 g tahun ${variant} (${oneGram ?? '-'})`;
  return {
    rows: rows.map((r) => ({ date: point.date, ...r })),
    dataDate: point.date,
    sourceUpdatedAt: null, // blok "Updated" tidak dapat dipercaya (D-19)
    stale,
  };
}

export const ubslifestyle: SourceScraper<PriceRow> = {
  id: 'ubslifestyle',
  kind: 'prices',
  parserVersion: 'ubslifestyle@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const page = await fetchOk(ctx, PAGE_URL);
    await sleep(ctx.pauseMs ?? 5_000);
    const chart = await fetchOk(ctx, CHART_URL, {
      method: 'POST',
      body: new URLSearchParams({ action: 'get_harga_emas_hari_ini', path: CHART_PATH }),
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    const html = page.body.toString('utf8');
    const found = tables(html);
    const raw: UbsRaw = { tables: found.join('\n'), chart: chart.body.toString('utf8') };
    if (found.length === 0) raw.page = html;
    return { body: JSON.stringify(raw), contentType: 'application/json', fetchedAt };
  },
  parse,
};
