import {
  canonicalWeight,
  isIsoDate,
  jakartaIso,
  jakartaToday,
  priceRowKey,
  utcIso,
  type Brand,
  type PriceRow,
} from '@gold/schema';
import { parse as devalueParse } from 'devalue';
import { ScrapeError } from '../pipeline/errors';
import { sleep } from '../probe/http';
import { fetchOk } from './http';
import type { ParsedRow, ParseResult, RawPayload, SourceScraper } from './types';

// Fase 6 (P6-04) — Galeri24 lewat `GET /api/gold-prices/page-data` (server route Nuxt tanpa
// token). Brand dari `vendorCode` (= `idVendor` Pegadaian, D-20). Fallback: data awal Nuxt
// (`__NUXT_DATA__`, format devalue) dari halaman `/harga-emas`, hanya saat jalur utama gagal.
// Semua angka datang sebagai string. Riset: plan/research/galeri24.md §2.

export const PAGE_DATA_URL = 'https://galeri24.co.id/api/gold-prices/page-data';
export const HISTORY_URL = 'https://galeri24.co.id/api/gold-prices';
export const PAGE_URL = 'https://galeri24.co.id/harga-emas';

/** Isi raw: jalur yang dipakai + isi respons apa adanya, agar parser tahu bentuknya. */
export interface Galeri24Raw {
  via: 'history' | 'page-data' | 'nuxt';
  body: string;
}

export interface Galeri24Vendor {
  brand: Brand;
  variant: string;
  /** Brand wajib: dihitung di V-04 dan di cek tanggal sama. Opsional tidak boleh menggagalkan run. */
  required: boolean;
}

/** `vendorCode` → brand/varian. Kode lain (koleksi, Retro, Batik, …) diabaikan tanpa karantina. */
export const GALERI24_VENDOR: Record<string, Galeri24Vendor> = {
  '00005201808001': { brand: 'antam', variant: '', required: true },
  '00005201808002': { brand: 'ubs', variant: '', required: true },
  '00005202003010': { brand: 'galeri24', variant: '', required: true },
  '00005202001009': { brand: 'lotusarchi', variant: '', required: false },
  '00005201905007': { brand: 'antam', variant: 'non_pegadaian', required: false },
};

const parseError = (message: string) => new ScrapeError('PARSE_ERROR', message);

/** Reviver devalue untuk tipe reaktif Nuxt: nilainya dipakai apa adanya. */
const NUXT_REVIVERS: Record<string, (value: unknown) => unknown> = {
  Reactive: (v) => v,
  ShallowReactive: (v) => v,
  Ref: (v) => v,
  ShallowRef: (v) => v,
  EmptyRef: (v) => v,
  EmptyShallowRef: (v) => v,
  NuxtError: (v) => v,
};

type Entry = Record<string, unknown>;

/** String angka → integer aman ≥ 0; selain itu PARSE_ERROR (jangan menebak skala). */
function integer(value: unknown, label: string): number {
  const n = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (value === '' || !Number.isSafeInteger(n) || n < 0) {
    throw parseError(`${label}: bukan integer yang valid ${JSON.stringify(value)}`);
  }
  return n;
}

/** Hasil pemetaan satu entri: baris + metadata untuk validasi tingkat run. */
export interface MappedEntry {
  row: ParsedRow<PriceRow>;
  required: boolean;
  /** `updatedAt` entri (epoch ms). */
  updatedMs: number;
  /** V-12: rumus harga jual tidak cocok (null = cocok / tidak dicek). */
  formulaMismatch: string | null;
}

/** Entri aktif (status "1") untuk vendor di tabel; selain itu `null`. */
function target(entry: Entry): Galeri24Vendor | null {
  if (entry.status !== '1') return null;
  const code = entry.vendorCode;
  return typeof code === 'string' ? (GALERI24_VENDOR[code] ?? null) : null;
}

