import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { utcIso } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { DEFAULT_USER_AGENT, request, sleep } from '../probe/http';
import { GALERI24_VENDOR } from '../sources/galeri24';

// P6-11 langkah 1 — unduh histori Galeri24 dari `GET /api/gold-prices` (berhalaman) ke folder
// lokal, satu file per halaman. Dijalankan sekali dari terminal (`galeri24-download`), bukan dari
// workflow. Hanya lima kode vendor di GALERI24_VENDOR dan sepuluh field yang dipakai parser yang
// disimpan, agar total ±70 MB tanpa filter menjadi kecil. Riset: plan/research/galeri24.md §5.

export const HISTORY_URL = 'https://galeri24.co.id/api/gold-prices';

/** Field entri yang disimpan; sisanya (vendorName, createdAt, description, …) dibuang. */
export const KEPT_FIELDS = [
  'id',
  'vendorCode',
  'date',
  'denomination',
  'price',
  'margin',
  'sellingPrice',
  'buybackPrice',
  'status',
  'updatedAt',
] as const;

export interface PageResponse {
  status: number;
  body: string;
}

/** Fetch satu URL (GET). Dapat diganti di uji dengan respons palsu. */
export type PageFetcher = (url: string) => Promise<PageResponse>;

export interface DownloadOptions {
  /** Folder keluaran (absolut). */
  out: string;
  take?: number;
  pauseMs?: number;
  /** Batas pengaman jumlah halaman. */
  maxPages?: number;
  userAgent?: string;
  /** Jeda sebelum satu kali ulang untuk kegagalan sementara. */
  retryDelayMs?: number;
  fetchPage?: PageFetcher;
  log?: (message: string) => void;
}

export interface DownloadManifest {
  take: number;
  pages: number;
  count_first: number | null;
  count_last: number | null;
  fetched_at_start: string;
  fetched_at_end: string;
  kept_rows: number;
}

export interface DownloadResult {
  manifest: DownloadManifest;
  /** Peringatan non-fatal (mis. `count` berubah selama unduhan). */
  warnings: string[];
}

export const pageFileName = (page: number): string => `page-${String(page).padStart(3, '0')}.json`;

function defaultFetcher(userAgent: string): PageFetcher {
  return async (url) => {
    const res = await request(url, { userAgent, headers: { Accept: 'application/json' } });
    return { status: res.status, body: res.body.toString('utf8') };
  };
}

const transient = (status: number) => status === 429 || status >= 500;

/** GET dengan satu kali ulang untuk galat jaringan / 429 / 5xx; selain itu langsung gagal. */
async function getWithRetry(
  fetchPage: PageFetcher,
  url: string,
  retryDelayMs: number,
): Promise<PageResponse> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs);
    try {
      const res = await fetchPage(url);
      if (res.status === 200) return res;
      last = new ScrapeError('FETCH_HTTP', `HTTP ${res.status} dari ${url}`);
      if (!transient(res.status)) break;
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

interface HistoryPage {
  count: number | null;
  next: string | null;
  results: Record<string, unknown>[];
}

function readPage(body: string, url: string): HistoryPage {
  let json: { count?: unknown; next?: unknown; results?: unknown };
  try {
    json = JSON.parse(body);
  } catch {
    throw new ScrapeError('PARSE_ERROR', `${url}: respons bukan JSON`);
  }
  if (!json || !Array.isArray(json.results)) {
    throw new ScrapeError('PARSE_ERROR', `${url}: field results bukan array`);
  }
  return {
    count: typeof json.count === 'number' ? json.count : null,
    next: typeof json.next === 'string' && json.next !== '' ? json.next : null,
    results: json.results as Record<string, unknown>[],
  };
}

/** Hanya vendor di tabel Prinsip, hanya field yang dipakai parser. */
export function slimEntries(
  results: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const entry of results) {
    const code = entry?.vendorCode;
    if (typeof code !== 'string' || !(code in GALERI24_VENDOR)) continue;
    out.push(Object.fromEntries(KEPT_FIELDS.map((f) => [f, entry[f]])));
  }
  return out;
}

export async function downloadGaleri24History(opts: DownloadOptions): Promise<DownloadResult> {
  const take = opts.take ?? 10_000;
  const pauseMs = opts.pauseMs ?? 5_000;
  const maxPages = opts.maxPages ?? 40;
  const retryDelayMs = opts.retryDelayMs ?? 10_000;
  const fetchPage =
    opts.fetchPage ??
    defaultFetcher(opts.userAgent ?? (process.env.SCRAPER_USER_AGENT || DEFAULT_USER_AGENT));
  const log = opts.log ?? (() => {});

  await mkdir(opts.out, { recursive: true });
  const startedAt = utcIso();
  let countFirst: number | null = null;
  let countLast: number | null = null;
  let pages = 0;
  let kept = 0;

  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(pauseMs);
    const url = `${HISTORY_URL}?take=${take}&page=${page}`;
    const res = await getWithRetry(fetchPage, url, retryDelayMs);
    const data = readPage(res.body, url);
    if (data.results.length === 0) break;

    if (page === 1) countFirst = data.count;
    countLast = data.count;
    const results = slimEntries(data.results);
    kept += results.length;
    pages = page;
    await writeFile(
      path.join(opts.out, pageFileName(page)),
      JSON.stringify({ page, count: data.count, fetched_at: utcIso(), results }) + '\n',
    );
    log(`halaman ${page}: ${data.results.length} entri, ${results.length} dipakai`);
    if (data.next === null) break;
    if (page === maxPages) {
      throw new ScrapeError(
        'FETCH_HTTP',
        `batas --max-pages ${maxPages} tercapai tetapi masih ada halaman berikutnya`,
      );
    }
  }

  const manifest: DownloadManifest = {
    take,
    pages,
    count_first: countFirst,
    count_last: countLast,
    fetched_at_start: startedAt,
    fetched_at_end: utcIso(),
    kept_rows: kept,
  };
  await writeFile(path.join(opts.out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const warnings: string[] = [];
  if (countFirst !== countLast) {
    warnings.push(
      `count berubah selama unduhan (${countFirst} → ${countLast}): data terbit di tengah jalan, halaman bisa bergeser. Ulangi di luar jam terbit (±10.14, ±17.50, ±21.40 WIB).`,
    );
  }
  return { manifest, warnings };
}
