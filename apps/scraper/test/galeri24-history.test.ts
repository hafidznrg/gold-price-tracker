import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PriceRow } from '@gold/schema';
import { describe, expect, it, vi } from 'vitest';
import { downloadGaleri24History, KEPT_FIELDS } from '../src/backfill/galeri24-download';
import { galeri24History, parseHistory, selectUnscraped } from '../src/backfill/galeri24-history';
import type { RawPayload } from '../src/sources/types';

// P6-11 — histori Galeri24: unduhan (fetch palsu) dan job (fixture asli P6-01b).

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/galeri24');
type Entry = Record<string, unknown>;
const sample = (
  JSON.parse(readFileSync(path.join(DIR, 'history-sample-2026-11-17.json'), 'utf8')) as {
    results: Entry[];
  }
).results;

const ANTAM = '00005201808001';
const raw = (results: Entry[]): RawPayload => ({
  body: JSON.stringify({ manifest: {}, results }),
  contentType: 'application/json',
  fetchedAt: '2026-11-17T02:00:00Z',
});
const tmp = () => mkdtemp(path.join(tmpdir(), 'galeri24-'));

/** Entri sintetis valid (1 g Antam): harga dasar 2.000.000 + 1,5% → 2.030.000 (V-12 cocok). */
const entry = (over: Entry = {}): Entry => ({
  id: 'x1',
  vendorCode: ANTAM,
  date: '2030-01-02',
  denomination: '1',
  price: '2000000',
  margin: '1.5',
  sellingPrice: '2030000',
  buybackPrice: '1900000',
  status: '1',
  updatedAt: '2030-01-02T03:00:00.000Z',
  ...over,
});

describe('galeri24-history parse (P6-11)', () => {
  const result = parseHistory(raw(sample));
  const find = (date: string, brand: string, w: number, variant = '') =>
    result.rows.filter(
      (r) => r.date === date && r.brand === brand && r.weight_g === w && r.variant === variant,
    );

  it('revisi intraday 2026-11-16: dipakai updatedAt terbesar (10.14 WIB)', () => {
    const entries = sample.filter(
      (e) => e.vendorCode === ANTAM && e.date === '2026-11-16' && e.denomination === '1',
    );
    expect(entries.filter((e) => e.status === '1')).toHaveLength(2);
    const latest = entries
      .map((e) => String(e.updatedAt))
      .sort()
      .at(-1)!;
    const rows = find('2026-11-16', 'antam', 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source_updated_at).toMatch(/^2026-11-16T10:1\d:/);
    expect(Math.floor(Date.parse(rows[0]!.source_updated_at!) / 1000)).toBe(
      Math.floor(Date.parse(latest) / 1000),
    );
  });

  it('2026-11-07 Antam 250/500/1000 g (hanya status 3) tidak menghasilkan baris', () => {
    for (const w of [250, 500, 1000]) expect(find('2026-11-07', 'antam', w)).toHaveLength(0);
    expect(find('2026-11-07', 'antam', 1)).toHaveLength(1);
    expect(result.note).toMatch(/\d+ kunci tanpa status 1 diabaikan/);
  });

  it('hanya brand dari tabel vendor; semua baris source galeri24 gold_bar', () => {
    const brands = new Set(result.rows.map((r) => r.brand));
    for (const b of brands) expect(['antam', 'ubs', 'galeri24', 'lotusarchi']).toContain(b);
    expect(result.rows.every((r) => r.source === 'galeri24' && r.product === 'gold_bar')).toBe(
      true,
    );
    expect(result.dataDate).toBe('2026-11-17');
    const parsed = parseHistory(
      raw([...sample, entry({ id: 'other', vendorCode: '00005201808006', date: '2030-01-03' })]),
    );
    expect(parsed.rows.some((r) => r.date === '2030-01-03')).toBe(false);
  });

  it('id ganda lintas halaman di-dedup', () => {
    const once = parseHistory(raw(sample));
    const twice = parseHistory(raw([...sample, ...sample.slice(0, 50)]));
    expect(twice.rows).toEqual(once.rows);
    expect(twice.note).toContain(`${sample.length + 50} entri, ${sample.length} id unik`);
  });

  it('V-03 (buyback ≥ jual) dibuang dan dihitung, job tidak gagal', () => {
    const r = parseHistory(
      raw([
        entry({ buybackPrice: '2030000' }),
        entry({
          id: 'x2',
          denomination: '5',
          price: '10000000',
          sellingPrice: '10150000',
          buybackPrice: '9000000',
        }),
      ]),
    );
    expect(r.rows.map((x) => x.weight_g)).toEqual([5]);
    expect(r.note).toContain('1 baris V-03 dibuang');
  });

  it('selisih V-12 hanya dihitung: baris tetap, tanpa suspect', () => {
    const r = parseHistory(raw([entry({ sellingPrice: '2031000' })]));
    expect(r.rows).toHaveLength(1);
    expect(r.suspect).toBeUndefined();
    expect(r.note).toContain('1 selisih rumus V-12');
  });
});