/**
 * Petakan satu entri `GoldPrice` ke baris harga. `null` = entri tidak dipakai (vendor di luar
 * tabel, status ≠ 1, atau gramasi tidak dijual). Dipakai juga oleh job histori (P6-11).
 */
export function toRow(entry: Entry): MappedEntry | null {
  const vendor = target(entry);
  if (!vendor) return null;
  const label = `${vendor.brand}${vendor.variant ? ` ${vendor.variant}` : ''} ${String(entry.denomination)} g`;
  const date = entry.date;
  if (typeof date !== 'string' || !isIsoDate(date)) {
    throw parseError(`${label}: date tidak valid ${JSON.stringify(date)}`);
  }
  const grams = Number(entry.denomination);
  if (typeof entry.denomination !== 'string' || !(grams > 0) || !Number.isFinite(grams)) {
    throw parseError(`${label}: denomination tidak valid ${JSON.stringify(entry.denomination)}`);
  }
  const sell = integer(entry.sellingPrice, `${label} sellingPrice`);
  const buyback = integer(entry.buybackPrice, `${label} buybackPrice`);
  const updatedMs = typeof entry.updatedAt === 'string' ? Date.parse(entry.updatedAt) : NaN;
  if (!Number.isFinite(updatedMs)) {
    throw parseError(`${label}: updatedAt tidak valid ${JSON.stringify(entry.updatedAt)}`);
  }

  // Non-Pegadaian: jual 0 → baris buyback saja; kedua harga 0 → dilewati. Lainnya: jual wajib > 0.
  const buybackOnly = vendor.variant === 'non_pegadaian';
  if (buybackOnly ? sell === 0 && buyback === 0 : sell === 0) return null;

  // V-12: sellingPrice = ceil(price × (1 + margin/100) / 1000) × 1000.
  let formulaMismatch: string | null = null;
  if (sell > 0) {
    const base = Number(entry.price);
    const margin = Number(entry.margin);
    const expected = Math.ceil((base * (1 + margin / 100)) / 1000) * 1000;
    if (!Number.isFinite(expected) || sell !== expected) {
      formulaMismatch = `${label}: sellingPrice ${sell} ≠ ceil(${String(entry.price)} × (1 + ${String(entry.margin)}%)) = ${expected}`;
    }
  }

  return {
    row: {
      date,
      source: 'galeri24',
      brand: vendor.brand,
      product: 'gold_bar',
      variant: vendor.variant,
      weight_g: Number(canonicalWeight(grams)),
      location: '',
      sell_price: sell > 0 ? sell : null,
      buyback_price: buyback > 0 ? buyback : null,
      source_updated_at: jakartaIso(new Date(updatedMs)),
    },
    required: vendor.required,
    updatedMs,
    formulaMismatch,
  };
}

/**
 * Petakan seluruh entri: abaikan yang tidak dipakai, dan untuk duplikat kunci
 * (tanggal × vendor × gramasi, status 1) ambil `updatedAt` terbesar. Urutan hasil mengikuti
 * kemunculan pertama kunci. `notes` = catatan non-fatal (duplikat).
 */
export function mapEntries(entries: readonly Entry[]): { mapped: MappedEntry[]; notes: string[] } {
  const best = new Map<string, { entry: Entry; ms: number; count: number }>();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || !target(entry)) continue;
    const ms = typeof entry.updatedAt === 'string' ? Date.parse(entry.updatedAt) : NaN;
    const grams = Number(entry.denomination);
    const key = `${String(entry.date)}|${String(entry.vendorCode)}|${Number.isFinite(grams) ? grams : String(entry.denomination)}`;
    const cur = best.get(key);
    if (!cur) best.set(key, { entry, ms, count: 1 });
    else {
      cur.count++;
      if (ms > cur.ms || Number.isNaN(cur.ms)) {
        cur.entry = entry;
        cur.ms = ms;
      }
    }
  }
  // Satu catatan ringkas: API histori memuat beberapa versi per kunci setiap hari (D-66), jadi
  // catatan per kunci akan melewati batas 500 karakter `error_message` RUN.
  const dup: string[] = [];
  let maxCount = 0;
  const mapped: MappedEntry[] = [];
  for (const [key, { entry, count }] of best) {
    if (count > 1) {
      dup.push(key);
      maxCount = Math.max(maxCount, count);
    }
    const m = toRow(entry);
    if (m) mapped.push(m);
  }
  const notes =
    dup.length === 0
      ? []
      : [
          dup.length === 1
            ? `duplikat ${dup[0]} (${maxCount} entri status 1): dipakai updatedAt terbesar`
            : `${dup.length} kunci punya beberapa versi (maks ${maxCount} entri status 1): dipakai updatedAt terbesar`,
        ];
  return { mapped, notes };
}

