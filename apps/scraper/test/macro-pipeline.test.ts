import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { readMacroCsv, SpotSnapshot, type MacroRow } from '@gold/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MacroBackfillJob } from '../src/backfill/types';
import { backfill, type BackfillOptions } from '../src/pipeline/backfill';
import type { ScrapeRun } from '../src/pipeline/artifact';
import { merge, type MergeOptions } from '../src/pipeline/merge';
import { decideQuarantine } from '../src/pipeline/quarantine';
import { sha256, writeMacro } from '../src/pipeline/store';
import type { MacroCandidate } from '../src/pipeline/upsert';
import {
  checkXausFresh,
  validateBackfillMacro,
  validateMacro,
  type ValidateMacroInput,
} from '../src/pipeline/validate';
import { tempRoot } from './helpers';

// P2-01 (V-08–V-10) dan P2-02 (merge makro, spot.json), backfill makro end to end, karantina makro.

const NOW = new Date('2026-11-04T03:40:00Z');
const TODAY = '2026-11-04';

const fx = (date: string, value: number, over: Partial<MacroCandidate> = {}): MacroCandidate => ({
  date,
  series: 'usd_idr_jisdor',
  frequency: 'D',
  value,
  unit: 'IDR/USD',
  source: 'bi',
  ...over,
});
const gold = (date: string, value: number, over: Partial<MacroCandidate> = {}): MacroCandidate => ({
  date,
  series: 'xau_usd_oz',
  frequency: 'D',
  value,
  unit: 'USD/ozt',
  source: 'xaus',
  ...over,
});
const storedMacro = (c: MacroCandidate, over: Partial<MacroRow> = {}): MacroRow => ({
  ...c,
  scraped_at: '2026-10-24T03:31:40Z',
  run_id: '100-1',
  origin: 'scrape',
  ...over,
});

const input = (rows: MacroCandidate[], existing: MacroRow[] = []): ValidateMacroInput => ({
  rows,
  existing,
  today: TODAY,
});

function ok(result: ReturnType<typeof validateMacro>) {
  if (result.outcome !== 'ok') throw new Error(`gagal: ${result.error_message}`);
  return result;
}