describe('galeri24-history select (D-28)', () => {
  const row = (date: string, brand: PriceRow['brand'], variant = '') =>
    ({ date, brand, variant, weight_g: 1 }) as never;
  const existing = (date: string, brand: string, origin: string, variant = '') =>
    ({ date, brand, variant, origin }) as PriceRow;

  it('membuang tanggal yang sudah di-scrape untuk brand+varian yang sama saja', () => {
    const rows = [
      row('2026-11-16', 'antam'),
      row('2026-11-15', 'antam'),
      row('2026-11-16', 'ubs'),
      row('2026-11-16', 'antam', 'non_pegadaian'),
    ];
    const kept = selectUnscraped(rows, [
      existing('2026-11-16', 'antam', 'scrape'),
      existing('2026-11-15', 'antam', 'backfill'),
    ]);
    expect(kept.map((r) => `${r.brand}|${r.variant}|${r.date}`)).toEqual([
      'antam||2026-11-15',
      'ubs||2026-11-16',
      'antam|non_pegadaian|2026-11-16',
    ]);
  });
});

describe('galeri24-history job', () => {
  it('localOnly, parserVersion, fetchRaw butuh --input dan membaca halaman + manifest', async () => {
    expect(galeri24History.localOnly).toBe(true);
    expect(galeri24History.parserVersion).toBe('galeri24-history@1.0.0');
    expect(galeri24History.source).toBe('galeri24');
    const ctx = { root: '/', runId: 'r', userAgent: 'ua', now: new Date() };
    await expect(galeri24History.fetchRaw(ctx)).rejects.toThrow(/--input/);

    const dir = await tmp();
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ pages: 2 }));
    await writeFile(path.join(dir, 'page-001.json'), JSON.stringify({ results: [entry()] }));
    await writeFile(
      path.join(dir, 'page-002.json'),
      JSON.stringify({ results: [entry({ id: 'x2', denomination: '5' })] }),
    );
    const payload = await galeri24History.fetchRaw({ ...ctx, input: dir });
    const body = JSON.parse(payload.body) as { manifest: unknown; results: Entry[] };
    expect(body.manifest).toEqual({ pages: 2 });
    expect(body.results.map((e) => e.id)).toEqual(['x1', 'x2']);
  });
});

