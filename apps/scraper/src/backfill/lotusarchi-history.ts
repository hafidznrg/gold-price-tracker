import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { isIsoDate, utcIso, type PriceRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import type { PriceBackfillJob } from './types';

// Histori Lotus Archi resmi (lotusarchi.com) dari respons penuh `wp-json/la/v1/harga-gold`
// (sejak 27 Feb 2025). Job lokal: `--input` = file `harga-gold.json` atau folder berisinya.
// Asumsi (plan/research/lotusarchi.md §6): `harga_emas` = harga jual keping 1 g (cocok dengan
// "1 gr" di `harga-display` pada 17 Nov 2026), `buyback_emas` = buyback per gram. Satu baris 1 g
// per tanggal; tanggal ganda adalah revisi → `harga_id` terbesar menang.

type Row = ParsedRow<PriceRow>;

interface GoldRow {
  harga_id: number;
  harga_emas: number;
  buyback_emas: number;
  tanggal: string;
}

const FILE = 'harga-gold.json';

/** Bentuk dasar baris; harga yang tidak masuk akal ditangani terpisah (dibuang + dicatat). */
function isShape(r: Partial<GoldRow> | null | undefined): r is GoldRow {
  return (
    !!r &&
    Number.isSafeInteger(r.harga_id) &&
    typeof r.harga_emas === 'number' &&
    typeof r.buyback_emas === 'number' &&
    typeof r.tanggal === 'string' &&
    isIsoDate(r.tanggal)
  );
}

const plausible = (r: GoldRow) =>
  Number.isSafeInteger(r.harga_emas) &&
  Number.isSafeInteger(r.buyback_emas) &&
  r.harga_emas > 0 &&
  r.buyback_emas > 0 &&
  r.buyback_emas < r.harga_emas;

export function parseHistory(raw: RawPayload): ParseResult<PriceRow> {
  let data: unknown;
  try {
    data = (JSON.parse(raw.body) as { data?: unknown }).data;
  } catch {
    throw new ScrapeError('PARSE_ERROR', 'raw histori bukan JSON');
  }
  if (!Array.isArray(data)) throw new ScrapeError('PARSE_ERROR', 'raw histori: data bukan array');

  let malformed = 0;
  const best = new Map<string, GoldRow>();
  for (const r of data as Partial<GoldRow>[]) {
    if (!isShape(r)) {
      malformed++;
      continue;
    }
    const cur = best.get(r.tanggal);
    if (!cur || r.harga_id > cur.harga_id) best.set(r.tanggal, r);
  }

  // Revisi dipilih dulu (harga_id terbesar), baru divalidasi: revisi terakhir yang rusak
  // menggugurkan tanggalnya, tidak jatuh kembali ke revisi lama.
  let implausible = 0;
  const rows: Row[] = [];
  for (const g of best.values()) {
    if (!plausible(g)) {
      implausible++;
      continue;
    }
    rows.push({
      date: g.tanggal,
      source: 'lotusarchi',
      brand: 'lotusarchi',
      product: 'gold_bar',
      variant: '',
      weight_g: 1,
      location: '',
      sell_price: g.harga_emas,
      buyback_price: g.buyback_emas,
      source_updated_at: null,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const dropped = malformed + implausible;
  return {
    rows,
    dataDate: rows.at(-1)?.date ?? null,
    sourceUpdatedAt: null,
    stale: null,
    note: `${data.length} entri, ${best.size} tanggal unik, ${dropped} tanggal/baris dibuang (${malformed} bentuk tidak valid, ${implausible} harga tidak masuk akal), ${rows.length} baris 1 g${rows.length ? ` ${rows[0]!.date}…${rows.at(-1)!.date}` : ''}`,
  };
}

/** Buang tanggal yang sudah punya baris lotusarchi × lotusarchi 1 g (asal apa pun), pola D-28. */
export function selectUncovered(
  rows: ParsedRow<PriceRow>[],
  existing: readonly PriceRow[],
): ParsedRow<PriceRow>[] {
  const covered = new Set(
    existing
      .filter((r) => r.source === 'lotusarchi' && r.brand === 'lotusarchi' && r.weight_g === 1)
      .map((r) => r.date),
  );
  return rows.filter((r) => !covered.has(r.date));
}

export const lotusarchiHistory: PriceBackfillJob = {
  id: 'lotusarchi-history',
  source: 'lotusarchi',
  parserVersion: 'lotusarchi-history@1.0.0',
  localOnly: true,
  async fetchRaw(ctx) {
    if (!ctx.input) {
      throw new ScrapeError('FETCH_HTTP', `--input wajib: file ${FILE} atau folder berisinya`);
    }
    let file = ctx.input;
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, FILE);
    } catch (err) {
      throw new ScrapeError('FETCH_HTTP', `${file}: ${(err as Error).message}`);
    }
    let body: string;
    try {
      body = await readFile(file, 'utf8');
      JSON.parse(body);
    } catch (err) {
      throw new ScrapeError('PARSE_ERROR', `${file}: ${(err as Error).message}`);
    }
    return { body, contentType: 'application/json', fetchedAt: utcIso() };
  },
  parse: parseHistory,
  select: selectUncovered,
};
