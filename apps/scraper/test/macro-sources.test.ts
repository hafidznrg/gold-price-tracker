import { readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { readMacroCsv, SpotSnapshot, type MacroRow } from '@gold/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { tables } from '../src/html';
import { ScrapeError } from '../src/pipeline/errors';
import { merge } from '../src/pipeline/merge';
import { plan, SCHEDULES, slotOf, targetDate, type PlanInput } from '../src/pipeline/plan';
import { scrape, SCRAPE_EXIT } from '../src/pipeline/scrape';
import { writeMacro } from '../src/pipeline/store';
import { jisdor, parse as parseJisdor } from '../src/sources/jisdor';
import type { FetchContext, RawPayload } from '../src/sources/types';
import { parse as parseWorldbank, worldbank } from '../src/sources/worldbank';
import { parse as parseXaus, xaus } from '../src/sources/xaus';
import { ROOT, tempRoot } from './helpers';

// P2-03 (xaus), P2-04 (JISDOR + fallback), worldbank bulanan, plan scrape-macro, dan alur
// scrape → merge dengan fetch palsu dari fixture P0-10 (tanpa jaringan).

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const text = (f: string) => readFileSync(path.join(FIX, f), 'utf8');
const history = text('xaus/history-last15-2026-10-25.json');
const spot = text('xaus/spot-compact-2026-10-25.json');
const jisdorPage = gunzipSync(
  readFileSync(path.join(FIX, 'jisdor/page-2026-10-25.html.gz')),
).toString('utf8');
const ecbCsv = text('frankfurter/rates-eur-idr-usd-2026-tail.csv');
const pinkSheet = readFileSync(path.join(FIX, 'worldbank/cmo-monthly-trimmed-2026-10.xlsx'));

const raw = (body: unknown): RawPayload => ({
  body: JSON.stringify(body),
  contentType: 'application/json',
  fetchedAt: '2026-10-26T09:40:05Z',
});
const xausRaw = (over: { history?: string; spot?: string; today?: string } = {}) =>
  raw({ today: '2026-10-26', history, spot, ...over });
const withStatus = (status: unknown) =>
  JSON.stringify({ ...JSON.parse(history), data_state: { status } });

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof ScrapeError) return err.code;
    throw err;
  }
  return 'tidak melempar';
}

describe('xaus (P2-03)', () => {
  it('upsert penutupan 10 hari terakhir, spot dibawa terpisah', () => {
    const r = parseXaus(xausRaw());
    // Hari ini 26 Okt → 16 Okt s/d 25 Okt: hanya hari perdagangan fixture.
    expect(r.rows.map((x) => x.date)).toEqual([
      '2026-10-16',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
    ]);
    expect(r.rows.at(-1)).toEqual({
      date: '2026-10-23',
      series: 'xau_usd_oz',
      frequency: 'D',
      value: 4007.9,
      unit: 'USD/ozt',
      source: 'xaus',
    });
    expect(r.dataDate).toBe('2026-10-23');
    expect(r.spot).toEqual({
      xau_usd_oz: 3996.899902,
      fetched_at: '2026-10-26T09:40:05Z',
      stale: false,
    });
  });

  it('hari berjalan tidak diambil (belum final); batas bawah jendela inklusif', () => {
    expect(parseXaus(xausRaw({ today: '2026-10-23' })).rows.at(-1)?.date).toBe('2026-10-22');
    expect(parseXaus(xausRaw({ today: '2026-10-25' })).rows[0]?.date).toBe('2026-10-15');
    expect(parseXaus(xausRaw({ today: '2026-10-24' })).rows[0]?.date).toBe('2026-10-14');
  });

  it('V-10: histori tidak fresh, status hilang, atau spot stale → STALE_SOURCE', () => {
    expect(codeOf(() => parseXaus(xausRaw({ history: withStatus('stale') })))).toBe('STALE_SOURCE');
    expect(codeOf(() => parseXaus(xausRaw({ history: withStatus(undefined) })))).toBe(
      'STALE_SOURCE',
    );
    const staleSpot = JSON.stringify({ ...JSON.parse(spot), stale: true });
    expect(codeOf(() => parseXaus(xausRaw({ spot: staleSpot })))).toBe('STALE_SOURCE');
  });

  it('bentuk respons berubah → PARSE_ERROR', () => {
    const bad = JSON.stringify({ ...JSON.parse(history), points: [{ d: '2026-10-22', c: 0 }] });
    expect(codeOf(() => parseXaus(xausRaw({ history: bad })))).toBe('PARSE_ERROR');
    expect(codeOf(() => parseXaus(xausRaw({ history: '<html>' })))).toBe('PARSE_ERROR');
    expect(codeOf(() => parseXaus(xausRaw({ today: '2026-12-31' })))).toBe('PARSE_ERROR'); // tak ada titik
    const noSpot = JSON.stringify({ stale: false });
    expect(codeOf(() => parseXaus(xausRaw({ spot: noSpot })))).toBe('PARSE_ERROR');
  });
});

