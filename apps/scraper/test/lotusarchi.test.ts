import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrapeError } from '../src/pipeline/errors';
import {
  lotusarchi,
  latestPerDate,
  parse,
  RAW_GOLD_ROWS,
  type LotusArchiRaw,
} from '../src/sources/lotusarchi';
import type { FetchContext, RawPayload } from '../src/sources/types';

// P6-09 — parser Lotus Archi diuji dengan respons asli 17 Nov 2026 (plan/research/lotusarchi.md §3).

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/lotusarchi');
const displayText = readFileSync(path.join(DIR, 'harga-display-2026-11-17.json'), 'utf8');
const goldText = readFileSync(path.join(DIR, 'harga-gold-2026-11-17.json'), 'utf8');
const display = JSON.parse(displayText) as LotusArchiRaw['display'];
const gold = JSON.parse(goldText) as LotusArchiRaw['gold'];

const payload = (raw: LotusArchiRaw | unknown): RawPayload => ({
  body: JSON.stringify(raw),
  contentType: 'application/json',
  fetchedAt: '2026-11-17T13:00:00Z',
});
const base = (): LotusArchiRaw => structuredClone({ display, gold });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof ScrapeError ? err.code : String(err);
  }
  return null;
};

const WEIGHTS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 25, 50, 100];
const SELL = [
  320_000, 611_000, 1_254_000, 2_397_000, 4_735_000, 11_718_000, 23_361_000, 58_229_000,
  116_427_000, 232_677_000,
];

describe('parse (respons asli)', () => {
  it('10 gramasi 0,1–100 g, harga per keping, tanggal 2026-11-17, tanpa jam terbit', () => {
    const r = parse(payload({ display, gold }));
    expect(r.dataDate).toBe('2026-11-17');
    expect(r.sourceUpdatedAt).toBeNull();
    expect(r.stale).toBeNull();
    expect(r.rows.map((x) => x.weight_g)).toEqual(WEIGHTS);
    expect(r.rows.map((x) => x.sell_price)).toEqual(SELL);
    expect(
      r.rows.every(
        (x) =>
          x.source === 'lotusarchi' &&
          x.brand === 'lotusarchi' &&
          x.product === 'gold_bar' &&
          x.variant === '' &&
          x.location === '' &&
          x.date === '2026-11-17' &&
          x.source_updated_at === null,
      ),
    ).toBe(true);
  });

  it('buyback hanya di baris 1 g (per gram); "0,5 gr WB", Paper Gold, perak diabaikan', () => {
    const r = parse(payload({ display, gold }));
    expect(
      r.rows.filter((x) => x.buyback_price !== null).map((x) => [x.weight_g, x.buyback_price]),
    ).toEqual([[1, 2_249_000]]);
    expect(r.rows.filter((x) => x.weight_g === 0.5)).toHaveLength(1);
    expect(display.data.length).toBeGreaterThan(r.rows.length);
  });

  it('tanggal ganda (revisi): harga_id terbesar menang', () => {
    const rows = latestPerDate(gold);
    expect(rows.filter((r) => r.tanggal === '2026-10-28')).toEqual([
      { harga_id: 504, harga_emas: 2_455_000, buyback_emas: 2_305_000, tanggal: '2026-10-28' },
    ]);
    expect(new Set(rows.map((r) => r.tanggal)).size).toBe(rows.length);
    expect(rows[0]!.tanggal).toBe('2026-11-17');
    // Urutan masukan tidak berpengaruh.
    const shuffled = { data: [...gold.data].reverse() };
    expect(latestPerDate(shuffled)).toEqual(rows);
  });

  it('display sama dengan revisi tanggal ganda → memakai revisi terbaru', () => {
    const raw = base();
    raw.display.data.find((d) => d.produk === '1 gr')!.harga = 2_455_000;
    raw.gold.data = raw.gold.data.filter((r) => r.tanggal <= '2026-10-28');
    const r = parse(payload(raw));
    expect(r.dataDate).toBe('2026-10-28');
    expect(r.rows.find((x) => x.weight_g === 1)!.buyback_price).toBe(2_305_000);
    expect(r.stale).toBeNull();
  });
});

