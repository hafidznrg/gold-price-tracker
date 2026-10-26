import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { readPriceCsv } from '@gold/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { tables } from '../src/html';
import { ScrapeError } from '../src/pipeline/errors';
import { merge } from '../src/pipeline/merge';
import { scrape, SCRAPE_EXIT, type ScrapeOptions } from '../src/pipeline/scrape';
import { ubslifestyle } from '../src/sources/ubslifestyle';
import type { RawPayload, SourceScraper } from '../src/sources/types';
import { tempRoot } from './helpers';

// Alur job scrape → merge dengan modul UBS asli dan fetch palsu dari fixture P0-07.

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/ubslifestyle');
const page = gunzipSync(readFileSync(path.join(DIR, 'page-2026-10-25-sunday.html.gz'))).toString(
  'utf8',
);
const chart = readFileSync(path.join(DIR, 'chart-interval-1095-2026-10-25.json'), 'utf8');

const fixturePayload: RawPayload = {
  body: JSON.stringify({ tables: tables(page).join('\n'), chart }),
  contentType: 'application/json',
  fetchedAt: '2026-10-24T03:30:01Z',
};

const fake = (fetchRaw: SourceScraper['fetchRaw']): SourceScraper => ({
  ...ubslifestyle,
  fetchRaw,
});

const SATURDAY = new Date('2026-10-24T03:30:00Z');
const SUNDAY = new Date('2026-10-25T03:30:00Z');
const MONDAY = new Date('2026-10-26T03:30:00Z');

let root: string;
let out: string;
beforeEach(async () => {
  root = await tempRoot();
  out = path.join(root, 'out', 'ubslifestyle');
});

const opts = (over: Partial<ScrapeOptions>): ScrapeOptions => ({
  root,
  source: 'ubslifestyle',
  slot: 'primary',
  trigger: 'schedule',
  out,
  runId: '300-1',
  userAgent: 'test',
  scraper: fake(async () => fixturePayload),
  ...over,
});

const artifactFiles = async () => (await readdir(out)).sort();

describe('scrape', () => {
  it('tanggal data = hari ini → success, artifact lengkap, kode 0', async () => {
    const run = await scrape(opts({ now: SATURDAY }));
    expect(run).toMatchObject({
      status: 'success',
      data_date: '2026-10-24',
      rows_parsed: 13,
      rows_held: 0,
      rows_rejected: 0,
      exit_code: SCRAPE_EXIT.OK,
      parser_version: 'ubslifestyle@1.0.0',
    });
    expect(await artifactFiles()).toEqual(['held.json', 'raw.json.gz', 'rows.json', 'run.json']);
    const rows = JSON.parse(await readFile(path.join(out, 'rows.json'), 'utf8'));
    expect(rows).toHaveLength(13);
    expect(rows[0]).not.toHaveProperty('scraped_at');
  });

  it('stale di hari yang tidak diharapkan (Minggu, business_days_id) → kode 0, tanpa baris', async () => {
    const run = await scrape(opts({ now: SUNDAY }));
    expect(run).toMatchObject({
      status: 'stale',
      expected_day: false,
      exit_code: SCRAPE_EXIT.OK,
      rows_rejected: 13,
      error_code: null,
      error_message: 'tanggal data 2026-10-24 ≠ hari ini 2026-10-25',
    });
    expect(JSON.parse(await readFile(path.join(out, 'rows.json'), 'utf8'))).toEqual([]);
  });

  it('stale di hari yang diharapkan (Senin) → kode 3', async () => {
    const run = await scrape(opts({ now: MONDAY }));
    expect(run).toMatchObject({
      status: 'stale',
      expected_day: true,
      exit_code: SCRAPE_EXIT.STALE,
    });
  });

  it('fetch diblokir → failed/BLOCKED, kode 1, run.json tetap ditulis tanpa raw', async () => {
    const blocked = fake(async () => {
      throw new ScrapeError('BLOCKED', 'HTTP 403 (halaman tantangan/blokir)');
    });
    const run = await scrape(opts({ now: SATURDAY, scraper: blocked }));
    expect(run).toMatchObject({ status: 'failed', error_code: 'BLOCKED', exit_code: 1, raw: null });
    expect(await artifactFiles()).toEqual(['held.json', 'rows.json', 'run.json']);
  });

  it('timeout → FETCH_TIMEOUT', async () => {
    const slow = fake(async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    });
    expect((await scrape(opts({ now: SATURDAY, scraper: slow }))).error_code).toBe('FETCH_TIMEOUT');
  });

  it('struktur berubah → PARSE_ERROR, raw disimpan untuk diagnosis', async () => {
    const changed = fake(async () => ({
      ...fixturePayload,
      body: JSON.stringify({ tables: '', chart, page: '<html>baru</html>' }),
    }));
    const run = await scrape(opts({ now: SATURDAY, scraper: changed }));
    expect(run).toMatchObject({ status: 'failed', error_code: 'PARSE_ERROR', exit_code: 1 });
    expect(run.raw?.file).toBe('raw.json.gz');
  });
});

describe('scrape → merge', () => {
  it('menulis CSV; run kedua di hari yang sama tidak mengubah CSV', async () => {
    await scrape(opts({ now: SATURDAY }));
    const inDir = path.join(root, 'out');
    const mergeOpts = {
      root,
      inDir,
      expected: ['ubslifestyle'] as const,
      runId: '300-1',
      origin: 'scrape' as const,
      dryRun: false,
      now: new Date('2026-10-24T03:31:00Z'),
    };
    const first = await merge({ ...mergeOpts, expected: [...mergeOpts.expected] });
    expect(first.results[0]).toMatchObject({ status: 'success', rows_inserted: 13 });
    const csvPath = path.join(root, 'data', 'prices', 'ubslifestyle', '2026.csv');
    const csv = await readFile(csvPath, 'utf8');
    const rows = readPriceCsv(csv);
    expect(rows.find((r) => r.weight_g === 1)).toMatchObject({
      date: '2026-10-24',
      variant: '2026',
      sell_price: 2_483_400,
      buyback_price: 2_288_000,
    });

    await scrape(opts({ now: new Date('2026-10-24T06:30:00Z'), runId: '301-1', slot: 'retry' }));
    const second = await merge({
      ...mergeOpts,
      expected: ['ubslifestyle'],
      runId: '301-1',
      now: new Date('2026-10-24T06:31:00Z'),
    });
    expect(second.results[0]).toMatchObject({
      rows_inserted: 0,
      rows_updated: 0,
      rows_unchanged: 13,
    });
    expect(await readFile(csvPath, 'utf8')).toBe(csv);
  });
});