describe('jisdor (P2-04)', () => {
  const biRaw = (html = jisdorPage) =>
    raw({ source: 'bi', table: tables(html).find((t) => t.includes('table-striped'))! });

  it('tabel halaman BI: 10 hari kerja, tanggal Indonesia, kurs Rp', () => {
    const r = parseJisdor(biRaw());
    expect(r.rows).toHaveLength(10);
    expect(r.rows[0]).toMatchObject({
      date: '2026-10-12',
      series: 'usd_idr_jisdor',
      frequency: 'D',
      unit: 'IDR/USD',
      source: 'bi',
    });
    expect(r.rows.at(-1)).toMatchObject({ date: '2026-10-23', value: 18_069 });
    expect(r.dataDate).toBe('2026-10-23');
    expect(r.note).toBeUndefined();
  });

  it('tabel hilang / header berubah / kurs bukan angka bulat → PARSE_ERROR', () => {
    expect(codeOf(() => parseJisdor(raw({ source: 'bi', table: '' })))).toBe('PARSE_ERROR');
    const wrongHeader = '<table><tr><th>Date</th><th>Rate</th></tr></table>';
    expect(codeOf(() => parseJisdor(raw({ source: 'bi', table: wrongHeader })))).toBe(
      'PARSE_ERROR',
    );
    const badRate =
      '<table><tr><th>Tanggal</th><th>Kurs</th></tr><tr><td>23 Oktober 2026</td><td>Rp 18.069,55</td></tr></table>';
    expect(codeOf(() => parseJisdor(raw({ source: 'bi', table: badRate })))).toBe('PARSE_ERROR');
  });

  it('raw fallback Frankfurter → baris usd_idr_ecb + catatan alasan BI gagal', () => {
    const r = parseJisdor(raw({ source: 'frankfurter', csv: ecbCsv, reason: 'fetch failed' }));
    expect(r.rows).toHaveLength(10);
    expect(r.rows.every((x) => x.series === 'usd_idr_ecb' && x.source === 'ecb')).toBe(true);
    expect(r.rows.at(-1)).toMatchObject({ date: '2026-10-23', value: 18_107.8 });
    expect(r.note).toContain('fallback Frankfurter');
    expect(r.note).toContain('fetch failed');
  });
});

// ── fetchRaw dengan fetch palsu ─────────────────────────────────────────────

type Route = Response | Error;
const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html' } });
const ok = (body: string | Buffer, type = 'application/json') =>
  new Response(body, { headers: { 'content-type': type } });
const connectTimeout = () =>
  Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });

/** Ganti `fetch` global: rute dicari lewat potongan URL; mengembalikan daftar URL yang diminta. */
function stubFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`URL tak terduga: ${url}`);
    const res = routes[key]!;
    if (res instanceof Error) throw res;
    return res.clone();
  });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const BI = 'bi.go.id';