describe('sinkronisasi harga-display dan harga-gold', () => {
  it('display masih harga kemarin → tanggal kemarin + stale', () => {
    const raw = base();
    raw.display.data.find((d) => d.produk === '1 gr')!.harga = 2_406_000; // 16 Nov
    const r = parse(payload(raw));
    expect(r.dataDate).toBe('2026-11-16');
    expect(r.rows.find((x) => x.weight_g === 1)!.buyback_price).toBe(2_258_000);
    expect(r.rows.every((x) => x.date === '2026-11-16')).toBe(true);
    expect(r.stale).toMatch(/masih harga 2026-11-16; harga-gold sudah 2026-11-17/);
  });

  it('1 gr tidak cocok dengan tanggal mana pun → PARSE_ERROR yang jelas', () => {
    const raw = base();
    raw.display.data.find((d) => d.produk === '1 gr')!.harga = 1_111_000;
    expect(code(() => parse(payload(raw)))).toBe('PARSE_ERROR');
    expect(() => parse(payload(raw))).toThrow(/tidak cocok dengan harga_emas/);
  });

  it('tanpa baris "1 gr" → PARSE_ERROR', () => {
    const raw = base();
    raw.display.data = raw.display.data.filter((d) => d.produk !== '1 gr');
    expect(() => parse(payload(raw))).toThrow(/tanpa baris "1 gr"/);
  });
});

describe('parse (bentuk tak dikenal)', () => {
  it.each([
    ['raw bukan JSON', () => ({ body: '<html>', contentType: 'application/json', fetchedAt: '' })],
    ['display tanpa data', () => payload({ display: {}, gold })],
    ['gold kosong', () => payload({ display, gold: { data: [] } })],
    [
      'tanggal gold tidak valid',
      () => payload({ display, gold: { data: [{ ...gold.data[0]!, tanggal: '17-11-2026' }] } }),
    ],
    [
      'buyback gold bukan angka',
      () => payload({ display, gold: { data: [{ ...gold.data[0]!, buyback_emas: 'x' }] } }),
    ],
  ] as const)('%s → PARSE_ERROR', (_name, make) => {
    expect(code(() => parse(make() as RawPayload))).toBe('PARSE_ERROR');
  });

  it('harga gramasi tidak valid → PARSE_ERROR', () => {
    const raw = base();
    raw.display.data.find((d) => d.produk === '5 gr')!.harga = 0;
    expect(code(() => parse(payload(raw)))).toBe('PARSE_ERROR');
  });
});

describe('fetchRaw', () => {
  afterEach(() => vi.unstubAllGlobals());
  const ctx = { userAgent: 'test-ua', retryDelayMs: 0, pauseMs: 0 } as unknown as FetchContext;
  const stub = (responses: Record<string, [number, string]>) => {
    const fn = vi.fn(async (url: string) => {
      const [status, body] = responses[url] ?? [404, ''];
      return new Response(body, { status });
    });
    vi.stubGlobal('fetch', fn);
    return fn;
  };
  const D = 'https://api.lotusarchi.com/harga-display';
  const G = 'https://lotusarchi.com/wp-json/la/v1/harga-gold';

  it('dua GET dengan User-Agent proyek tanpa Origin/Referer; raw gold terpangkas', async () => {
    const fn = stub({ [D]: [200, displayText], [G]: [200, goldText] });
    const raw = await lotusarchi.fetchRaw(ctx);
    expect(fn.mock.calls.map((c) => c[0])).toEqual([D, G]);
    for (const [, init] of fn.mock.calls as unknown as [string, RequestInit][]) {
      expect(init.headers).toEqual({ 'User-Agent': 'test-ua' });
    }
    const body = JSON.parse(raw.body) as LotusArchiRaw;
    expect(body.gold.data).toHaveLength(RAW_GOLD_ROWS);
    expect(body.display).toEqual(display);
    expect(raw.contentType).toBe('application/json');
    expect(parse(raw).rows).toHaveLength(10);
    expect(parse(raw).dataDate).toBe('2026-11-17');
  });

  it('403 dengan halaman tantangan → BLOCKED tanpa retry', async () => {
    const fn = stub({
      [D]: [403, '<title>Just a moment...</title><div id="cf-chl-widget"></div>'],
    });
    await expect(lotusarchi.fetchRaw(ctx)).rejects.toMatchObject({ code: 'BLOCKED' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('HTTP 200 berisi tantangan → BLOCKED', async () => {
    stub({ [D]: [200, displayText], [G]: [200, '<html><title>Just a moment...</title></html>'] });
    await expect(lotusarchi.fetchRaw(ctx)).rejects.toMatchObject({ code: 'BLOCKED' });
  });

  it('200 bukan JSON (bukan tantangan) → PARSE_ERROR', async () => {
    stub({ [D]: [200, '<html>maintenance</html>'], [G]: [200, goldText] });
    await expect(lotusarchi.fetchRaw(ctx)).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  });

  it('metadata modul', () => {
    expect(lotusarchi.id).toBe('lotusarchi');
    expect(lotusarchi.parserVersion).toBe('lotusarchi@1.0.0');
  });
});
