import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readPriceCsv, type PriceRow } from '@gold/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { BACKFILL_JOB_IDS } from '../src/backfill';
import type { BackfillJob } from '../src/backfill/types';
import { EXIT, main } from '../src/main';
import { backfill, type BackfillOptions } from '../src/pipeline/backfill';
import { ScrapeError } from '../src/pipeline/errors';
import { merge } from '../src/pipeline/merge';
import { writePrices, writeStatusFile } from '../src/pipeline/store';
import { candidate, ROOT, stored, tempRoot } from './helpers';

// Kerangka backfill (P1-13) dengan job palsu: buyback 1 g UBS tiga tanggal lampau.

const NOW = new Date('2026-10-31T15:00:00Z');
const HISTORY = [
  candidate({ date: '2026-10-20', variant: '', sell_price: null, buyback_price: 2_250_000 }),
  candidate({ date: '2026-10-21', variant: '', sell_price: null, buyback_price: 2_260_000 }),
  candidate({ date: '2026-10-22', variant: '', sell_price: null, buyback_price: 2_270_000 }),
];

const fakeJob = (rows = HISTORY, fetchRaw?: BackfillJob['fetchRaw']): BackfillJob => ({
  id: 'ubs-history',
  source: 'ubslifestyle',
  parserVersion: 'ubs-history@0.0.0-test',
  fetchRaw:
    fetchRaw ??
    (async () => ({
      body: JSON.stringify(rows),
      contentType: 'application/json',
      fetchedAt: '2026-10-31T15:00:00Z',
    })),
  parse: (raw) => ({
    rows: JSON.parse(raw.body),
    dataDate: null,
    sourceUpdatedAt: null,
    stale: null,
  }),
});

let root: string;
let inDir: string;
beforeEach(async () => {
  root = await tempRoot();
  inDir = path.join(root, 'out');
});

const opts = (over: Partial<BackfillOptions> = {}): BackfillOptions => ({
  root,
  job: fakeJob(),
  out: path.join(inDir, 'backfill'),
  runId: '500-1',
  userAgent: 'test',
  now: NOW,
  ...over,
});

const prices = async () =>
  readPriceCsv(await readFile(path.join(root, 'data/prices/ubslifestyle/2026.csv'), 'utf8'));