describe('galeri24-download (P6-11)', () => {
  const full = (id: string, over: Entry = {}): Entry => ({
    ...entry({ id }),
    vendorName: 'ANTAM',
    createdAt: '2030-01-02T03:00:00.000Z',
    description: null,
    ...over,
  });
  const pageBody = (count: number, next: string | null, results: Entry[]) =>
    JSON.stringify({ count, next, previous: null, results });

  it('3 halaman: filter vendor + field, berhenti di next=null, manifest ditulis', async () => {
    const out = path.join(await tmp(), 'dl');
    const urls: string[] = [];
    const pages = [
      pageBody(5, 'n', [full('a'), full('b', { vendorCode: 'OTHER' })]),
      pageBody(5, 'n', [full('c', { vendorCode: '00005202003010' })]),
      pageBody(5, null, [full('d')]),
    ];
    const result = await downloadGaleri24History({
      out,
      take: 2,
      pauseMs: 0,
      userAgent: 'ua-test',
      fetchPage: async (url) => {
        urls.push(url);
        return { status: 200, body: pages[urls.length - 1]! };
      },
    });
    expect(urls).toEqual([
      'https://galeri24.co.id/api/gold-prices?take=2&page=1',
      'https://galeri24.co.id/api/gold-prices?take=2&page=2',
      'https://galeri24.co.id/api/gold-prices?take=2&page=3',
    ]);
    expect(result.warnings).toEqual([]);
    expect((await readdir(out)).sort()).toEqual([
      'manifest.json',
      'page-001.json',
      'page-002.json',
      'page-003.json',
    ]);
    const p1 = JSON.parse(await readFile(path.join(out, 'page-001.json'), 'utf8')) as {
      page: number;
      count: number;
      fetched_at: string;
      results: Entry[];
    };
    expect(p1.page).toBe(1);
    expect(p1.count).toBe(5);
    expect(p1.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(p1.results.map((e) => e.id)).toEqual(['a']);
    expect(Object.keys(p1.results[0]!)).toEqual([...KEPT_FIELDS]);
    const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({
      take: 2,
      pages: 3,
      count_first: 5,
      count_last: 5,
      kept_rows: 3,
    });
    expect(typeof manifest.fetched_at_start).toBe('string');
    expect(typeof manifest.fetched_at_end).toBe('string');
  });

  it('count awal ≠ akhir → peringatan ulangi', async () => {
    const out = await tmp();
    const pages = [pageBody(10, 'n', [full('a')]), pageBody(12, null, [full('b')])];
    let i = 0;
    const r = await downloadGaleri24History({
      out,
      pauseMs: 0,
      fetchPage: async () => ({ status: 200, body: pages[i++]! }),
    });
    expect(r.manifest.count_first).toBe(10);
    expect(r.manifest.count_last).toBe(12);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/10 → 12.*Ulangi/);
  });

  it('retry sekali untuk 5xx; gagal dua kali = error; --max-pages jadi pengaman', async () => {
    const out = await tmp();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ status: 503, body: '' })
      .mockResolvedValueOnce({ status: 200, body: pageBody(1, null, [full('a')]) });
    const r = await downloadGaleri24History({ out, pauseMs: 0, retryDelayMs: 0, fetchPage });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(r.manifest.pages).toBe(1);

    const bad = vi.fn().mockResolvedValue({ status: 500, body: '' });
    await expect(
      downloadGaleri24History({ out: await tmp(), pauseMs: 0, retryDelayMs: 0, fetchPage: bad }),
    ).rejects.toThrow(/HTTP 500/);
    expect(bad).toHaveBeenCalledTimes(2);

    const endless = async () => ({ status: 200, body: pageBody(9, 'n', [full('a')]) });
    await expect(
      downloadGaleri24History({ out: await tmp(), pauseMs: 0, maxPages: 2, fetchPage: endless }),
    ).rejects.toThrow(/max-pages/);
  });

  it('halaman kosong menghentikan unduhan', async () => {
    const out = await tmp();
    let i = 0;
    const pages = [pageBody(1, 'n', [full('a')]), pageBody(1, 'n', [])];
    const r = await downloadGaleri24History({
      out,
      pauseMs: 0,
      fetchPage: async () => ({ status: 200, body: pages[i++]! }),
    });
    expect(r.manifest.pages).toBe(1);
    await mkdir(out, { recursive: true });
  });
});
