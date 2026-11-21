import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { isExpectedDay, utcIso, type PriceRow } from '@gold/schema';
import { loadConfig } from '../config';
import { ScrapeError } from '../pipeline/errors';
import { parse as parseUbs } from '../sources/ubslifestyle';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import type { PriceBackfillJob } from './types';

// D-78 — harga jual UBS dari arsip raw (`data/raw/ubslifestyle/**/*.json.gz`) untuk hari terbit
// yang grafiknya tidak pernah mendapat titik (21 Nov 2026). Run harian memberi tanggal dari titik
// terakhir grafik, jadi tabel yang harga jualnya sudah baru ditolak `stale`. Snapshot dipakai bila:
// tanggal fetch (WIB) > tanggal grafik, tanggal fetch = hari terbit (`mon_sat_id`), ada snapshot
// pembanding yang diambil pada tanggal grafik itu sendiri, dan harga jual berbeda darinya.
// Baris: `date` = tanggal fetch, `sell_price` dari tabel, `buyback_price` = null (buyback hari itu
// tidak terbit). Job lokal: `--input` = folder arsip.

type Row = ParsedRow<PriceRow>;

interface Snapshot {
  name: string;
  body: string;
}

interface Payload {
  holidays: string[];
  snapshots: Snapshot[];
}

const WIB_MS = 7 * 3600 * 1000;
const NAME = /^(\d{4}-\d\d-\d\d)T(\d\d)(\d\d)(\d\d)Z/;

/** Tanggal WIB dari nama raw `YYYY-MM-DDTHHMMSSZ-….json.gz`; null bila bukan pola itu. */
export function fetchDateWib(name: string): string | null {
  const m = NAME.exec(path.posix.basename(name));
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  return new Date(t + WIB_MS).toISOString().slice(0, 10);
}

const sellKey = (rows: readonly Row[]): string =>
  rows
    .map((r) => `${r.variant}|${r.weight_g}|${r.sell_price ?? ''}`)
    .sort()
    .join(',');

async function listGz(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listGz(full)));
    else if (e.name.endsWith('.json.gz')) out.push(full);
  }
  return out;
}

/** Hanya raw run harian (`{ tables, chart }`); raw backfill dan arsip job ini dilewati. */
function isDailyRaw(text: string): boolean {
  try {
    const json = JSON.parse(text) as unknown;
    return typeof json === 'object' && json !== null && 'tables' in json && 'chart' in json;
  } catch {
    return false;
  }
}

export function parseRawSell(raw: RawPayload): ParseResult<PriceRow> {
  let payload: Payload;
  try {
    payload = JSON.parse(raw.body) as Payload;
    if (!Array.isArray(payload.snapshots) || !Array.isArray(payload.holidays)) {
      throw new Error('snapshots/holidays bukan array');
    }
  } catch (err) {
    throw new ScrapeError('PARSE_ERROR', `arsip gabungan tidak valid: ${(err as Error).message}`);
  }
  const holidays = payload.holidays.map((date) => ({ date }));

  let skipped = 0;
  const parsed: { fetchDate: string; dataDate: string; rows: Row[] }[] = [];
  for (const s of [...payload.snapshots].sort((a, b) => a.name.localeCompare(b.name))) {
    const fetchDate = fetchDateWib(s.name);
    if (!fetchDate) {
      skipped++;
      continue;
    }
    try {
      const r = parseUbs({ body: s.body, contentType: 'application/json', fetchedAt: '' });
      if (!r.dataDate) throw new ScrapeError('PARSE_ERROR', 'tanpa tanggal data');
      parsed.push({ fetchDate, dataDate: r.dataDate, rows: r.rows });
    } catch (err) {
      if (err instanceof ScrapeError || err instanceof SyntaxError) {
        skipped++;
        continue;
      }
      throw err;
    }
  }

  // Pembanding: snapshot terakhir yang diambil pada tanggal grafiknya sendiri (versi final hari itu).
  const reference = new Map<string, string>();
  for (const p of parsed) {
    if (p.fetchDate === p.dataDate) reference.set(p.dataDate, sellKey(p.rows));
  }

  // Snapshot terakhir per tanggal fetch menang.
  const chosen = new Map<string, Row[]>();
  for (const p of parsed) {
    const ref = reference.get(p.dataDate);
    if (
      p.fetchDate > p.dataDate &&
      isExpectedDay('mon_sat_id', p.fetchDate, holidays) &&
      ref !== undefined &&
      ref !== sellKey(p.rows)
    ) {
      chosen.set(
        p.fetchDate,
        p.rows.map((r) => ({ ...r, date: p.fetchDate, buyback_price: null })),
      );
    }
  }

  const rows = [...chosen.values()]
    .flat()
    .filter((r) => r.sell_price !== null)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.variant.localeCompare(b.variant) ||
        a.weight_g - b.weight_g,
    );
  const dates = [...chosen.keys()].sort();
  return {
    rows,
    dataDate: dates.at(-1) ?? null,
    sourceUpdatedAt: null,
    stale: null,
    note: `${payload.snapshots.length} snapshot dibaca, ${skipped} dilewati, ${rows.length} baris harga jual di ${dates.length} tanggal${dates.length ? ` (${dates.join(', ')})` : ''}`,
  };
}

/** Buang tanggal yang sudah punya harga jual UBS (hasil scrape atau backfill ini sebelumnya). */
export function selectWithoutSell(rows: Row[], existing: readonly PriceRow[]): Row[] {
  const covered = new Set(existing.filter((r) => r.sell_price !== null).map((r) => r.date));
  return rows.filter((r) => !covered.has(r.date));
}

export const ubsRawSell: PriceBackfillJob = {
  id: 'ubs-raw-sell',
  source: 'ubslifestyle',
  parserVersion: 'ubs-raw-sell@1.0.0',
  localOnly: true,
  async fetchRaw(ctx) {
    if (!ctx.input) {
      throw new ScrapeError(
        'FETCH_HTTP',
        '--input wajib: folder arsip raw, mis. data/raw/ubslifestyle',
      );
    }
    const config = await loadConfig(ctx.root);
    const snapshots: Snapshot[] = [];
    for (const file of await listGz(ctx.input)) {
      let body: string;
      try {
        body = gunzipSync(await readFile(file)).toString('utf8');
      } catch (err) {
        throw new ScrapeError('PARSE_ERROR', `${file}: ${(err as Error).message}`);
      }
      if (!isDailyRaw(body)) continue; // rerun-safe
      snapshots.push({ name: path.relative(ctx.input, file).split(path.sep).join('/'), body });
    }
    const payload: Payload = { holidays: config.holidays.map((h) => h.date), snapshots };
    return { body: JSON.stringify(payload), contentType: 'application/json', fetchedAt: utcIso() };
  },
  parse: parseRawSell,
  select: selectWithoutSell,
};