const readJsonl = async (rel: string) =>
  (await readFile(path.join(root, rel), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

describe('backfill', () => {
  it('artifact berkontrak sama dengan scrape: slot backfill, data_date = tanggal terakhir', async () => {
    const run = await backfill(opts());
    expect(run).toMatchObject({
      source: 'ubslifestyle',
      workflow: 'backfill',
      slot: 'backfill',
      status: 'success',
      data_date: '2026-10-22',
      rows_parsed: 3,
      rows_rejected: 0,
      exit_code: 0,
      parser_version: 'ubs-history@0.0.0-test',
    });
    const rows = JSON.parse(await readFile(path.join(opts().out, 'rows.json'), 'utf8'));
    expect(rows).toHaveLength(3);
  });

  it('--from/--to menyaring rentang; sisanya dihitung ditolak', async () => {
    const run = await backfill(opts({ from: '2026-10-21', to: '2026-10-21' }));
    expect(run).toMatchObject({ rows_parsed: 3, rows_rejected: 2, data_date: '2026-10-21' });
  });

  it('gramasi di luar katalog → partial, baris ditahan UNKNOWN_ITEM', async () => {
    const odd = candidate({ date: '2026-10-22', variant: '', weight_g: 7, sell_price: null });
    const run = await backfill(opts({ job: fakeJob([...HISTORY, odd]) }));
    expect(run).toMatchObject({ status: 'partial', rows_held: 1, exit_code: 0 });
  });

  it('rentang kosong, V-03, atau fetch gagal → failed, kode 1', async () => {
    const empty = await backfill(opts({ from: '2027-01-01' }));
    expect(empty).toMatchObject({
      status: 'failed',
      error_code: 'VALIDATION_FAILED',
      exit_code: 1,
    });

    const bad = candidate({ date: '2026-10-20', sell_price: 2_000_000, buyback_price: 2_100_000 });
    expect((await backfill(opts({ job: fakeJob([bad]) }))).error_message).toMatch(/V-03/);

    const blocked = fakeJob(HISTORY, async () => {
      throw new ScrapeError('BLOCKED', 'HTTP 403');
    });
    expect(await backfill(opts({ job: blocked }))).toMatchObject({
      status: 'failed',
      error_code: 'BLOCKED',
      raw: null,
    });
  });

  it('merge --origin backfill: origin backfill, nilai sama tidak disentuh, beda → REVISION, status harian utuh', async () => {
    const existing: PriceRow = stored({
      date: '2026-10-21',
      variant: '',
      sell_price: null,
      buyback_price: 2_255_000, // berbeda dari histori (2.260.000)
    });
    const same: PriceRow = stored({ ...HISTORY[0]!, scraped_at: '2026-10-20T03:30:00Z' });
    await writePrices(root, 'ubslifestyle', [same, existing], ['2026']);
    const status = {
      ubslifestyle: {
        last_run_id: '400-1',
        last_status: 'success' as const,
        last_success_at: '2026-10-31T09:48:36Z',
        last_data_date: '2026-10-31',
        consecutive_failures: 0,
        updated_at: '2026-10-31T09:49:11Z',
      },
    };
    await writeStatusFile(root, status);

    await backfill(opts());
    const summary = await merge({
      root,
      inDir,
      expected: [],
      runId: '500-1',
      origin: 'backfill',
      dryRun: false,
      now: NOW,
    });
    expect(summary.results[0]).toMatchObject({
      rows_inserted: 1,
      rows_updated: 1,
      rows_unchanged: 1,
      revisions: 1,
    });
    const rows = await prices();
    expect(rows.find((r) => r.date === '2026-10-20')).toEqual(same);
    expect(rows.find((r) => r.date === '2026-10-22')).toMatchObject({ origin: 'backfill' });
    expect(await readJsonl('data/meta/revisions/2026.jsonl')).toEqual([
      expect.objectContaining({
        field: 'buyback_price',
        old_value: '2255000',
        new_value: '2260000',
        reason: 'source_changed',
      }),
    ]);
    expect(await readJsonl('data/meta/runs/2026.jsonl')).toEqual([
      expect.objectContaining({ slot: 'backfill', workflow: 'backfill', status: 'success' }),
    ]);
    const after = JSON.parse(await readFile(path.join(root, 'data/meta/status.json'), 'utf8'));
    expect(after).toEqual(status);
  });
});

describe('job backfill', () => {
  it('BACKFILL_JOB_IDS sama dengan pilihan job di backfill.yml', async () => {
    const yml = parseYaml(
      await readFile(path.join(ROOT, '.github/workflows/backfill.yml'), 'utf8'),
    ) as { on: { workflow_dispatch: { inputs: { job: { options: string[] } } } } };
    expect(yml.on.workflow_dispatch.inputs.job.options).toEqual([...BACKFILL_JOB_IDS]);
  });

  describe('cli', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    afterEach(() => error.mockClear());

    it('job belum diimplementasikan → kode 2 dengan nama tugas', async () => {
      const out = path.join(root, 'out', 'backfill');
      expect(await main(['backfill', '--job', 'ubs-history', '--root', root, '--out', out])).toBe(
        EXIT.USAGE,
      );
      expect(error.mock.calls.join('\n')).toContain('belum diimplementasikan (P1-09)');
    });

    it('argumen tidak valid → kode 2', async () => {
      const out = path.join(root, 'out', 'backfill');
      const run = (...args: string[]) => main(['backfill', '--root', root, '--out', out, ...args]);
      expect(await run('--job', 'nope')).toBe(EXIT.USAGE);
      expect(await run('--job', 'xaus', '--from', '31-10-2026')).toBe(EXIT.USAGE);
      expect(await run('--job', 'xaus', '--from', '2026-10-31', '--to', '2026-10-01')).toBe(
        EXIT.USAGE,
      );
    });
  });
});
