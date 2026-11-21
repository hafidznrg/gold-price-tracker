import { canonicalWeight, jakartaDate, jakartaIso, utcIso, type PriceRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { CHALLENGE_RE } from '../probe/checks';
import { fetchOk } from './http';
import type { ParsedRow, ParseResult, RawPayload, SourceScraper } from './types';

// Fase 7 (P7-05) — EMASKU (PT Hartadinata Abadi Tbk) lewat `GET /api/v1/brandings/price/daily`
// (JSON tanpa token yang mengisi hrtagold.id/id/gold-price). Seri `Gold` → variant '', seri
// `Prime` → variant 'prime' (opsional). Jual dan buyback per keping untuk setiap gramasi (tidak
// pernah dihitung dari 1 g). Tanpa tanggal per baris: `updated_date` (WIB) berlaku untuk seluruh
// tabel. Riset: plan/research/hartadinata.md.

export const PRICE_URL = 'https://hrtagold.id/api/v1/brandings/price/daily';

/** Nama seri di respons → `variant` baris. Seri lain dilewati (dicatat di `note`). */
const SERIES_VARIANT: Record<string, string> = { Gold: '', Prime: 'prime' };

const parseError = (message: string) => new ScrapeError('PARSE_ERROR', message);

/** ISO dengan offset eksplisit (tanpa offset ambigu); dinormalkan ke `+07:00`. */
function wibTimestamp(value: unknown): { iso: string; date: string } {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    throw parseError(`updated_date tidak valid ${JSON.stringify(value)}`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw parseError(`updated_date tidak valid ${JSON.stringify(value)}`);
  return { iso: jakartaIso(ms), date: jakartaDate(ms) };
}

/** Harga: null/0 = kosong (`null`); selain itu integer aman > 0, bukan itu PARSE_ERROR. */
function price(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === 0) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw parseError(`${label}: bukan integer yang valid ${JSON.stringify(value)}`);
  }
  return value;
}

interface RawSeries {
  series?: unknown;
  prices?: unknown;
}

export function parse(raw: RawPayload): ParseResult<PriceRow> {
  let json: { code?: unknown; data?: unknown; updated_date?: unknown };
  try {
    json = JSON.parse(raw.body);
  } catch {
    throw parseError(`raw bukan JSON: ${raw.body.slice(0, 80)}`);
  }
  if (!json || typeof json !== 'object') throw parseError('raw bukan objek JSON');
  if (json.code !== 200) throw parseError(`code ${JSON.stringify(json.code)} ≠ 200`);
  const stamp = wibTimestamp(json.updated_date);
  if (!Array.isArray(json.data) || json.data.length === 0) {
    throw parseError('data bukan array atau kosong');
  }

  const notes: string[] = [];
  const byKey = new Map<string, ParsedRow<PriceRow>>();
  const seen = new Set<string>();
  for (const s of json.data as RawSeries[]) {
    const name = s && typeof s === 'object' ? s.series : undefined;
    if (typeof name !== 'string' || !(name in SERIES_VARIANT)) {
      notes.push(`seri ${JSON.stringify(name)} tidak dikenal, dilewati`);
      continue;
    }
    if (seen.has(name)) notes.push(`seri ${name} muncul lebih dari sekali: entri terakhir menimpa`);
    seen.add(name);
    const variant = SERIES_VARIANT[name]!;
    if (!Array.isArray(s.prices)) throw parseError(`seri ${name}: prices bukan array`);
    for (const p of s.prices as Record<string, unknown>[]) {
      const grams = p?.gramasi;
      if (typeof grams !== 'number' || !Number.isFinite(grams) || !(grams > 0)) {
        throw parseError(`seri ${name}: gramasi tidak valid ${JSON.stringify(grams)}`);
      }
      const weight = Number(canonicalWeight(grams));
      const label = `${name} ${weight} g`;
      const sell = price(p.price, `${label} price`);
      const buyback = price(p.buyback_price, `${label} buyback_price`);
      if (sell === null && buyback === null) continue;
      const key = `${variant}|${weight}`;
      if (byKey.has(key)) notes.push(`duplikat ${label}: dipakai entri terakhir`);
      byKey.set(key, {
        date: stamp.date,
        source: 'hrtagold',
        brand: 'emasku',
        product: 'gold_bar',
        variant,
        weight_g: weight,
        location: '',
        sell_price: sell,
        buyback_price: buyback,
        source_updated_at: stamp.iso,
      });
    }
  }
  if (!seen.has('Gold')) throw parseError('seri Gold tidak ada');

  // Urutan deterministik (tidak bergantung pada urutan array/`gramasi_id`): Gold dulu, naik per berat.
  const rows = [...byKey.values()].sort(
    (a, b) => (a.variant === b.variant ? 0 : a.variant === '' ? -1 : 1) || a.weight_g - b.weight_g,
  );
  return {
    rows,
    dataDate: stamp.date,
    sourceUpdatedAt: stamp.iso,
    stale: null, // V-06 di validate (dataDate ≠ hari ini; accept_previous_day D-42)
    ...(notes.length > 0 ? { note: notes.join('; ') } : {}),
  };
}

export const hrtagold: SourceScraper<PriceRow> = {
  id: 'hrtagold',
  kind: 'prices',
  parserVersion: 'hrtagold@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    // 403/429/503 berisi tantangan → BLOCKED di `fetchOk`.
    const res = await fetchOk(ctx, PRICE_URL, { headers: { Accept: 'application/json' } });
    const body = res.body.toString('utf8');
    if (CHALLENGE_RE.test(body)) {
      throw new ScrapeError('BLOCKED', 'HTTP 200 berisi halaman tantangan dari hrtagold.id');
    }
    try {
      JSON.parse(body);
    } catch {
      throw parseError(`respons bukan JSON: ${body.slice(0, 80)}`);
    }
    return { body, contentType: 'application/json', fetchedAt };
  },
  parse,
};
