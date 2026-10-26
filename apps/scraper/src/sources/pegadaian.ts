import {
  canonicalWeight,
  isIsoDate,
  jakartaIso,
  utcIso,
  type Brand,
  type PriceRow,
} from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { fetchOk } from './http';
import type { ParsedRow, ParseResult, RawPayload, SourceScraper } from './types';

// TECH-SPEC §5.2 — Pegadaian lewat `GET /gold/prices/table` (D-20). Brand dari `idVendor`;
// vendor lain diabaikan; `hargaJual = 0` = gramasi tidak dijual. Buyback emas batangan tidak
// tersedia (Q-1, D-07): `hargaBeli` hanya dipakai bila suatu saat berisi angka.

export const TABLE_URL = 'https://pegadaian.co.id/gold/prices/table';
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

function readBody(body: string): VendorPrices[] {
  let json: { responseCode?: unknown; responseDesc?: unknown; data?: unknown };
  try {
    json = JSON.parse(body);
  } catch {
    throw parseError(`respons bukan JSON: ${body.slice(0, 80)}`);
  }
  if (json.responseCode !== RESPONSE_OK) {
    throw parseError(`responseCode ${String(json.responseCode)} (${String(json.responseDesc)})`);
  }
  if (!Array.isArray(json.data)) throw parseError('field data bukan array');
  return json.data as VendorPrices[];
}

/** Harga positif integer, atau `null` untuk 0/kosong; selain itu PARSE_ERROR. */
function price(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === 0) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw parseError(`${label}: harga tidak valid ${JSON.stringify(value)}`);
  }
  return value;
}

export function parse(raw: RawPayload): ParseResult<PriceRow> {
  const vendors = readBody(raw.body);
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
  parserVersion: 'pegadaian@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const res = await fetchOk(ctx, TABLE_URL, { headers: { Accept: 'application/json' } });
    return { body: res.body.toString('utf8'), contentType: 'application/json', fetchedAt };
  },
  parse,
};
