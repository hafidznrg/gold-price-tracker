import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { readPriceCsv, RunRecord, type ScraperId } from '@gold/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ScrapeRun } from '../src/pipeline/artifact';
import { commitMessage, merge, type MergeOptions } from '../src/pipeline/merge';
import type { HeldBatch } from '../src/pipeline/validate';
import type { Candidate } from '../src/pipeline/upsert';
import { sha256 } from '../src/pipeline/store';
import { candidate, tempRoot, ubsDay } from './helpers';

const NOW = new Date('2026-10-26T03:40:00Z'); // 10.40 WIB

let root: string;
let inDir: string;

beforeEach(async () => {
  root = await tempRoot();
  inDir = path.join(root, 'out');
});

interface ArtifactSpec {
  source?: ScraperId;
  status?: ScrapeRun['status'];
  rows?: Candidate[];
  held?: HeldBatch[];
  raw?: string | null;
  fetchedAt?: string;
  extra?: Partial<ScrapeRun>;
}

async function writeArtifact(spec: ArtifactSpec = {}) {
  const source = spec.source ?? 'ubslifestyle';
  const dir = path.join(inDir, `out-${source}`);
  await mkdir(dir, { recursive: true });
  const rows = spec.rows ?? ubsDay('2026-10-26');
  const held = spec.held ?? [];
  const status = spec.status ?? 'success';
  const writes = status === 'success' || status === 'partial';
  const nHeld = held.reduce((n, b) => n + b.rows.length, 0);
  const raw = spec.raw === undefined ? '{"tables":"<table></table>","chart":"[]"}' : spec.raw;
  if (raw !== null) await writeFile(path.join(dir, 'raw.json.gz'), gzipSync(raw));
  const run: ScrapeRun = {
    run_id: '200-1',
    source,
    workflow: 'scrape-retail',
    trigger: 'schedule',
    slot: 'primary',
    started_at: '2026-10-26T03:30:00Z',
    finished_at: '2026-10-26T03:30:09Z',
    status,
    error_code: status === 'failed' ? 'PARSE_ERROR' : null,
    error_message: status === 'failed' ? 'tidak ada <table> harga' : null,
    data_date: '2026-10-26',
    rows_parsed: rows.length + nHeld,
    rows_held: nHeld,
    rows_rejected: writes ? 0 : rows.length,
    parser_version: 'ubslifestyle@1.0.0',
    expected_day: true,
    exit_code: status === 'failed' ? 1 : 0,
    raw:
      raw === null
        ? null
        : {
            file: 'raw.json.gz',
            ext: 'json',
            fetched_at: spec.fetchedAt ?? '2026-10-26T03:30:01Z',
            sha256: sha256(raw),
          },
    ...spec.extra,
  };
  await writeFile(path.join(dir, 'run.json'), JSON.stringify(run));
  await writeFile(path.join(dir, 'rows.json'), JSON.stringify(writes ? rows : []));
  await writeFile(path.join(dir, 'held.json'), JSON.stringify(writes ? held : []));
}

const opts = (over: Partial<MergeOptions> = {}): MergeOptions => ({
  root,
  inDir,
  expected: ['ubslifestyle'],
  runId: '200-1',
  origin: 'scrape',
  dryRun: false,
  now: NOW,
  ...over,
});

const read = (rel: string) => readFile(path.join(root, ...rel.split('/')), 'utf8');
const prices = async () => readPriceCsv(await read('data/prices/ubslifestyle/2026.csv'));
const runs = async () =>
  (await read('data/meta/runs/2026.jsonl'))
    .trim()
    .split('\n')
    .map((l) => RunRecord.parse(JSON.parse(l)));

/** Semua file di bawah data/, dengan isinya (untuk membandingkan "tanpa diff"). */
async function snapshot(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else out[path.relative(root, p).replace(/\\/g, '/')] = (await readFile(p)).toString('base64');
    }
  };
  await walk(path.join(root, 'data'));
  return out;
}

