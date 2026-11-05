import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MacroRow, readMacroCsv } from '@gold/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackfillJob } from '../src/backfill';
import { xaus as xausBackfill, parseXausHistory } from '../src/backfill/xaus';
import { backfill } from '../src/pipeline/backfill';
import { ScrapeError } from '../src/pipeline/errors';
import { merge } from '../src/pipeline/merge';
import { writeMacro } from '../src/pipeline/store';
import type { RawPayload } from '../src/sources/types';
import { tempRoot } from './helpers';

// P2-07 — backfill histori xaus (TECH-SPEC §5.4/§5.6) dengan fixture P0-10 dan fetch palsu.

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/xaus');
const history = readFileSync(path.join(DIR, 'history-last15-2026-10-25.json'), 'utf8');
const raw = (over: { history?: string; today?: string } = {}): RawPayload => ({
  body: JSON.stringify({ today: '2026-10-26', history, ...over }),
  contentType: 'application/json',
  fetchedAt: '2026-10-26T09:40:05Z',
});
const withStatus = (status: unknown) =>
  JSON.stringify({ ...JSON.parse(history), data_state: { status } });
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof ScrapeError) return err.code;
    throw err;
  }
  return 'tidak melempar';
};

afterEach(() => vi.unstubAllGlobals());

describe('xaus backfill (P2-07)', () => {
  it('seluruh histori sampai kemarin: tanpa jendela 10 hari, tanpa spot', () => {
    const r = parseXausHistory(raw());
    expect(r.rows).toHaveLength(JSON.parse(history).points.length);
    expect(r.rows[0]).toEqual({
      date: '2026-10-05',
      series: 'xau_usd_oz',
      frequency: 'D',
      value: 4156.8,
      unit: 'USD/ozt',
      source: 'xaus',
    });
    expect(r.dataDate).toBe('2026-10-23');
    expect(r.spot).toBeUndefined();
    expect(r.rows.map((x) => x.date)).toEqual(r.rows.map((x) => x.date).sort());
  });

  it('hari berjalan tidak diambil (belum final)', () => {
    expect(parseXausHistory(raw({ today: '2026-10-23' })).rows.at(-1)?.date).toBe('2026-10-22');
  });

  it('baris lolos skema MacroRow setelah kolom pipeline diisi', () => {
    for (const row of parseXausHistory(raw()).rows) {
      const full = {
        ...row,
        scraped_at: '2026-10-26T09:40:05Z',
        run_id: '1-1',
        origin: 'backfill',
      };
      expect(MacroRow.safeParse(full).success).toBe(true);
    }
  });

  it('V-10 dan bentuk respons: tidak fresh → STALE_SOURCE; titik rusak/kosong → PARSE_ERROR', () => {
    expect(codeOf(() => parseXausHistory(raw({ history: withStatus('stale') })))).toBe(
      'STALE_SOURCE',
    );
    expect(codeOf(() => parseXausHistory(raw({ history: withStatus(undefined) })))).toBe(
      'STALE_SOURCE',
    );
    const bad = JSON.stringify({ ...JSON.parse(history), points: [{ d: '2026-10-22', c: 0 }] });
    expect(codeOf(() => parseXausHistory(raw({ history: bad })))).toBe('PARSE_ERROR');
    expect(codeOf(() => parseXausHistory(raw({ history: '<html>' })))).toBe('PARSE_ERROR');
    expect(codeOf(() => parseXausHistory(raw({ today: '2020-01-01' })))).toBe('PARSE_ERROR');
  });

  it('fetchRaw: satu request ke /history (tanpa spot), tanggal sasaran dari jam Jakarta', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL) => {
      calls.push(String(input));
      return new Response(history, { headers: { 'content-type': 'application/json' } });
    });
    const payload = await xausBackfill.fetchRaw({
      root: '',
      runId: '1-1',
      userAgent: 'test',
      now: new Date('2026-11-05T18:00:00Z'), // 6 Nov 01.00 WIB
      retryDelayMs: 0,
    });
    expect(calls).toEqual(['https://xaus.com/api/v1/history']);
    expect(JSON.parse(payload.body).today).toBe('2026-11-06');
    expect(xausBackfill).toMatchObject({ kind: 'macro', series: 'xau_usd_oz', source: 'xaus' });
    expect(getBackfillJob('xaus')).toBe(xausBackfill);
  });

  describe('bersama baris yang sudah ada di CSV', () => {
    let root: string;
    beforeEach(async () => {
      root = await tempRoot();
    });
    const stored = (date: string, value: number, frequency: 'D' | 'M' = 'D'): MacroRow => ({
      date,
      series: 'xau_usd_oz',
      frequency,
      value,
      unit: 'USD/ozt',
      source: frequency === 'D' ? 'xaus' : 'worldbank',
      scraped_at: '2026-10-24T03:31:40Z',
      run_id: '100-1',
      origin: frequency === 'D' ? 'scrape' : 'backfill',
    });

    it('kunci sama = unchanged/update (REVISION), tidak ganda; baris M World Bank tak tersentuh', async () => {
      await writeMacro(root, 'xau_usd_oz', [
        stored('2026-10-01', 4105, 'M'),
        stored('2026-10-05', 4156.8), // sama dengan backfill
        stored('2026-10-06', 4100), // berbeda → revisi
      ]);
      const out = path.join(root, 'out', 'xaus');
      const job = { ...xausBackfill, fetchRaw: async () => raw() };
      const ok = await backfill({
        root,
        job,
        out,
        runId: '600-2',
        userAgent: 'test',
        now: new Date('2026-10-26T09:40:00Z'),
      });
      expect(ok).toMatchObject({
        status: 'success',
        source: 'xaus',
        kind: 'macro',
        rows_parsed: 15,
      });
      const summary = await merge({
        root,
        inDir: path.join(root, 'out'),
        expected: [],
        runId: '600-2',
        origin: 'backfill',
        dryRun: false,
        now: new Date('2026-10-26T09:41:00Z'),
      });
      expect(summary.results[0]).toMatchObject({
        rows_inserted: 13,
        rows_updated: 1,
        rows_unchanged: 1,
      });
      const rows = readMacroCsv(
        await readFile(path.join(root, 'data/macro/xau_usd_oz.csv'), 'utf8'),
      );
      expect(rows).toHaveLength(16); // 1 M + 15 D
      expect(new Set(rows.map((r) => `${r.date}|${r.frequency}`)).size).toBe(16);
      expect(rows.find((r) => r.frequency === 'M')).toMatchObject({ value: 4105, run_id: '100-1' });
      expect(rows.find((r) => r.date === '2026-10-06')).toMatchObject({ value: 4187.1 });
    });
  });
});