describe('V-08 kurs ≤ ±5% per hari', () => {
  const prev = storedMacro(fx('2026-11-02', 16_000));

  it('tepat ±5% lolos, di atasnya → karantina PRICE_JUMP (hanya baris itu)', () => {
    const result = ok(
      validateMacro(input([fx('2026-11-03', 16_800), fx('2026-11-04', 15_000)], [prev])),
    );
    // 16.800 = +5,0% (batas, lolos); 15.000 dibanding 16.800 = −10,7% → ditahan.
    expect(result.rows.map((r) => r.date)).toEqual(['2026-11-03']);
    expect(result.held).toEqual([{ reason_code: 'PRICE_JUMP', rows: [fx('2026-11-04', 15_000)] }]);
    expect(ok(validateMacro(input([fx('2026-11-03', 15_200)], [prev]))).held).toEqual([]); // −5,0%
    expect(ok(validateMacro(input([fx('2026-11-03', 16_801)], [prev]))).held).toHaveLength(1);
    expect(ok(validateMacro(input([fx('2026-11-03', 15_199)], [prev]))).held).toHaveLength(1);
  });

  it('berlaku untuk usd_idr_ecb juga', () => {
    const p = storedMacro(fx('2026-11-02', 16_000, { series: 'usd_idr_ecb', source: 'ecb' }));
    const r = ok(
      validateMacro(
        input([fx('2026-11-03', 18_000, { series: 'usd_idr_ecb', source: 'ecb' })], [p]),
      ),
    );
    expect(r.held[0]?.reason_code).toBe('PRICE_JUMP');
  });

  it('baris pertama tanpa pendahulu lolos', () => {
    const r = ok(validateMacro(input([fx('2026-11-03', 99_999)])));
    expect(r.rows).toHaveLength(1);
    expect(r.held).toEqual([]);
  });

  it('pendahulu = baris batch sebelumnya bila seri belum punya data; satu lonjakan tidak menahan hari sesudahnya', () => {
    const r = ok(
      validateMacro(
        input([fx('2026-11-01', 16_000), fx('2026-11-02', 20_000), fx('2026-11-03', 16_100)]),
      ),
    );
    expect(r.rows.map((x) => x.date)).toEqual(['2026-11-01', '2026-11-03']);
    expect(r.held[0]?.rows.map((x) => x.date)).toEqual(['2026-11-02']);
  });

  it('frekuensi M dan A tidak diperiksa (kurs 1997 → 1998 +244%)', () => {
    const a97 = storedMacro(
      fx('1997-01-01', 2_909.38, { frequency: 'A', series: 'usd_idr_annual', source: 'wdi' }),
    );
    const r = ok(
      validateMacro(
        input(
          [
            fx('1998-01-01', 10_013.62, {
              frequency: 'A',
              series: 'usd_idr_annual',
              source: 'wdi',
            }),
          ],
          [a97],
        ),
      ),
    );
    expect(r.held).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it('baris D tidak dibandingkan dengan baris M seri yang sama', () => {
    const monthly = storedMacro(gold('2026-10-01', 1_000, { frequency: 'M', source: 'worldbank' }));
    expect(ok(validateMacro(input([gold('2026-11-03', 4_000)], [monthly]))).held).toEqual([]);
  });
});

describe('V-09 emas ≤ ±8% per hari', () => {
  const prev = storedMacro(gold('2026-11-02', 4_000));

  it('tepat ±8% lolos, di atasnya ditahan', () => {
    expect(ok(validateMacro(input([gold('2026-11-03', 4_320)], [prev]))).held).toEqual([]);
    expect(ok(validateMacro(input([gold('2026-11-03', 3_680)], [prev]))).held).toEqual([]);
    const up = ok(validateMacro(input([gold('2026-11-03', 4_321)], [prev])));
    expect(up.held).toEqual([{ reason_code: 'PRICE_JUMP', rows: [gold('2026-11-03', 4_321)] }]);
    expect(up.rows).toEqual([]);
    expect(ok(validateMacro(input([gold('2026-11-03', 3_679)], [prev]))).held).toHaveLength(1);
  });

  it('6% lolos untuk emas tetapi 6% untuk kurs ditahan', () => {
    expect(ok(validateMacro(input([gold('2026-11-03', 4_240)], [prev]))).held).toEqual([]);
    const fxPrev = storedMacro(fx('2026-11-02', 16_000));
    expect(ok(validateMacro(input([fx('2026-11-03', 16_960)], [fxPrev]))).held).toHaveLength(1);
  });

  it('baris batch menggantikan baris lama berkunci sama sebagai pembanding', () => {
    // 4.000 → revisi 11-02 menjadi 4.300 (+7,5%); 11-03 4.400 dibanding 4.300, bukan 4.000.
    const r = ok(
      validateMacro(input([gold('2026-11-02', 4_300), gold('2026-11-03', 4_400)], [prev])),
    );
    expect(r.held).toEqual([]);
  });
});

describe('V-01 / V-11 makro', () => {
  it('kunci duplikat dan nilai tidak positif → failed SCHEMA_INVALID', () => {
    const dup = validateMacro(input([fx('2026-11-03', 16_000), fx('2026-11-03', 16_001)]));
    expect(dup).toMatchObject({ outcome: 'failed', error_code: 'SCHEMA_INVALID' });
    const neg = validateMacro(input([fx('2026-11-03', -1)]));
    expect(neg).toMatchObject({ outcome: 'failed', error_code: 'SCHEMA_INVALID' });
  });

  it('> 20 revisi bertanggal < kemarin → seluruh batch MASS_REVISION', () => {
    const dates = Array.from({ length: 21 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    const existing = dates.map((d) => storedMacro(fx(d, 16_000)));
    const rows = dates.map((d) => fx(d, 16_001));
    const r = ok(validateMacro(input(rows, existing)));
    expect(r.rows).toEqual([]);
    expect(r.held).toEqual([{ reason_code: 'MASS_REVISION', rows }]);
    expect(ok(validateMacro(input(rows.slice(0, 20), existing))).rows).toHaveLength(20);
  });

  it('backfill: tanpa V-08/V-09, tetapi seri/penyedia harus sama dengan job', () => {
    const expected = { series: 'usd_idr_jisdor', source: 'bi' } as const;
    const jumpy = [fx('2026-11-01', 8_000), fx('2026-11-02', 16_000)];
    expect(validateBackfillMacro(jumpy, expected)).toMatchObject({ outcome: 'ok', held: [] });
    expect(validateBackfillMacro([], expected)).toMatchObject({ error_code: 'VALIDATION_FAILED' });
    expect(validateBackfillMacro([gold('2026-11-01', 4_000)], expected)).toMatchObject({
      error_code: 'VALIDATION_FAILED',
    });
  });
});

describe('V-10 respons xaus tidak basi', () => {
  it('histori fresh dan spot stale=false → null', () => {
    expect(checkXausFresh({ historyStatus: 'fresh', spotStale: false })).toBeNull();
    expect(checkXausFresh({ historyStatus: 'fresh' })).toBeNull();
    expect(checkXausFresh({ spotStale: false })).toBeNull();
  });

  it('histori bukan fresh atau hilang → STALE_SOURCE', () => {
    for (const historyStatus of ['stale', 'delayed', '', null]) {
      expect(checkXausFresh({ historyStatus, spotStale: false })).toMatchObject({
        outcome: 'failed',
        error_code: 'STALE_SOURCE',
      });
    }
  });

  it('spot stale=true → STALE_SOURCE', () => {
    expect(checkXausFresh({ historyStatus: 'fresh', spotStale: true })).toMatchObject({
      outcome: 'failed',
      error_code: 'STALE_SOURCE',
    });
  });
});

// ── merge makro ─────────────────────────────────────────────────────────────

let root: string;
let inDir: string;
beforeEach(async () => {
  root = await tempRoot();
  inDir = path.join(root, 'out');
});

const SPOT: SpotSnapshot = {
  fetched_at: '2026-11-04T03:30:00Z',
  xau_usd_oz: 4125.3,
  usd_idr: 16310,
  usd_idr_series: 'usd_idr_jisdor',
  usd_idr_date: '2026-11-04',
  source: 'xaus',
  stale: false,
};

interface MacroArtifactSpec {
  source?: 'xaus' | 'jisdor' | 'worldbank';
  rows?: MacroCandidate[];
  held?: { reason_code: 'PRICE_JUMP' | 'MASS_REVISION'; rows: MacroCandidate[] }[];
  spot?: SpotSnapshot;
  slot?: ScrapeRun['slot'];
  raw?: { body: string | Buffer; ext: 'json' | 'xlsx' } | null;
  extra?: Partial<ScrapeRun>;
}

async function writeMacroArtifact(spec: MacroArtifactSpec = {}) {
  const source = spec.source ?? 'xaus';
  const dir = path.join(inDir, `out-${source}`);
  await mkdir(dir, { recursive: true });
  const rows = spec.rows ?? [gold('2026-11-03', 4_100)];
  const held = spec.held ?? [];
  const nHeld = held.reduce((n, b) => n + b.rows.length, 0);
  const raw = spec.raw === undefined ? { body: '{"points":[]}', ext: 'json' as const } : spec.raw;
  if (raw) await writeFile(path.join(dir, `raw.${raw.ext}.gz`), gzipSync(raw.body));
  const run: ScrapeRun = {
    run_id: '200-1',
    source,
    kind: 'macro',
    workflow: 'scrape-macro',
    trigger: 'schedule',
    slot: spec.slot ?? 'primary',
    started_at: '2026-11-04T03:30:00Z',
    finished_at: '2026-11-04T03:30:09Z',
    status: 'success',
    error_code: null,
    error_message: null,
    data_date: '2026-11-03',
    rows_parsed: rows.length + nHeld,
    rows_held: nHeld,
    rows_rejected: 0,
    parser_version: `${source}@1.0.0`,
    expected_day: true,
    exit_code: 0,
    raw: raw
      ? {
          file: `raw.${raw.ext}.gz`,
          ext: raw.ext,
          fetched_at: '2026-11-04T03:30:01Z',
          sha256: sha256(raw.body),
        }
      : null,
    ...spec.extra,
  };
  await writeFile(path.join(dir, 'run.json'), JSON.stringify(run));
  await writeFile(path.join(dir, 'rows.json'), JSON.stringify(rows));
  await writeFile(path.join(dir, 'held.json'), JSON.stringify(held));
  if (spec.spot) await writeFile(path.join(dir, 'spot.json'), JSON.stringify(spec.spot));
}

const mergeOpts = (over: Partial<MergeOptions> = {}): MergeOptions => ({
  root,
  inDir,
  expected: ['xaus'],
  runId: '200-1',
  origin: 'scrape',
  dryRun: false,
  now: NOW,
  ...over,
});

const read = (rel: string) => readFile(path.join(root, ...rel.split('/')), 'utf8');
const macroCsv = async (series = 'xau_usd_oz') =>
  readMacroCsv(await read(`data/macro/${series}.csv`));
const readJsonl = async (rel: string) =>
  (await read(rel).catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

describe('merge — baris makro', () => {
  it('insert: CSV terurut menurut kunci, RUN, commit message, tanpa spot.json bila tidak ada', async () => {
    await writeMacroArtifact({ rows: [gold('2026-11-03', 4_100.5), gold('2026-11-02', 4_050)] });
    const summary = await merge(mergeOpts());
    expect(summary.results[0]).toMatchObject({
      source: 'xaus',
      status: 'success',
      rows_inserted: 2,
      rows_updated: 0,
      rows_unchanged: 0,
      revisions: 0,
    });
    expect(summary.commit_message).toBe('data: 2026-11-04 xaus✓ +2 ~0');
    expect(summary.changed_paths).toContain('data/macro/xau_usd_oz.csv');
    expect(summary.changed_paths).not.toContain('data/macro/spot.json');
    const csv = await read('data/macro/xau_usd_oz.csv');
    expect(csv.split('\n')[0]).toBe(
      'date,series,frequency,value,unit,source,scraped_at,run_id,origin',
    );
    expect((await macroCsv()).map((r) => [r.date, r.value, r.origin, r.run_id])).toEqual([
      ['2026-11-02', 4050, 'scrape', '200-1'],
      ['2026-11-03', 4100.5, 'scrape', '200-1'],
    ]);
    expect(await readJsonl('data/meta/runs/2026.jsonl')).toEqual([
      expect.objectContaining({ source: 'xaus', rows_inserted: 2, rows_parsed: 2 }),
    ]);
    await expect(read('data/macro/spot.json')).rejects.toThrow();
  });

  it('unchanged: nilai sama tidak disentuh (scraped_at/run_id lama) dan file tidak berubah', async () => {
    const old = storedMacro(gold('2026-11-03', 4_100));
    await writeMacro(root, 'xau_usd_oz', [old]);
    const before = await read('data/macro/xau_usd_oz.csv');
    await writeMacroArtifact();
    const summary = await merge(mergeOpts());
    expect(summary.results[0]).toMatchObject({ rows_inserted: 0, rows_unchanged: 1 });
    expect(summary.changed_paths).not.toContain('data/macro/xau_usd_oz.csv');
    expect(await read('data/macro/xau_usd_oz.csv')).toBe(before);
    expect((await macroCsv())[0]).toEqual(old);
  });

  it('update: nilai berbeda → baris diperbarui + REVISION per kolom (table macro, row_key date|series|frequency)', async () => {
    await writeMacro(root, 'xau_usd_oz', [storedMacro(gold('2026-11-03', 4_090))]);
    await writeMacroArtifact();
    const summary = await merge(mergeOpts());
    expect(summary.results[0]).toMatchObject({ rows_updated: 1, revisions: 1 });
    expect(await macroCsv()).toEqual([
      expect.objectContaining({ value: 4100, run_id: '200-1', scraped_at: '2026-11-04T03:40:00Z' }),
    ]);
    expect(await readJsonl('data/meta/revisions/2026.jsonl')).toEqual([
      {
        table: 'macro',
        row_key: '2026-11-03|xau_usd_oz|D',
        field: 'value',
        old_value: '4090',
        new_value: '4100',
        run_id: '200-1',
        revised_at: '2026-11-04T03:40:00Z',
        reason: 'source_changed',
      },
    ]);
  });

  it('seri dan frekuensi berbeda tidak saling menimpa (D dan M tanggal sama)', async () => {
    await writeMacro(root, 'xau_usd_oz', [
      storedMacro(gold('2026-10-01', 3_900, { frequency: 'M', source: 'worldbank' })),
    ]);
    await writeMacroArtifact({ rows: [gold('2026-10-01', 3_950)] });
    await merge(mergeOpts());
    expect((await macroCsv()).map((r) => [r.date, r.frequency, r.value])).toEqual([
      ['2026-10-01', 'D', 3950],
      ['2026-10-01', 'M', 3900],
    ]);
  });

  it('batch karantina PRICE_JUMP ditulis ke data/quarantine/{source}/, baris lain masuk, status partial', async () => {
    const jump = gold('2026-11-03', 9_000);
    await writeMacroArtifact({
      rows: [gold('2026-11-02', 4_000)],
      held: [{ reason_code: 'PRICE_JUMP', rows: [jump] }],
    });
    const summary = await merge(mergeOpts());
    expect(summary.results[0]).toMatchObject({
      status: 'partial',
      rows_inserted: 1,
      rows_held: 1,
      quarantine_paths: ['data/quarantine/xaus/2026-11-03-200-1.json'],
    });
    expect((await macroCsv()).map((r) => r.date)).toEqual(['2026-11-02']);
    const batch = JSON.parse(await read('data/quarantine/xaus/2026-11-03-200-1.json'));
    expect(batch).toMatchObject({
      reason_code: 'PRICE_JUMP',
      decision: 'pending',
      rows: [expect.objectContaining({ value: 9000, origin: 'scrape', series: 'xau_usd_oz' })],
    });
  });

  it('spot.json ditimpa dengan SPOT_SNAPSHOT yang valid dan masuk changed_paths', async () => {
    await mkdir(path.join(root, 'data/macro'), { recursive: true });
    await writeFile(path.join(root, 'data/macro/spot.json'), '{"lama":true}');
    await writeMacroArtifact({ spot: SPOT });
    const summary = await merge(mergeOpts());
    expect(summary.changed_paths).toContain('data/macro/spot.json');
    expect(SpotSnapshot.parse(JSON.parse(await read('data/macro/spot.json')))).toEqual(SPOT);
  });

  it('dry run tidak menulis CSV maupun spot.json', async () => {
    await writeMacroArtifact({ spot: SPOT });
    const summary = await merge(mergeOpts({ dryRun: true }));
    expect(summary.changed_paths).toEqual(
      expect.arrayContaining(['data/macro/xau_usd_oz.csv', 'data/macro/spot.json']),
    );
    expect(await readdir(path.join(root, 'data/macro')).catch(() => [])).toEqual([]);
  });

  it('spot.json yang tidak lolos skema → merge gagal sebelum menulis apa pun', async () => {
    await writeMacroArtifact({ spot: { ...SPOT, xau_usd_oz: -1 } });
    await expect(merge(mergeOpts())).rejects.toThrow(/spot\.json tidak valid/);
  });
});

// ── backfill makro end to end ───────────────────────────────────────────────

const HISTORY = [
  fx('2013-05-20', 9_760, { frequency: 'D' }),
  fx('2013-05-21', 9_770),
  fx('2013-05-22', 9_780),
];

const fakeMacroJob = (
  rows: MacroCandidate[] = HISTORY,
  over: Partial<MacroBackfillJob> = {},
): MacroBackfillJob => ({
  id: 'jisdor',
  kind: 'macro',
  series: 'usd_idr_jisdor',
  source: 'bi',
  scraper: 'jisdor',
  parserVersion: 'jisdor@0.0.0-test',
  fetchRaw: async () => ({
    body: JSON.stringify(rows),
    contentType: 'application/json',
    fetchedAt: '2026-11-04T03:00:00Z',
  }),
  parse: (raw) => ({
    rows: JSON.parse(raw.body),
    dataDate: null,
    sourceUpdatedAt: null,
    stale: null,
  }),
  ...over,
});

const bfOpts = (over: Partial<BackfillOptions> = {}): BackfillOptions => ({
  root,
  job: fakeMacroJob(),
  out: path.join(inDir, 'backfill'),
  runId: '500-1',
  userAgent: 'test',
  now: NOW,
  ...over,
});

describe('backfill makro', () => {
  it('artifact run.kind macro, source = scraper job, data_date = tanggal terakhir', async () => {
    const run = await backfill(bfOpts());
    expect(run).toMatchObject({
      source: 'jisdor',
      kind: 'macro',
      workflow: 'backfill',
      slot: 'backfill',
      status: 'success',
      rows_parsed: 3,
      rows_held: 0,
      rows_rejected: 0,
      data_date: '2013-05-22',
      exit_code: 0,
    });
    expect(JSON.parse(await read('out/backfill/rows.json'))).toHaveLength(3);
  });

  it('--from/--to menyaring rentang; di luar rentang dihitung ditolak', async () => {
    const run = await backfill(bfOpts({ from: '2013-05-21', to: '2013-05-21' }));
    expect(run).toMatchObject({ rows_parsed: 3, rows_rejected: 2 });
    expect(JSON.parse(await read('out/backfill/rows.json'))).toEqual([HISTORY[1]]);
  });

  it('baris dengan seri lain dari job, rentang kosong, atau fetch gagal → failed, kode 1', async () => {
    const stray = await backfill(bfOpts({ job: fakeMacroJob([gold('2013-05-20', 1_400)]) }));
    expect(stray).toMatchObject({
      status: 'failed',
      error_code: 'VALIDATION_FAILED',
      exit_code: 1,
    });
    expect(await backfill(bfOpts({ from: '2030-01-01' }))).toMatchObject({ status: 'failed' });
    const blocked = fakeMacroJob(HISTORY, {
      fetchRaw: async () => {
        throw new Error('boom');
      },
    });
    expect(await backfill(bfOpts({ job: blocked }))).toMatchObject({ status: 'failed' });
  });

  it('end to end: backfill → merge --origin backfill menulis CSV, lalu idempoten dan REVISION bila nilai berubah', async () => {
    await writeMacro(root, 'usd_idr_jisdor', [
      storedMacro(fx('2013-05-20', 9_760)), // sama
      storedMacro(fx('2013-05-21', 9_755)), // berbeda → revisi
    ]);
    await backfill(bfOpts());
    const summary = await merge(mergeOpts({ expected: [], runId: '500-1', origin: 'backfill' }));
    expect(summary.results[0]).toMatchObject({
      source: 'jisdor',
      status: 'success',
      slot: 'backfill',
      rows_inserted: 1,
      rows_updated: 1,
      rows_unchanged: 1,
      revisions: 1,
    });
    expect(summary.commit_message).toBe('data: 2026-11-04 jisdor✓ +1 ~1');
    const rows = await macroCsv('usd_idr_jisdor');
    expect(rows.map((r) => [r.date, r.value, r.origin])).toEqual([
      ['2013-05-20', 9760, 'scrape'],
      ['2013-05-21', 9770, 'backfill'],
      ['2013-05-22', 9780, 'backfill'],
    ]);
    expect(await readJsonl('data/meta/revisions/2026.jsonl')).toEqual([
      expect.objectContaining({
        table: 'macro',
        row_key: '2013-05-21|usd_idr_jisdor|D',
        old_value: '9755',
        new_value: '9770',
      }),
    ]);
    // Status harian sumber tidak disentuh oleh backfill.
    await expect(read('data/meta/status.json')).resolves.toBe('{}\n');
    const second = await merge(mergeOpts({ expected: [], runId: '500-2', origin: 'backfill' }));
    expect(second.results[0]).toMatchObject({ rows_unchanged: 3, rows_inserted: 0 });
  });

  it('raw XLSX (octet-stream base64) disimpan sebagai byte asli berekstensi xlsx dan lolos cek sha256 merge', async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 250]);
    const job = fakeMacroJob(HISTORY, {
      fetchRaw: async () => ({
        body: bytes.toString('base64'),
        contentType: 'application/octet-stream',
        fetchedAt: '2026-11-04T03:00:00Z',
      }),
      parse: () => ({ rows: HISTORY, dataDate: null, sourceUpdatedAt: null, stale: null }),
    });
    const run = await backfill(bfOpts({ job }));
    expect(run.raw).toMatchObject({ file: 'raw.xlsx.gz', ext: 'xlsx', sha256: sha256(bytes) });
    const summary = await merge(mergeOpts({ expected: [], runId: '500-1', origin: 'backfill' }));
    expect(summary.changed_paths.some((p) => /^data\/raw\/jisdor\/.*\.xlsx\.gz$/.test(p))).toBe(
      true,
    );
  });
});

// ── karantina makro ─────────────────────────────────────────────────────────

describe('quarantine — batch makro', () => {
  const FILE = '2026-11-03-300-1.json';
  const REL = `data/quarantine/xaus/${FILE}`;
  const jump = (over: Record<string, unknown> = {}) => ({
    ...gold('2026-11-03', 4_500),
    scraped_at: '2026-11-04T03:30:00Z',
    run_id: '300-1',
    origin: 'scrape',
    ...over,
  });

  async function seed(existing: MacroRow[], rows: unknown[] = [jump()], reason = 'PRICE_JUMP') {
    await writeMacro(root, 'xau_usd_oz', existing);
    const file = path.join(root, ...REL.split('/'));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        run_id: '300-1',
        source: 'xaus',
        reason_code: reason,
        rows,
        decision: 'pending',
      }),
    );
  }
  const decide = (decision: 'approve' | 'reject') =>
    decideQuarantine({
      root,
      path: REL,
      decision,
      decidedBy: 'hafidz',
      runId: '400-1',
      now: NOW,
    });

  it('approve: baris masuk CSV, REVISION quarantine_approved, file pindah ke _resolved', async () => {
    await seed([storedMacro(gold('2026-11-02', 4_000))]);
    const result = await decide('approve');
    expect(result).toMatchObject({
      decision: 'approve',
      rows_inserted: 1,
      rows_updated: 0,
      revisions: 1,
      remaining: 0,
      commit_message: `data: karantina approve xaus/${FILE} +1 ~0`,
    });
    expect((await macroCsv()).map((r) => [r.date, r.value])).toEqual([
      ['2026-11-02', 4000],
      ['2026-11-03', 4500],
    ]);
    expect(await readJsonl('data/meta/revisions/2026.jsonl')).toEqual([
      expect.objectContaining({
        table: 'macro',
        row_key: '2026-11-03|xau_usd_oz|D',
        field: 'value',
        old_value: '',
        new_value: '4500',
        reason: 'quarantine_approved',
      }),
    ]);
    await expect(read(REL)).rejects.toThrow();
    expect(JSON.parse(await read(`data/quarantine/_resolved/xaus/${FILE}`))).toMatchObject({
      decision: 'approved',
      decided_by: 'hafidz',
    });
  });

  it('approve baris yang memperbarui nilai lama → updated + revisi old/new', async () => {
    await seed([storedMacro(gold('2026-11-03', 4_100))]);
    const result = await decide('approve');
    expect(result).toMatchObject({ rows_inserted: 0, rows_updated: 1 });
    expect(await readJsonl('data/meta/revisions/2026.jsonl')).toEqual([
      expect.objectContaining({ old_value: '4100', new_value: '4500' }),
    ]);
  });

  it('batch non-PRICE_JUMP yang masih melompat ditolak (V-08/V-09 diperiksa ulang)', async () => {
    await seed([storedMacro(gold('2026-11-02', 4_000))], [jump({ value: 9_000 })], 'MASS_REVISION');
    await expect(decide('approve')).rejects.toThrow(/V-08\/V-09/);
    await expect(read(REL)).resolves.toContain('pending');
  });

  it('reject: tidak menulis CSV, file pindah ke _resolved', async () => {
    await seed([storedMacro(gold('2026-11-02', 4_000))]);
    const result = await decide('reject');
    expect(result).toMatchObject({ decision: 'reject', rows_inserted: 0, revisions: 0 });
    expect((await macroCsv()).map((r) => r.date)).toEqual(['2026-11-02']);
    await expect(read(`data/quarantine/_resolved/xaus/${FILE}`)).resolves.toContain('rejected');
  });
});
