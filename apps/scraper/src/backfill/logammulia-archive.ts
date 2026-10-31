import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { utcIso, type PriceRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import { selectUncovered } from './select';
import type { BackfillJob } from './types';

// D-29 — histori 1 g Antam LM (Jakarta) dari arsip hasil scraping logammulia.com sebelum situs
// membatasi grafik ke 6 bulan; dipakai dengan izin pemilik arsip. Job lokal: `--input` = folder
// berisi `antam_sell.json` (harga dasar, sejak Jan 2010) dan `antam_buy.json` (buyback, sejak
// Nov 2015), masing-masing `[[ts_ms, harga], …]`.
//
// `ts` menyimpan jam dinding WIB seolah-olah UTC (cocok dengan grafik situs 19–23 Okt 2026 setelah
// digeser 7 jam; titik sebelum 2016 hanya tanggal, 00:00). Jadi tanggal = tanggal UTC dari `ts`,
// dan `source_updated_at` = jam UTC `ts` diberi offset +07:00 (kosong bila 00:00:00).

export const ARCHIVE_FILES = { sell: 'antam_sell.json', buyback: 'antam_buy.json' } as const;

type Row = ParsedRow<PriceRow>;
type Point = [number, number];

interface ArchiveRaw {
  sell: Point[];
  buyback: Point[];
}

function points(name: string, value: unknown): Point[] {
  if (!Array.isArray(value)) throw new ScrapeError('PARSE_ERROR', `${name}: bukan array`);
  for (const p of value) {
    if (
      !Array.isArray(p) ||
      typeof p[0] !== 'number' ||
      !Number.isInteger(p[1]) ||
      (p[1] as number) <= 0
    ) {
      throw new ScrapeError('PARSE_ERROR', `${name}: titik tidak valid ${JSON.stringify(p)}`);
    }
  }
  return value as Point[];
}

/** Titik terakhir per tanggal (urut waktu), sama seperti merge harian. */
function lastPerDay(series: Point[]): Map<string, { value: number; ts: number }> {
  const out = new Map<string, { value: number; ts: number }>();
  for (const [ts, value] of [...series].sort((a, b) => a[0] - b[0])) {
    out.set(new Date(ts).toISOString().slice(0, 10), { value, ts });
  }
  return out;
}

const wallTime = (ts: number): string | null => {
  const iso = new Date(ts).toISOString();
  return iso.slice(11, 19) === '00:00:00' ? null : `${iso.slice(0, 19)}+07:00`;
};

export function parseArchive(raw: RawPayload): ParseResult<PriceRow> {
  let body: Partial<ArchiveRaw>;
  try {
    body = JSON.parse(raw.body) as Partial<ArchiveRaw>;
  } catch {
    throw new ScrapeError('PARSE_ERROR', 'arsip bukan JSON');
  }
  const sell = lastPerDay(points('sell', body.sell));
  const buyback = lastPerDay(points('buyback', body.buyback));
  const dates = [...new Set([...sell.keys(), ...buyback.keys()])].sort();
  const rows: Row[] = dates.map((date) => {
    const s = sell.get(date);
    const b = buyback.get(date);
    const latest = Math.max(s?.ts ?? 0, b?.ts ?? 0);
    return {
      date,
      source: 'logammulia',
      brand: 'antam',
      product: 'gold_bar',
      variant: '',
      weight_g: 1,
      location: 'jakarta',
      sell_price: s?.value ?? null,
      buyback_price: b?.value ?? null,
      source_updated_at: wallTime(latest),
    };
  });
  return { rows, dataDate: dates.at(-1) ?? null, sourceUpdatedAt: null, stale: null };
}

export const logammuliaArchive: BackfillJob = {
  id: 'logammulia-archive',
  source: 'logammulia',
  parserVersion: 'logammulia-archive@1.0.0',
  localOnly: true,
  async fetchRaw(ctx) {
    if (!ctx.input) {
      throw new ScrapeError(
        'FETCH_HTTP',
        '--input wajib: folder berisi antam_sell.json dan antam_buy.json',
      );
    }
    const read = async (file: string) => {
      try {
        return JSON.parse(await readFile(path.join(ctx.input!, file), 'utf8')) as unknown;
      } catch (err) {
        throw new ScrapeError('PARSE_ERROR', `${file}: ${(err as Error).message}`);
      }
    };
    const body = {
      sell: await read(ARCHIVE_FILES.sell),
      buyback: await read(ARCHIVE_FILES.buyback),
    };
    return { body: JSON.stringify(body), contentType: 'application/json', fetchedAt: utcIso() };
  },
  parse: parseArchive,
  select: selectUncovered,
};
