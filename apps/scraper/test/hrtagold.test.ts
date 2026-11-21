import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { ScrapeError } from '../src/pipeline/errors';
import { validate } from '../src/pipeline/validate';
import { getScraper } from '../src/sources';
import { hrtagold, parse } from '../src/sources/hrtagold';
import type { FetchContext, RawPayload } from '../src/sources/types';
import { ROOT } from './helpers';

// P7-05 — parser EMASKU/Hartadinata diuji dengan respons asli 21 Nov 2026 (plan/research/hartadinata.md §2).

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/hrtagold');
const text = readFileSync(path.join(DIR, 'price-daily-2026-11-21.json'), 'utf8');
const edgeText = readFileSync(path.join(DIR, 'price-daily-edge-synthetic.json'), 'utf8');
type Body = {
  code: number;
  updated_date: unknown;
  data: { series: unknown; prices: Record<string, unknown>[] }[];
};
const real = JSON.parse(text) as Body;

const payload = (raw: unknown): RawPayload => ({
  body: typeof raw === 'string' ? raw : JSON.stringify(raw),
  contentType: 'application/json',
  fetchedAt: '2026-11-21T02:00:00Z',
});
const base = (): Body => structuredClone(real);
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof ScrapeError ? err.code : String(err);
  }
  return null;
};

const GOLD_WEIGHTS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 125, 150, 175, 200, 250, 500, 1000];

describe('parse (respons asli 21 Nov 2026)', () => {
  const r = parse(payload(text));
  const gold = r.rows.filter((x) => x.variant === '');
  const prime = r.rows.filter((x) => x.variant === 'prime');

  it('17 baris Gold + 3 baris Prime, tanggal dan waktu terbit WIB', () => {
    expect(gold.map((x) => x.weight_g)).toEqual(GOLD_WEIGHTS);
    expect(prime.map((x) => x.weight_g)).toEqual([25, 50, 100]);
    expect(r.rows).toHaveLength(20);
    expect(r.dataDate).toBe('2026-11-21');
    expect(r.sourceUpdatedAt).toBe('2026-11-21T08:12:26+07:00');
    expect(r.stale).toBeNull();
    expect(r.note).toBeUndefined();
    for (const x of r.rows) {
      expect(x).toMatchObject({
        date: '2026-11-21',
        source: 'hrtagold',
        brand: 'emasku',
        product: 'gold_bar',
        location: '',
        source_updated_at: '2026-11-21T08:12:26+07:00',
      });
    }
  });

  it('nilai per keping: 1 g, 0,1 g, 1.000 g, Prime', () => {
    const at = (rows: typeof r.rows, w: number) => rows.find((x) => x.weight_g === w)!;
    expect(at(gold, 1)).toMatchObject({ sell_price: 2_258_000, buyback_price: 2_122_000 });
    expect(at(gold, 0.1)).toMatchObject({ sell_price: 287_000, buyback_price: 212_200 });
    expect(at(gold, 1000)).toMatchObject({
      sell_price: 2_186_000_000,
      buyback_price: 2_086_500_000,
    });
    expect(at(prime, 25)).toMatchObject({ sell_price: 55_575_000, buyback_price: 53_050_000 });
    expect(at(prime, 100)).toMatchObject({ sell_price: 222_300_000, buyback_price: 212_200_000 });
  });

  it('urutan array diacak → hasil sama', () => {
    const raw = base();
    raw.data.reverse();
    for (const s of raw.data) s.prices.reverse();
    expect(parse(payload(raw)).rows).toEqual(r.rows);
  });

  it('katalog dan validasi menerima seluruh baris (tanpa karantina)', async () => {
    const config = await loadConfig(ROOT);
    const v = validate({
      source: 'hrtagold',
      parsed: r,
      catalog: config.catalog,
      existing: [],
      today: '2026-11-21',
    });
    expect(v.outcome).toBe('ok');
    if (v.outcome === 'ok') {
      expect(v.rows).toHaveLength(20);
      expect(v.held).toEqual([]);
      expect(v.notes).toBeUndefined();
    }
  });
});