/** Isi `__NUXT_DATA__` dari HTML halaman. */
export function extractNuxtData(html: string): string {
  const m = /<script\b[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw parseError('__NUXT_DATA__ tidak ditemukan di /harga-emas');
  return m[1]!;
}

function readEntries(rawBody: string): { entries: Entry[]; via: Galeri24Raw['via'] } {
  let raw: Partial<Galeri24Raw>;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    throw parseError(`raw bukan JSON: ${rawBody.slice(0, 80)}`);
  }
  if (
    !raw ||
    (raw.via !== 'history' && raw.via !== 'page-data' && raw.via !== 'nuxt') ||
    typeof raw.body !== 'string'
  ) {
    throw parseError('raw tidak berbentuk { via, body }');
  }
  let list: unknown;
  if (raw.via === 'page-data' || raw.via === 'history') {
    try {
      list = (JSON.parse(raw.body) as { results?: unknown }).results;
    } catch {
      throw parseError(`${raw.via} bukan JSON: ${raw.body.slice(0, 80)}`);
    }
    if (!Array.isArray(list)) throw parseError(`${raw.via}: field results bukan array`);
  } else {
    try {
      const root = devalueParse(raw.body, NUXT_REVIVERS) as {
        data?: { goldPrice?: unknown };
      } | null;
      list = root?.data?.goldPrice;
    } catch (err) {
      throw parseError(`__NUXT_DATA__ tidak terbaca: ${(err as Error).message}`);
    }
    if (!Array.isArray(list)) throw parseError('__NUXT_DATA__: data.goldPrice bukan array');
  }
  return { entries: list as Entry[], via: raw.via };
}

export function parse(raw: RawPayload): ParseResult<PriceRow> {
  const { entries, via } = readEntries(raw.body);
  const { mapped, notes } = mapEntries(entries);
  if (via === 'nuxt') notes.push('jalur utama gagal: dipakai fallback __NUXT_DATA__ (/harga-emas)');

  // Brand wajib harus bertanggal sama (pola Pegadaian); selain itu VALIDATION_FAILED.
  const required = mapped.filter((m) => m.required);
  const dates = [...new Set(required.map((m) => m.row.date))].sort();
  if (dates.length > 1) {
    const detail = [...new Set(required.map((m) => `${m.row.brand} ${m.row.date}`))].join(', ');
    throw new ScrapeError('VALIDATION_FAILED', `date berbeda antar brand wajib: ${detail}`);
  }
  const dataDate = dates[0] ?? null;

  const kept: MappedEntry[] = [];
  for (const m of mapped) {
    const { row } = m;
    const label = `${row.brand}${row.variant ? ` ${row.variant}` : ''} ${row.weight_g} g`;
    if (!m.required) {
      if (dataDate !== null && row.date !== dataDate) {
        notes.push(`${label}: date ${row.date} ≠ ${dataDate}, dibuang`);
        continue;
      }
      // V-03 untuk baris opsional: buang di parser agar run yang hijau tidak gagal.
      if (
        row.sell_price !== null &&
        row.buyback_price !== null &&
        !(row.buyback_price < row.sell_price)
      ) {
        notes.push(`${label}: buyback ${row.buyback_price} ≥ jual ${row.sell_price}, dibuang`);
        continue;
      }
    }
    kept.push(m);
  }

  const suspect = kept
    .filter((m) => m.formulaMismatch !== null)
    .map((m) => ({
      key: priceRowKey(m.row),
      reason: 'PRICE_FORMULA' as const,
      detail: m.formulaMismatch!,
    }));
  const updated = required.map((m) => m.updatedMs);
  return {
    rows: kept.map((m) => m.row),
    dataDate,
    sourceUpdatedAt: updated.length > 0 ? jakartaIso(new Date(Math.max(...updated))) : null,
    stale: null,
    ...(suspect.length > 0 ? { suspect } : {}),
    ...(notes.length > 0 ? { note: notes.join('; ') } : {}),
  };
}

