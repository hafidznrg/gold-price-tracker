import { isIsoDate, parseWeight, utcIso, type PriceRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { sleep } from '../probe/http';
import { fetchOk } from './http';
import type { ParsedRow, ParseResult, RawPayload, SourceScraper } from './types';

// Fase 6 (P6-09) — Lotus Archi resmi lewat dua endpoint JSON yang dipakai halaman /pricing/
// (D-65). Tabel HTML statis di /pricing/ tersembunyi dan basi, jadi tidak dipakai.
//   - `harga-display`: harga jual per keping hari ini, tanpa tanggal.
//   - `harga-gold`: harga dasar + buyback per gram per `tanggal` (histori sejak Feb 2025).
// Buyback hanya per gram → disimpan di baris 1 g saja (pola Logam Mulia, D-26). Tanpa jam terbit.
// Dua request per run (penyimpangan dari NFR-12, disetujui pemilik; D-65). Riset: research/lotusarchi.md.

export const DISPLAY_URL = 'https://api.lotusarchi.com/harga-display';
export const GOLD_URL = 'https://lotusarchi.com/wp-json/la/v1/harga-gold';

/** Jumlah baris `harga-gold` terbaru yang disimpan di raw. */
export const RAW_GOLD_ROWS = 10;

export interface DisplayItem {
  id?: number;
  produk: string;
  type: string;
  harga: number;
}
export interface GoldRow {
  harga_id: number;
  harga_emas: number;
  buyback_emas: number;
  tanggal: string;
}
/** Isi raw: respons `harga-display` utuh + `harga-gold` terpangkas ke baris terbaru. */
export interface LotusArchiRaw {
  display: { data: DisplayItem[] };
  gold: { data: GoldRow[] };
}

const parseError = (message: string) => new ScrapeError('PARSE_ERROR', message);

const isMoney = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

/** `harga-gold` terbaru dulu: tanggal menurun, lalu `harga_id` menurun. */
const newestFirst = (a: GoldRow, b: GoldRow) =>
  a.tanggal === b.tanggal ? b.harga_id - a.harga_id : a.tanggal < b.tanggal ? 1 : -1;

/**
 * Satu baris per `tanggal` (tanggal ganda = revisi: `harga_id` terbesar menang), terbaru dulu.
 * Setiap baris divalidasi ketat; bentuk tak dikenal → PARSE_ERROR.
 */
export function latestPerDate(gold: unknown): GoldRow[] {
  const data = (gold as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length === 0) throw parseError('harga-gold: data kosong');
  const best = new Map<string, GoldRow>();
  for (const r of data as Partial<GoldRow>[]) {
    if (
      !Number.isSafeInteger(r?.harga_id) ||
      !isMoney(r?.harga_emas) ||
      !isMoney(r?.buyback_emas) ||
      typeof r?.tanggal !== 'string' ||
      !isIsoDate(r.tanggal)
    ) {
      throw parseError(`harga-gold: baris tidak valid ${JSON.stringify(r)}`);
    }
    const row = r as GoldRow;
    const cur = best.get(row.tanggal);
    if (!cur || row.harga_id > cur.harga_id) best.set(row.tanggal, row);
  }
  return [...best.values()].sort(newestFirst);
}

/** Gramasi emas batangan: `0,1 gr` … `100 gr`. `WB`, Paper Gold, dan perak dilewati. */
export function displayRows(display: unknown): { weight_g: number; sell_price: number }[] {
  const data = (display as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw parseError('harga-display: tanpa data');
  const out: { weight_g: number; sell_price: number }[] = [];
  for (const item of data as Partial<DisplayItem>[]) {
    if (item?.type !== 'gold' || typeof item.produk !== 'string') continue;
    if (!/^\d+(,\d+)? gr$/.test(item.produk)) continue;
    if (!isMoney(item.harga)) throw parseError(`harga-display ${item.produk}: harga tidak valid`);
    out.push({ weight_g: parseWeight(item.produk), sell_price: item.harga });
  }
  return out;
}

/**
 * Aturan sinkronisasi dua endpoint: `harga-display` tidak bertanggal, jadi tanggalnya dicari dari
 * `harga-gold`. Harga "1 gr" di display harus sama dengan `harga_emas` tanggal terbaru.
 *   - sama → tanggal terbaru;
 *   - sama dengan tanggal yang lebih lama → display belum diperbarui: pakai tanggal itu dan tandai
 *     `stale` (hari baru sudah masuk di harga-gold, display belum);
 *   - tidak cocok dengan tanggal mana pun → PARSE_ERROR (kedua endpoint tidak sinkron).
 */
export function matchDate(
  oneGram: number,
  gold: readonly GoldRow[],
): { row: GoldRow; stale: string | null } {
  const newest = gold[0]!;
  if (newest.harga_emas === oneGram) return { row: newest, stale: null };
  const older = gold.slice(1).find((g) => g.harga_emas === oneGram);
  if (older) {
    return {
      row: older,
      stale: `harga-display (1 gr ${oneGram}) masih harga ${older.tanggal}; harga-gold sudah ${newest.tanggal}`,
    };
  }
  throw parseError(
    `harga-display 1 gr ${oneGram} tidak cocok dengan harga_emas tanggal mana pun di harga-gold (terbaru ${newest.tanggal}: ${newest.harga_emas})`,
  );
}

export function parse(raw: RawPayload): ParseResult<PriceRow> {
  let body: LotusArchiRaw;
  try {
    body = JSON.parse(raw.body) as LotusArchiRaw;
  } catch {
    throw parseError(`raw bukan JSON: ${raw.body.slice(0, 80)}`);
  }
  const weights = displayRows(body?.display);
  const oneGram = weights.find((w) => w.weight_g === 1);
  if (!oneGram) throw parseError('harga-display tanpa baris "1 gr"');
  const { row: day, stale } = matchDate(oneGram.sell_price, latestPerDate(body.gold));
  const rows: ParsedRow<PriceRow>[] = weights.map((w) => ({
    date: day.tanggal,
    source: 'lotusarchi',
    brand: 'lotusarchi',
    product: 'gold_bar',
    variant: '',
    weight_g: w.weight_g,
    location: '',
    sell_price: w.sell_price,
    // Buyback per gram hanya berlaku untuk 1 g; gramasi lain tidak dikalikan (D-26, D-65).
    buyback_price: w.weight_g === 1 ? day.buyback_emas : null,
    source_updated_at: null,
  }));
  return { rows, dataDate: day.tanggal, sourceUpdatedAt: null, stale };
}

/** Tantangan Cloudflare yang disajikan dengan HTTP 200. */
export const isChallenge = (body: string): boolean =>
  /Just a moment|cf-chl|challenge-platform\/h\//i.test(body.slice(0, 20_000));

function json(body: string, url: string): unknown {
  if (isChallenge(body)) {
    throw new ScrapeError('BLOCKED', `halaman tantangan Cloudflare (HTTP 200) dari ${url}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw parseError(`${url}: bukan JSON: ${body.slice(0, 80)}`);
  }
}

export const lotusarchi: SourceScraper<PriceRow> = {
  id: 'lotusarchi',
  kind: 'prices',
  parserVersion: 'lotusarchi@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const display = await fetchOk(ctx, DISPLAY_URL);
    await sleep(ctx.pauseMs ?? 5_000);
    const gold = await fetchOk(ctx, GOLD_URL);
    const g = json(gold.body.toString('utf8'), GOLD_URL) as { data?: GoldRow[] };
    const trimmed = Array.isArray(g?.data)
      ? [...g.data].sort(newestFirst).slice(0, RAW_GOLD_ROWS)
      : g?.data;
    const raw = {
      display: json(display.body.toString('utf8'), DISPLAY_URL),
      gold: { ...g, data: trimmed },
    };
    return { body: JSON.stringify(raw), contentType: 'application/json', fetchedAt };
  },
  parse,
};