describe('merge — insert', () => {
  it('menulis CSV terurut, RUN, status, raw; summary + pesan commit', async () => {
    await writeArtifact();
    const s = await merge(opts());
    expect(s.results[0]).toMatchObject({
      source: 'ubslifestyle',
      status: 'success',
      rows_inserted: 13,
      rows_updated: 0,
      rows_unchanged: 0,
    });
    expect(s.commit_message).toBe('data: 2026-10-26 ubslifestyle✓ +13 ~0');

    const rows = await prices();
    expect(rows.map((r) => r.weight_g)).toEqual([
      0.05, 0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 10, 25, 50, 100,
    ]);
    expect(rows.every((r) => r.scraped_at === '2026-10-26T03:40:00Z' && r.run_id === '200-1')).toBe(
      true,
    );

    const [run] = await runs();
    expect(run).toMatchObject({ rows_parsed: 13, rows_inserted: 13, status: 'success' });
    expect(run!.raw_paths).toEqual([
      expect.stringMatching(
        /^data\/raw\/ubslifestyle\/2026-10\/2026-10-26T033001Z-[0-9a-f]{8}\.json\.gz$/,
      ),
    ]);
    await expect(read(run!.raw_paths[0]!)).resolves.toBeDefined();

    const status = JSON.parse(await read('data/meta/status.json'));
    expect(status.ubslifestyle).toEqual({
      last_run_id: '200-1',
      last_status: 'success',
      last_success_at: '2026-10-26T03:30:09Z',
      last_data_date: '2026-10-26',
      consecutive_failures: 0,
      updated_at: '2026-10-26T03:40:00Z',
    });
  });
});

describe('merge — idempoten', () => {
  it('merge 2× hasil yang sama = tanpa diff (RUN tidak digandakan, raw tidak disalin ulang)', async () => {
    await writeArtifact();
    await merge(opts());
    const first = await snapshot();
    const s = await merge(opts());
    expect(s.results[0]).toMatchObject({ rows_inserted: 0, rows_updated: 0, rows_unchanged: 13 });
    expect(await snapshot()).toEqual(first);
  });

  it('run berikutnya dengan nilai sama: baris tidak disentuh (scraped_at, run_id tetap)', async () => {
    await writeArtifact();
    await merge(opts());
    const csv = await read('data/prices/ubslifestyle/2026.csv');
    await writeArtifact({ extra: { run_id: '201-1' }, fetchedAt: '2026-10-26T06:30:01Z' });
    const s = await merge(opts({ runId: '201-1', now: new Date('2026-10-26T06:40:00Z') }));
    expect(s.results[0]!.rows_unchanged).toBe(13);
    expect(await read('data/prices/ubslifestyle/2026.csv')).toBe(csv);
    expect((await runs()).map((r) => r.run_id)).toEqual(['200-1', '201-1']);
    // Raw identik dengan snapshot terakhir → tidak disimpan lagi.
    expect((await runs())[1]!.raw_paths).toEqual([]);
  });
});