/** Respons page-data yang dapat dipakai: JSON dengan `results` array. */
function isUsablePageData(body: string): boolean {
  try {
    return Array.isArray((JSON.parse(body) as { results?: unknown }).results);
  } catch {
    return false;
  }
}

/**
 * Entri API histori (terbaru dulu) → hanya tanggal sasaran, atau tanggal terbaru ≤ sasaran bila
 * sasaran belum ada (jalur accept_previous_day/stale tetap jalan). Dedup per `id` karena halaman
 * bergeser saat data terbit. Semua versi tanggal itu dipertahankan; `mapEntries` memilih versi
 * status 1 dengan `updatedAt` terbesar per kunci. `null` = tidak ada entri ≤ sasaran.
 */
export function selectHistory(results: readonly unknown[], date: string): Entry[] | null {
  const seen = new Set<string>();
  const unique: Entry[] = [];
  for (const e of results as Entry[]) {
    if (!e || typeof e !== 'object') continue;
    if (typeof e.id === 'string') {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
    }
    unique.push(e);
  }
  const dates = unique
    .map((e) => e.date)
    .filter((d): d is string => typeof d === 'string' && isIsoDate(d) && d <= date)
    .sort();
  const pick = dates.at(-1);
  return pick === undefined ? null : unique.filter((e) => e.date === pick);
}

export const galeri24: SourceScraper<PriceRow> = {
  id: 'galeri24',
  kind: 'prices',
  parserVersion: 'galeri24@1.1.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const date = ctx.date ?? jakartaToday(ctx.now);
    let raw: Galeri24Raw | null = null;
    // Utama: API histori memuat semua versi harga; page-data pernah menyajikan versi lama.
    try {
      const res = await fetchOk(ctx, `${HISTORY_URL}?take=1000&page=1`, {
        headers: { Accept: 'application/json' },
      });
      const list = (JSON.parse(res.body.toString('utf8')) as { results?: unknown }).results;
      const picked = Array.isArray(list) ? selectHistory(list, date) : null;
      if (picked && picked.length > 0) {
        raw = { via: 'history', body: JSON.stringify({ results: picked }) };
      }
    } catch {
      // jatuh ke page-data
    }
    if (!raw) {
      try {
        await sleep(ctx.pauseMs ?? 2_000);
        const res = await fetchOk(ctx, `${PAGE_DATA_URL}?take=1000&date=${date}`, {
          headers: { Accept: 'application/json' },
        });
        const body = res.body.toString('utf8');
        if (isUsablePageData(body)) raw = { via: 'page-data', body };
      } catch {
        // jatuh ke fallback di bawah
      }
    }
    if (!raw) {
      await sleep(ctx.pauseMs ?? 2_000);
      const res = await fetchOk(ctx, PAGE_URL, { headers: { Accept: 'text/html' } });
      raw = { via: 'nuxt', body: extractNuxtData(res.body.toString('utf8')) };
    }
    return { body: JSON.stringify(raw), contentType: 'application/json', fetchedAt };
  },
  parse,
};
