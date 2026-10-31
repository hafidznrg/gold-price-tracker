import {
  canonicalWeight,
  isIsoDate,
  jakartaIso,
  utcIso,
  type Brand,
  type PriceRow,
} from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { sleep } from '../probe/http';
import { fetchOk } from './http';
import type { ParsedRow, ParseResult, RawPayload, SourceScraper } from './types';

// TECH-SPEC §5.2 — Pegadaian lewat `GET /gold/prices/table` (D-20). Brand dari `idVendor`;
// vendor lain diabaikan; `hargaJual = 0` = gramasi tidak dijual. Buyback emas batangan tidak
// tersedia (Q-1, D-07): `hargaBeli` hanya dipakai bila suatu saat berisi angka.
// Tabungan Emas (D-30) dari `GET /gold/prices`: satu baris per 0,01 g dengan jual + buyback,
// bertanggal `tglBerlaku`-nya sendiri.

export const TABLE_URL = 'https://pegadaian.co.id/gold/prices/table';
export const SAVINGS_URL = 'https://pegadaian.co.id/gold/prices';

/**
 * Isi raw sejak `pegadaian@1.1.0`: respons kedua endpoint apa adanya. Raw lama (sebelum D-30)
 * berisi respons tabel saja; parser tetap menerimanya (tanpa baris Tabungan Emas).
 */
export interface PegadaianRaw {
  table: string;
  savings: string;
}
export const RESPONSE_OK = '2000000100';

/** `idVendor` → brand proyek. Kode lebih stabil daripada nama (`"GALERI 24"` vs `"Galeri 24"`). */
export const VENDOR_BRAND: Record<string, Brand> = {
  '00005201808001': 'antam',
  '00005201808002': 'ubs',
  '00005202003010': 'galeri24',
};

interface Detail {
  berat: number;
  hargaJual: number;
  hargaBeli: number | null;
}

interface VendorPrices {
  idHarga: number;
  tglBerlaku: string;
  idVendor: string;
  namaVendor: string;
  hargaMuliaDetails: Detail[];
}

const parseError = (message: string) => new ScrapeError('PARSE_ERROR', message);

/** Respons `{ responseCode, data }` Pegadaian; `data` dikembalikan apa adanya. */
export function readData(body: string, label: string): unknown {
  let json: { responseCode?: unknown; responseDesc?: unknown; data?: unknown };
  try {
    json = JSON.parse(body);
  } catch {
    throw parseError(`${label}: respons bukan JSON: ${body.slice(0, 80)}`);
  }
  if (json.responseCode !== RESPONSE_OK) {
    throw parseError(
      `${label}: responseCode ${String(json.responseCode)} (${String(json.responseDesc)})`,
    );
  }
  return json.data;
}

function readBody(body: string): VendorPrices[] {
  const data = readData(body, 'tabel');
  if (!Array.isArray(data)) throw parseError('field data bukan array');
  return data as VendorPrices[];
}

/** Satuan Tabungan Emas yang diharapkan; satuan lain = PARSE_ERROR (jangan menebak skala). */
export const SAVINGS_UNIT = 0.01;

/** Baris Tabungan Emas (D-30): brand `pegadaian`, produk `gold_savings`, per 0,01 g. */
export function savingsRow(
  date: unknown,
  sell: unknown,
  buyback: unknown,
  unit: unknown,
  createdAt: unknown,
): ParsedRow<PriceRow> {
  if (typeof date !== 'string' || !isIsoDate(date)) {
    throw parseError(`tabungan: tanggal tidak valid ${JSON.stringify(date)}`);
  }
  if (Number(unit) !== SAVINGS_UNIT) throw parseError(`tabungan: satuan ${String(unit)} ≠ 0.01`);
  const ms = Number(createdAt);
  return {
    date,
    source: 'pegadaian',
    brand: 'pegadaian',
    product: 'gold_savings',
    variant: '',
    weight_g: SAVINGS_UNIT,
    location: '',
    sell_price: price(Number(sell), 'tabungan jual'),
    buyback_price: price(Number(buyback), 'tabungan buyback'),
    source_updated_at: Number.isSafeInteger(ms) && ms > 0 ? jakartaIso(ms) : null,
  };
}