const FRANKFURTER = 'frankfurter.dev';
const ctx = (over: Partial<FetchContext> = {}): FetchContext => ({
  root: ROOT,
  config: {} as FetchContext['config'],
  runId: '1-1',
  userAgent: 'test',
  now: new Date('2026-10-26T09:40:00Z'),
  pauseMs: 0,
  retryDelayMs: 0,
  ...over,
});

describe('fetchRaw', () => {
  it('jisdor: BI terbaca → tidak menyentuh Frankfurter', async () => {
    const calls = stubFetch({ [BI]: html(jisdorPage) });
    const body = JSON.parse((await jisdor.fetchRaw(ctx())).body);
    expect(body.source).toBe('bi');
    expect(body.table).toMatch(/^<table class="table table-striped/);
    expect(calls).toHaveLength(1);
  });

  it('jisdor: connect timeout BI (3× percobaan) → fallback Frankfurter 14 hari ke belakang', async () => {
    const calls = stubFetch({
      [BI]: connectTimeout(),
      [FRANKFURTER]: ok(ecbCsv, 'text/csv'),
    });
    const payload = await jisdor.fetchRaw(ctx({ date: '2026-10-26' }));
    const body = JSON.parse(payload.body);
    expect(body).toMatchObject({ source: 'frankfurter', csv: ecbCsv });
    expect(body.reason).toContain('UND_ERR_CONNECT_TIMEOUT');
    expect(calls.filter((u) => u.includes(BI))).toHaveLength(3);
    expect(calls.at(-1)).toContain('from=2026-10-12&to=2026-10-26');
    expect(jisdor.parse(payload).rows[0]?.series).toBe('usd_idr_ecb');
  });

  it('jisdor: HTTP 5xx BI juga memicu fallback; keduanya gagal → galat BI + galat fallback', async () => {
    stubFetch({ [BI]: new Response('x', { status: 503 }), [FRANKFURTER]: ok(ecbCsv, 'text/csv') });
    expect(JSON.parse((await jisdor.fetchRaw(ctx())).body).source).toBe('frankfurter');

    stubFetch({ [BI]: connectTimeout(), [FRANKFURTER]: new Response('x', { status: 404 }) });
    const err = await jisdor.fetchRaw(ctx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScrapeError);
    expect((err as ScrapeError).code).toBe('FETCH_TIMEOUT');
    expect((err as ScrapeError).message).toContain('fallback Frankfurter gagal');
  });

  it('jisdor: halaman terbaca tanpa tabel → raw menyimpan seluruh halaman, tanpa fallback', async () => {
    const calls = stubFetch({ [BI]: html('<html>perubahan layout</html>') });
    const payload = await jisdor.fetchRaw(ctx());
    expect(JSON.parse(payload.body)).toMatchObject({
      source: 'bi',
      page: '<html>perubahan layout</html>',
    });
    expect(calls).toHaveLength(1);
    expect(codeOf(() => jisdor.parse(payload))).toBe('PARSE_ERROR');
  });

  it('xaus: history lalu spot; tanggal sasaran dari ctx.date', async () => {
    const calls = stubFetch({ '/history': ok(history), '/spot?compact=1': ok(spot) });
    const body = JSON.parse((await xaus.fetchRaw(ctx({ date: '2026-10-23' }))).body);
    expect(body.today).toBe('2026-10-23');
    expect(calls).toEqual([
      'https://xaus.com/api/v1/history',
      'https://xaus.com/api/v1/spot?compact=1',
    ]);
  });

  it('worldbank: halaman → tautan XLSX; scrape hanya 3 bulan terakhir', async () => {
    stubFetch({
      'commodity-markets': html(
        '<a href="https://thedocs.worldbank.org/en/doc/abc-092026/related/CMO-Historical-Data-Monthly.xlsx">x</a>',
      ),
      'CMO-Historical-Data-Monthly.xlsx': ok(pinkSheet, 'application/octet-stream'),
    });
    const payload = await worldbank.fetchRaw(ctx());
    const r = parseWorldbank(payload);
    expect(r.rows.map((x) => x.date)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
    expect(r.rows.at(-1)).toMatchObject({ frequency: 'M', source: 'worldbank', value: 4319 });
    expect(r.dataDate).toBe('2026-09-01');
  });
});

// ── plan scrape-macro ───────────────────────────────────────────────────────

const config = await loadConfig(ROOT);

describe('plan scrape-macro', () => {
  const WED = new Date('2026-11-04T09:45:00Z'); // 16.45 WIB
  const input = (over: Partial<PlanInput> = {}): PlanInput => ({
    workflow: 'scrape-macro',
    event: 'schedule',
    schedule: '40 9 * * 1-5',
    sources: '',
    force: false,
    config,
    status: {},
    now: WED,
    ...over,
  });

  it('cron terdaftar: primary, tanpa matrix browser; worldbank bila tanggal ≥ 5 dan bulan lalu belum ada', () => {
    expect(SCHEDULES['scrape-macro']?.['40 9 * * 1-5']?.slot).toBe('primary');
    expect(slotOf('scrape-macro', 'schedule', '40 9 * * 1-5')).toBe('primary');
    const r = plan(input({ now: new Date('2026-11-05T09:45:00Z'), monthlyGold: ['2026-09-01'] }));
    expect(r.slot).toBe('primary');
    expect(r.date).toBe('2026-11-05');
    expect(r.sources).toEqual(['xaus', 'jisdor', 'worldbank']);
    expect(r.matrix.include.every((m) => m.browser === false)).toBe(true);
    expect(r.has_work).toBe(true);
  });

  it('worldbank dilewati sebelum tanggal 5 dan bila rata-rata bulan lalu sudah ada', () => {
    const early = plan(input({ monthlyGold: [] })); // 4 Nov
    expect(early.sources).toEqual(['xaus', 'jisdor']);
    expect(early.skipped).toEqual([{ source: 'worldbank', reason: 'tanggal < 5' }]);

    const have = plan(
      input({ now: new Date('2026-11-06T09:45:00Z'), monthlyGold: ['2026-10-01'] }),
    );
    expect(have.sources).toEqual(['xaus', 'jisdor']);
    expect(have.skipped[0]).toMatchObject({
      source: 'worldbank',
      reason: expect.stringContaining('2026-10'),
    });

    // Awal tahun: bulan lalu = Desember tahun sebelumnya.
    const jan = plan(input({ now: new Date('2027-01-06T09:45:00Z'), monthlyGold: ['2026-12-01'] }));
    expect(jan.sources).toEqual(['xaus', 'jisdor']);
    const janMissing = plan(input({ now: new Date('2027-01-06T09:45:00Z'), monthlyGold: [] }));
    expect(janMissing.sources).toContain('worldbank');
  });

  it('run manual: worldbank yang disebut eksplisit selalu jalan; tanpa daftar mengikuti aturan', () => {
    const r = plan(input({ event: 'workflow_dispatch', schedule: '', sources: 'worldbank' }));
    expect(r).toMatchObject({ slot: 'manual', sources: ['worldbank'] });
    const all = plan(input({ event: 'workflow_dispatch', schedule: '', monthlyGold: [] }));
    expect(all.sources).toEqual(['xaus', 'jisdor']); // 4 Nov < 5
  });

  it('targetDate untuk cron hari kerja: kemunculan terakhir ≤ now (D-27)', () => {
    const cron = '40 9 * * 1-5';
    const at = (iso: string) => targetDate('schedule', cron, new Date(iso));
    expect(at('2026-11-04T09:45:00Z')).toBe('2026-11-04');
    expect(at('2026-11-04T17:30:00Z')).toBe('2026-11-04'); // 00.30 WIB esok
    expect(at('2026-11-04T09:00:00Z')).toBe('2026-11-03'); // belum waktunya
    expect(at('2026-11-07T02:00:00Z')).toBe('2026-11-06'); // Sabtu → Jumat
    expect(at('2026-11-09T08:00:00Z')).toBe('2026-11-06'); // Senin pagi
    expect(targetDate('workflow_dispatch', '', new Date('2026-11-07T02:00:00Z'))).toBe(
      '2026-11-07',
    );
  });
});

// ── scrape → merge ──────────────────────────────────────────────────────────

describe('scrape makro → merge', () => {
  const NOW = new Date('2026-10-26T09:40:00Z'); // Senin 16.40 WIB
  let root: string;
  let inDir: string;
  beforeEach(async () => {
    root = await tempRoot();
    inDir = path.join(root, 'out');
  });

  const opts = (source: 'xaus' | 'jisdor' | 'worldbank') => ({
    root,
    source,
    slot: 'primary' as const,
    trigger: 'schedule' as const,
    out: path.join(inDir, `out-${source}`),
    runId: '400-1',
    userAgent: 'test',
    now: NOW,
    pauseMs: 0,
    retryDelayMs: 0,
  });
  const mergeAll = (expected: ('xaus' | 'jisdor' | 'worldbank')[]) =>
    merge({
      root,
      inDir,
      expected,
      runId: '400-1',
      origin: 'scrape',
      dryRun: false,
      now: NOW,
      date: '2026-10-26',
      fallback: { workflow: 'scrape-macro', trigger: 'schedule' },
    });
  const read = (rel: string) => readFile(path.join(root, ...rel.split('/')), 'utf8');
  const csv = async (series: string) => readMacroCsv(await read(`data/macro/${series}.csv`));
  const stored = (date: string, value: number): MacroRow => ({
    date,
    series: 'usd_idr_jisdor',
    frequency: 'D',
    value,
    unit: 'IDR/USD',
    source: 'bi',
    scraped_at: '2026-10-23T09:40:00Z',
    run_id: '300-1',
    origin: 'scrape',
  });

  it('xaus + jisdor: CSV makro, spot.json dengan kurs JISDOR terakhir, artifact kind macro', async () => {
    await writeMacro(root, 'usd_idr_jisdor', [stored('2026-10-22', 18_000)]);
    stubFetch({ '/history': ok(history), '/spot?compact=1': ok(spot), [BI]: html(jisdorPage) });

    const x = await scrape(opts('xaus'));
    expect(x).toMatchObject({
      kind: 'macro',
      source: 'xaus',
      workflow: 'scrape-macro',
      status: 'success',
      data_date: '2026-10-23',
      rows_parsed: 6,
      rows_held: 0,
      rows_rejected: 0,
      exit_code: SCRAPE_EXIT.OK,
      expected_day: true,
      parser_version: 'xaus@1.0.0',
    });
    const j = await scrape(opts('jisdor'));
    expect(j).toMatchObject({ kind: 'macro', status: 'success', rows_parsed: 10 });
    expect(j.error_message).toBeNull();

    expect((await readdir(opts('xaus').out)).sort()).toEqual([
      'held.json',
      'raw.json.gz',
      'rows.json',
      'run.json',
      'spot.json',
    ]);
    expect((await readdir(opts('jisdor').out)).sort()).toEqual([
      'held.json',
      'raw.json.gz',
      'rows.json',
      'run.json',
    ]);

    const summary = await mergeAll(['xaus', 'jisdor']);
    expect(
      Object.fromEntries(
        summary.results.map((r) => [r.source, [r.status, r.rows_inserted, r.rows_updated]]),
      ),
    ).toEqual({
      xaus: ['success', 6, 0],
      jisdor: ['success', 9, 1], // 22 Okt lama (18.000) direvisi oleh tabel BI
    });
    expect(await csv('xau_usd_oz')).toHaveLength(6);
    expect(await csv('usd_idr_jisdor')).toHaveLength(10);
    // spot memakai kurs yang ada saat scrape (JISDOR 22 Okt dari data/), bukan hasil run paralel.
    expect(SpotSnapshot.parse(JSON.parse(await read('data/macro/spot.json')))).toEqual({
      fetched_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT[\d:]+Z$/),
      xau_usd_oz: 3996.899902,
      usd_idr: 18_000,
      usd_idr_series: 'usd_idr_jisdor',
      usd_idr_date: '2026-10-22',
      source: 'xaus',
      stale: false,
    });
  });

  it('jisdor fallback: baris usd_idr_ecb, JISDOR tidak tersentuh, run success dengan catatan', async () => {
    stubFetch({ [BI]: connectTimeout(), [FRANKFURTER]: ok(ecbCsv, 'text/csv') });
    const run = await scrape(opts('jisdor'));
    expect(run).toMatchObject({
      kind: 'macro',
      source: 'jisdor',
      status: 'success',
      rows_parsed: 10,
    });
    expect(run.error_message).toContain('fallback Frankfurter');
    await mergeAll(['jisdor']);
    expect((await csv('usd_idr_ecb')).at(-1)).toMatchObject({ date: '2026-10-23', source: 'ecb' });
    await expect(read('data/macro/usd_idr_jisdor.csv')).rejects.toThrow();
  });

  it('xaus basi (V-10): run gagal STALE_SOURCE, kode 1, tanpa baris dan tanpa spot.json', async () => {
    stubFetch({ '/history': ok(withStatus('stale')), '/spot?compact=1': ok(spot) });
    const run = await scrape(opts('xaus'));
    expect(run).toMatchObject({
      status: 'failed',
      error_code: 'STALE_SOURCE',
      exit_code: SCRAPE_EXIT.FAILED,
      rows_parsed: 0,
    });
    expect(await readdir(opts('xaus').out)).not.toContain('spot.json');
  });

  it('lonjakan V-09 (>8% dari penutupan terakhir di CSV) ditahan ke karantina PRICE_JUMP', async () => {
    const prev: MacroRow = {
      ...stored('2026-10-15', 3_000),
      series: 'xau_usd_oz',
      unit: 'USD/ozt',
      source: 'xaus',
    };
    await writeMacro(root, 'xau_usd_oz', [prev]);
    stubFetch({ '/history': ok(history), '/spot?compact=1': ok(spot) });
    const run = await scrape(opts('xaus'));
    // Setiap penutupan 16–23 Okt (~4.000) dibanding 3.000 → > +8% → semua ditahan.
    expect(run).toMatchObject({ status: 'partial', rows_held: 6, exit_code: SCRAPE_EXIT.OK });
    const held = JSON.parse(await readFile(path.join(opts('xaus').out, 'held.json'), 'utf8'));
    expect(held[0].reason_code).toBe('PRICE_JUMP');
  });

  it('worldbank: 3 bulan terakhir frekuensi M, raw disimpan sebagai XLSX', async () => {
    stubFetch({
      'commodity-markets': html(
        '<a href="https://x.org/related/CMO-Historical-Data-Monthly.xlsx">x</a>',
      ),
      'CMO-Historical-Data-Monthly.xlsx': ok(pinkSheet, 'application/octet-stream'),
    });
    const run = await scrape(opts('worldbank'));
    expect(run).toMatchObject({
      kind: 'macro',
      status: 'success',
      rows_parsed: 3,
      expected_day: false,
    });
    expect(run.raw).toMatchObject({ ext: 'xlsx', file: 'raw.xlsx.gz' });
    const bytes = gunzipSync(await readFile(path.join(opts('worldbank').out, 'raw.xlsx.gz')));
    expect(bytes.equals(pinkSheet)).toBe(true);
  });
});