describe('merge — update + REVISION', () => {
  it('nilai berubah → baris diperbarui dan setiap kolom berubah dicatat', async () => {
    await writeArtifact();
    await merge(opts());
    const changed = ubsDay('2026-10-26');
    changed[4] = { ...changed[4]!, buyback_price: 2_290_000 };
    await writeArtifact({ rows: changed, extra: { run_id: '201-1' }, raw: 'raw kedua' });
    const later = new Date('2026-10-26T06:40:00Z');
    const s = await merge(opts({ runId: '201-1', now: later }));
    expect(s.results[0]).toMatchObject({ rows_updated: 1, rows_unchanged: 12, revisions: 1 });
    expect(s.commit_message).toBe('data: 2026-10-26 ubslifestyle✓ +0 ~1');

    const one = (await prices()).find((r) => r.weight_g === 1)!;
    expect(one).toMatchObject({
      buyback_price: 2_290_000,
      run_id: '201-1',
      scraped_at: '2026-10-26T06:40:00Z',
    });
    const other = (await prices()).find((r) => r.weight_g === 2)!;
    expect(other.run_id).toBe('200-1');

    const revisions = (await read('data/meta/revisions/2026.jsonl'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(revisions).toEqual([
      {
        table: 'price',
        row_key: '2026-10-26|ubslifestyle|ubs|gold_bar|2026|1|',
        field: 'buyback_price',
        old_value: '2288000',
        new_value: '2290000',
        run_id: '201-1',
        revised_at: '2026-10-26T06:40:00Z',
        reason: 'source_changed',
      },
    ]);
    expect((await runs())[1]!.raw_paths).toHaveLength(1);
  });

  it('ketiadaan ≠ penghapusan: baris yang tidak ada di hasil scrape tetap ada', async () => {
    await writeArtifact({ rows: ubsDay('2026-10-24') });
    await merge(opts());
    await writeArtifact({ rows: ubsDay('2026-10-26').slice(0, 5), extra: { run_id: '201-1' } });
    await merge(opts({ runId: '201-1' }));
    const rows = await prices();
    expect(rows.filter((r) => r.date === '2026-10-24')).toHaveLength(13);
    expect(rows.filter((r) => r.date === '2026-10-26')).toHaveLength(5);
    expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort());
  });
});

describe('merge — status gagal, stale, karantina', () => {
  it('failed: tidak menulis CSV, raw tetap disimpan, consecutive_failures bertambah', async () => {
    await writeArtifact({ status: 'failed', raw: '<html>berubah</html>' });
    const s = await merge(opts());
    expect(s.results[0]).toMatchObject({
      status: 'failed',
      error_code: 'PARSE_ERROR',
      rows_rejected: 13,
    });
    expect(s.commit_message).toBe('data: 2026-10-26 ubslifestyle✗');
    await expect(read('data/prices/ubslifestyle/2026.csv')).rejects.toThrow();
    expect((await runs())[0]!.raw_paths).toHaveLength(1);

    await writeArtifact({
      status: 'failed',
      raw: '<html>berubah</html>',
      extra: { run_id: '201-1' },
    });
    const again = await merge(opts({ runId: '201-1' }));
    expect(again.results[0]!.consecutive_failures).toBe(2);
    expect((await runs())[1]!.raw_paths).toEqual([]);
  });

  it('stale: tidak menulis CSV, consecutive_failures tidak berubah', async () => {
    await writeArtifact({
      status: 'stale',
      extra: { error_message: 'tanggal data 2026-10-24 ≠ hari ini' },
    });
    const s = await merge(opts());
    expect(s.results[0]).toMatchObject({
      status: 'stale',
      error_code: null,
      consecutive_failures: 0,
    });
    const status = JSON.parse(await read('data/meta/status.json'));
    expect(status.ubslifestyle).toMatchObject({ last_status: 'stale', last_success_at: null });
  });

  it('partial: baris ditahan ditulis ke data/quarantine, sisanya ke CSV', async () => {
    const rows = ubsDay('2026-10-26');
    const odd = candidate({ weight_g: 250, sell_price: 600_000_000, buyback_price: 570_000_000 });
    await writeArtifact({
      status: 'partial',
      rows,
      held: [{ reason_code: 'UNKNOWN_ITEM', rows: [odd] }],
    });
    const s = await merge(opts());
    expect(s.results[0]).toMatchObject({
      status: 'partial',
      rows_inserted: 13,
      rows_held: 1,
      quarantine_paths: ['data/quarantine/ubslifestyle/2026-10-26-200-1.json'],
    });
    expect(s.commit_message).toBe('data: 2026-10-26 ubslifestyle⚠ +13 ~0 !1');
    const batch = JSON.parse(await read('data/quarantine/ubslifestyle/2026-10-26-200-1.json'));
    expect(batch).toMatchObject({
      run_id: '200-1',
      reason_code: 'UNKNOWN_ITEM',
      decision: 'pending',
    });
    expect(batch.rows[0]).toMatchObject({ weight_g: 250, run_id: '200-1', origin: 'scrape' });
    expect((await runs())[0]).toMatchObject({ rows_parsed: 14, rows_held: 1 });
  });

  it('artifact hilang untuk sumber yang diharapkan → failed/UNKNOWN', async () => {
    await writeArtifact();
    const s = await merge(opts({ expected: ['pegadaian', 'ubslifestyle'] }));
    expect(s.results.map((r) => [r.source, r.status, r.error_code])).toEqual([
      ['pegadaian', 'failed', 'UNKNOWN'],
      ['ubslifestyle', 'success', null],
    ]);
    expect(s.commit_message).toBe('data: 2026-10-26 pegadaian✗ ubslifestyle✓ +13 ~0');
  });

  it('sha256 raw tidak cocok dengan run.json → merge gagal keras', async () => {
    await writeArtifact();
    await writeFile(path.join(inDir, 'out-ubslifestyle', 'raw.json.gz'), gzipSync('lain'));
    await expect(merge(opts())).rejects.toThrow(/sha256/);
  });
});

describe('merge — dry run', () => {
  it('menghitung perubahan tanpa menulis apa pun', async () => {
    await writeArtifact();
    const s = await merge(opts({ dryRun: true }));
    expect(s.results[0]!.rows_inserted).toBe(13);
    expect(s.changed_paths).toContain('data/prices/ubslifestyle/2026.csv');
    expect(await snapshot()).toEqual({});
  });
});

describe('commitMessage', () => {
  it('tanpa sumber → hanya tanggal', () => {
    expect(commitMessage('2026-10-26', [])).toBe('data: 2026-10-26');
  });
});
