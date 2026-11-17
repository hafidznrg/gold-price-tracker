import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { utcIso, type PriceRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { mapEntries } from '../sources/galeri24';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import type { PriceBackfillJob } from './types';

// P6-11 langkah 2 — histori Galeri24 dari folder hasil `galeri24-download` (`--input`). Job lokal.
// Pemetaan entri memakai `mapEntries` sumber harian (status 1, per kunci `updatedAt` terbesar),
// jadi aturan jual/buyback sama persis. Filter rentang --from/--to dikerjakan pipeline backfill.

type Row = ParsedRow<PriceRow>;
type Entry = Record<string, unknown>;

const PAGE_FILE = /^page-\d+\.json$/;

export async function readDownload(dir: string): Promise<{ manifest: unknown; results: Entry[] }> {
  const read = async (file: string) => {
    try {
      return JSON.parse(await readFile(path.join(dir, file), 'utf8')) as unknown;
    } catch (err) {
      throw new ScrapeError('PARSE_ERROR', `${file}: ${(err as Error).message}`);
    }
  };
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => PAGE_FILE.test(n)).sort();
  } catch (err) {
    throw new ScrapeError('FETCH_HTTP', `${dir}: ${(err as Error).message}`);
  }
  if (names.length === 0) {
    throw new ScrapeError(
      'FETCH_HTTP',
      `${dir}: tidak ada page-*.json (jalankan galeri24-download)`,
    );
  }
  const manifest = await read('manifest.json');
  const results: Entry[] = [];
  for (const name of names) {
    const page = (await read(name)) as { results?: unknown };
    if (!Array.isArray(page.results)) {
      throw new ScrapeError('PARSE_ERROR', `${name}: field results bukan array`);
    }
    results.push(...(page.results as Entry[]));
  }
  return { manifest, results };
}

export function parseHistory(raw: RawPayload): ParseResult<PriceRow> {
  let body: { results?: unknown };
  try {
    body = JSON.parse(raw.body) as { results?: unknown };
  } catch {
    throw new ScrapeError('PARSE_ERROR', 'raw histori bukan JSON');
  }
  if (!Array.isArray(body.results)) {
    throw new ScrapeError('PARSE_ERROR', 'raw histori: field results bukan array');
  }
  const entries = body.results as Entry[];

  // Halaman bergeser saat data terbit → entri yang sama bisa muncul dua kali; dedup per `id`.
  const seen = new Set<string>();
  const unique: Entry[] = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    if (typeof e.id === 'string') {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
    }
    unique.push(e);
  }

  // Kunci (tanggal × vendor × gramasi) tanpa satu pun status 1 diabaikan: gramasi nonaktif.
  const keyOf = (e: Entry) => `${String(e.date)}|${String(e.vendorCode)}|${Number(e.denomination)}`;
  const active = new Set(unique.filter((e) => e.status === '1').map(keyOf));
  const inactive = new Set(
    unique
      .filter((e) => e.status !== '1')
      .map(keyOf)
      .filter((k) => !active.has(k)),
  );

  const { mapped } = mapEntries(unique);

  let v03 = 0;
  let v12 = 0;
  const rows: Row[] = [];
  for (const m of mapped) {
    const { row } = m;
    // V-03: histori bisa berantakan; baris buyback ≥ jual dibuang, bukan menggagalkan job.
    if (
      row.sell_price !== null &&
      row.buyback_price !== null &&
      !(row.buyback_price < row.sell_price)
    ) {
      v03++;
      continue;
    }
    // V-12 hanya dihitung: backfill mengabaikan suspect, tidak ada karantina untuk histori.
    if (m.formulaMismatch !== null) v12++;
    rows.push(row);
  }
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.brand.localeCompare(b.brand) ||
      a.variant.localeCompare(b.variant) ||
      a.weight_g - b.weight_g,
  );

  const dates = new Set(rows.map((r) => r.date));
  return {
    rows,
    dataDate: [...dates].sort().at(-1) ?? null,
    sourceUpdatedAt: null,
    stale: null,
    note: `${entries.length} entri, ${unique.length} id unik, ${inactive.size} kunci tanpa status 1 diabaikan, ${v03} baris V-03 dibuang, ${v12} selisih rumus V-12 (tidak dikarantina), ${rows.length} baris di ${dates.size} tanggal`,
  };
}

/** Buang baris pada tanggal yang sudah di-scrape harian untuk brand + varian yang sama (D-28). */
export function selectUnscraped(
  rows: ParsedRow<PriceRow>[],
  existing: readonly PriceRow[],
): ParsedRow<PriceRow>[] {
  const scraped = new Set(
    existing.filter((r) => r.origin === 'scrape').map((r) => `${r.brand}|${r.variant}|${r.date}`),
  );
  return rows.filter((r) => !scraped.has(`${r.brand}|${r.variant}|${r.date}`));
}

export const galeri24History: PriceBackfillJob = {
  id: 'galeri24-history',
  source: 'galeri24',
  parserVersion: 'galeri24-history@1.0.0',
  localOnly: true,
  async fetchRaw(ctx) {
    if (!ctx.input) {
      throw new ScrapeError(
        'FETCH_HTTP',
        '--input wajib: folder hasil galeri24-download (page-*.json + manifest.json)',
      );
    }
    const { manifest, results } = await readDownload(ctx.input);
    return {
      body: JSON.stringify({ manifest, results }),
      contentType: 'application/json',
      fetchedAt: utcIso(),
    };
  },
  parse: parseHistory,
  select: selectUnscraped,
};