function parseSavings(body: string): ParsedRow<PriceRow> {
  const d = readData(body, 'tabungan') as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') throw parseError('tabungan: field data kosong');
  const row = savingsRow(d.tglBerlaku, d.hargaJual, d.hargaBeli, d.unit, d.id);
  if (row.sell_price === null || row.buyback_price === null) {
    throw parseError('tabungan: harga jual/buyback kosong');
  }
  return row;
}

/** Harga positif integer, atau `null` untuk 0/kosong; selain itu PARSE_ERROR. */
function price(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === 0) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw parseError(`${label}: harga tidak valid ${JSON.stringify(value)}`);
  }
  return value;
}

/** Pisahkan raw gabungan (≥ 1.1.0) dari raw lama yang hanya berisi respons tabel. */
function splitRaw(body: string): { table: string; savings: string | null } {
  try {
    const json = JSON.parse(body) as Partial<PegadaianRaw> & { responseCode?: unknown };
    if (typeof json.table === 'string' && typeof json.savings === 'string') {
      return { table: json.table, savings: json.savings };
    }
  } catch {
    // ditangani readBody
  }
  return { table: body, savings: null };
}

export function parse(raw: RawPayload): ParseResult<PriceRow> {
  const parts = splitRaw(raw.body);
  const vendors = readBody(parts.table);
  const targets = vendors.filter((v) => v.idVendor in VENDOR_BRAND);
  const dates = new Set(targets.map((v) => v.tglBerlaku));
  for (const d of dates) {
    if (typeof d !== 'string' || !isIsoDate(d)) throw parseError(`tglBerlaku tidak valid: ${d}`);
  }
  if (dates.size > 1) {
    // Slot primary bisa jatuh di tengah pembaruan periode antar vendor (TECH-SPEC §5.2).
    const detail = targets.map((v) => `${VENDOR_BRAND[v.idVendor]} ${v.tglBerlaku}`).join(', ');
    throw new ScrapeError('VALIDATION_FAILED', `tglBerlaku berbeda antar brand: ${detail}`);
  }

  const rows: ParsedRow<PriceRow>[] = [];
  for (const v of targets) {
    const brand = VENDOR_BRAND[v.idVendor]!;
    if (typeof v.idHarga !== 'number') throw parseError(`${brand}: idHarga tidak ada`);
    const updatedAt = jakartaIso(v.idHarga);
    for (const d of v.hargaMuliaDetails ?? []) {
      const label = `${brand} ${d.berat} g`;
      const sell = price(d.hargaJual, label);
      if (sell === null) continue; // gramasi tidak dijual
      if (typeof d.berat !== 'number' || !(d.berat > 0))
        throw parseError(`${label}: berat tidak valid`);
      rows.push({
        date: v.tglBerlaku,
        source: 'pegadaian',
        brand,
        product: 'gold_bar',
        variant: '',
        weight_g: Number(canonicalWeight(d.berat)),
        location: '',
        sell_price: sell,
        buyback_price: price(d.hargaBeli, label),
        source_updated_at: updatedAt,
      });
    }
  }

  if (parts.savings !== null) rows.push(parseSavings(parts.savings));

  const updated = targets.map((v) => v.idHarga).sort((a, b) => a - b);
  return {
    rows,
    dataDate: [...dates][0] ?? null,
    sourceUpdatedAt: updated.length > 0 ? jakartaIso(updated.at(-1)!) : null,
    stale: null,
  };
}

export const pegadaian: SourceScraper<PriceRow> = {
  id: 'pegadaian',
  kind: 'prices',
  parserVersion: 'pegadaian@1.1.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const headers = { Accept: 'application/json' };
    const table = await fetchOk(ctx, TABLE_URL, { headers });
    await sleep(ctx.pauseMs ?? 2_000);
    const savings = await fetchOk(ctx, SAVINGS_URL, { headers });
    const raw: PegadaianRaw = {
      table: table.body.toString('utf8'),
      savings: savings.body.toString('utf8'),
    };
    return { body: JSON.stringify(raw), contentType: 'application/json', fetchedAt };
  },
  parse,
};