describe('parse (kasus tepi)', () => {
  it('tanggal kemarin → dataDate kemarin; validate = stale, accept_previous_day = ok', async () => {
    const raw = base();
    raw.updated_date = '2026-11-20T08:12:26+07:00';
    const r = parse(payload(raw));
    expect(r.dataDate).toBe('2026-11-20');
    const config = await loadConfig(ROOT);
    const input = { source: 'hrtagold', parsed: r, catalog: config.catalog, existing: [] } as const;
    expect(validate({ ...input, today: '2026-11-21' }).outcome).toBe('stale');
    expect(validate({ ...input, today: '2026-11-21', acceptPreviousDay: true }).outcome).toBe('ok');
  });

  it('offset lain dinormalkan ke WIB; tanggal WIB dipakai', () => {
    const raw = base();
    raw.updated_date = '2026-11-20T18:30:00Z'; // = 21 Nov 01.30 WIB
    const r = parse(payload(raw));
    expect(r.dataDate).toBe('2026-11-21');
    expect(r.sourceUpdatedAt).toBe('2026-11-21T01:30:00+07:00');
  });

  it('updated_date rusak atau tanpa offset → PARSE_ERROR', () => {
    for (const bad of ['kemarin', '2026-11-21T08:12:26', '2026-13-45T08:12:26+07:00', null, 5]) {
      const raw = base();
      raw.updated_date = bad;
      expect(code(() => parse(payload(raw)))).toBe('PARSE_ERROR');
    }
  });

  it('bentuk tak dikenal → PARSE_ERROR', () => {
    expect(code(() => parse(payload('<html>maintenance</html>')))).toBe('PARSE_ERROR');
    expect(code(() => parse(payload({ ...base(), code: 500 })))).toBe('PARSE_ERROR');
    expect(code(() => parse(payload({ ...base(), data: [] })))).toBe('PARSE_ERROR');
    expect(code(() => parse(payload({ ...base(), data: 'x' })))).toBe('PARSE_ERROR');
    const noPrices = base();
    (noPrices.data[0] as { prices: unknown }).prices = 'x';
    expect(code(() => parse(payload(noPrices)))).toBe('PARSE_ERROR');
  });

  it('seri Gold hilang (fixture sintetis: hanya Prime) → PARSE_ERROR', () => {
    expect(code(() => parse(payload(edgeText)))).toBe('PARSE_ERROR');
    const raw = base();
    raw.data = raw.data.filter((s) => s.series !== 'Gold');
    expect(code(() => parse(payload(raw)))).toBe('PARSE_ERROR');
  });

  it('seri tak dikenal → dilewati + note, bukan karantina', () => {
    const raw = base();
    raw.data.push({ series: 'Ardore', prices: [{ gramasi: 1, price: 3_000_000 }] });
    const r = parse(payload(raw));
    expect(r.rows).toHaveLength(20);
    expect(r.note).toMatch(/Ardore.*dilewati/);
  });

  it('angka bukan integer aman / negatif / string → PARSE_ERROR; gramasi tidak valid → PARSE_ERROR', () => {
    for (const [field, value] of [
      ['price', 2_258_000.5],
      ['price', '2258000'],
      ['price', -1],
      ['buyback_price', 1e300],
      ['gramasi', 0],
      ['gramasi', '1'],
    ] as const) {
      const raw = base();
      raw.data[0]!.prices[3]![field] = value;
      expect(code(() => parse(payload(raw)))).toBe('PARSE_ERROR');
    }
  });

  it('harga 0/null → null; keduanya kosong → baris dilewati', () => {
    const raw = base();
    const p = raw.data[0]!.prices;
    p[3]!.buyback_price = 0;
    p[4]!.price = null;
    p[5]!.price = 0;
    p[5]!.buyback_price = null;
    const r = parse(payload(raw));
    const gold = r.rows.filter((x) => x.variant === '');
    expect(gold).toHaveLength(16);
    expect(gold.find((x) => x.weight_g === 1)).toMatchObject({
      sell_price: 2_258_000,
      buyback_price: null,
    });
    expect(gold.find((x) => x.weight_g === 2)).toMatchObject({
      sell_price: null,
      buyback_price: 4_244_000,
    });
    expect(gold.find((x) => x.weight_g === 5)).toBeUndefined();
  });

  it('duplikat gramasi dalam satu seri → entri terakhir + note', () => {
    const raw = base();
    raw.data[0]!.prices.push({
      gramasi_id: 99,
      gramasi: 1,
      price: 2_300_000,
      buyback_price: 2_150_000,
    });
    const r = parse(payload(raw));
    expect(r.rows.filter((x) => x.variant === '' && x.weight_g === 1)).toEqual([
      expect.objectContaining({ sell_price: 2_300_000, buyback_price: 2_150_000 }),
    ]);
    expect(r.note).toMatch(/duplikat Gold 1 g/);
  });
});

describe('fetchRaw', () => {
  afterEach(() => vi.unstubAllGlobals());
  const ctx = { userAgent: 'test-ua', retryDelayMs: 0, pauseMs: 0 } as unknown as FetchContext;
  const stub = (status: number, body: string) => {
    const fn = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal('fetch', fn);
    return fn;
  };

  it('satu GET dengan User-Agent proyek, tanpa Origin/Referer/cookie; raw = body utuh', async () => {
    const fn = stub(200, text);
    const raw = await hrtagold.fetchRaw(ctx);
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://hrtagold.id/api/v1/brandings/price/daily');
    expect(init.headers).toEqual({ 'User-Agent': 'test-ua', Accept: 'application/json' });
    expect(raw.body).toBe(text);
    expect(raw.contentType).toBe('application/json');
    expect(parse(raw).rows).toHaveLength(20);
  });

  it('403 dengan halaman tantangan → BLOCKED tanpa retry', async () => {
    const fn = stub(403, '<title>Just a moment...</title><div id="cf-chl-widget"></div>');
    await expect(hrtagold.fetchRaw(ctx)).rejects.toMatchObject({ code: 'BLOCKED' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('HTTP 200 berisi tantangan → BLOCKED', async () => {
    stub(200, '<html><title>Just a moment...</title></html>');
    await expect(hrtagold.fetchRaw(ctx)).rejects.toMatchObject({ code: 'BLOCKED' });
  });

  it('200 bukan JSON → PARSE_ERROR', async () => {
    stub(200, '<html>maintenance</html>');
    await expect(hrtagold.fetchRaw(ctx)).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  });

  it('metadata modul dan registri', () => {
    expect(hrtagold.id).toBe('hrtagold');
    expect(hrtagold.kind).toBe('prices');
    expect(hrtagold.parserVersion).toBe('hrtagold@1.0.0');
    expect(getScraper('hrtagold')).toBe(hrtagold);
  });
});

describe('config', () => {
  it('sumber hrtagold aktif (P7-07, Q-11 diputuskan)', async () => {
    const config = await loadConfig(ROOT);
    const s = config.sources.find((x) => x.id === 'hrtagold')!;
    expect(s).toMatchObject({ kind: 'prices', enabled: true, parser_version: '1.0.0' });
    expect(s.accept_previous_day).toBe(true);
  });
});
