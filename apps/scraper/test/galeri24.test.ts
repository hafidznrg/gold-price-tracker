import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { priceRowKey } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import {
  extractNuxtData,
  galeri24,
  GALERI24_VENDOR,
  mapEntries,
  parse,
  type Galeri24Raw,
} from '../src/sources/galeri24';
import type { RawPayload } from '../src/sources/types';

// P6-04 — parser Galeri24 diuji dengan fixture P6-01 (plan/research/galeri24.md §2).

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/galeri24');
const pageData = readFileSync(path.join(DIR, 'page-data-2026-11-17.json'), 'utf8');
const edge = readFileSync(path.join(DIR, 'page-data-edge-synthetic.json'), 'utf8');
const html = gunzipSync(readFileSync(path.join(DIR, 'harga-emas-2026-11-17.html.gz'))).toString();

const payload = (raw: Galeri24Raw): RawPayload => ({
  body: JSON.stringify(raw),
  contentType: 'application/json',
  fetchedAt: '2026-11-17T01:50:00Z',
});
const viaPageData = (body: string) => payload({ via: 'page-data', body });

type Entry = Record<string, string | null>;
const results = (body: string) => (JSON.parse(body) as { results: Entry[] }).results;
/** Fixture dengan `results` diubah oleh `fn`. */
const edit = (fn: (r: Entry[]) => Entry[]) =>
  viaPageData(JSON.stringify({ results: fn(results(pageData)) }));
const entry = (over: Entry): Entry => ({
  id: 'x',
  price: '2400000',
  margin: '2.5',
  sellingPrice: '2460000',
  buybackPrice: '2300000',
  description: null,
  vendorCode: '00005202003010',
  date: '2026-11-17',
  denomination: '3',
  status: '1',
  createdAt: '2026-11-16T14:39:00.000Z',
  updatedAt: '2026-11-16T14:39:00.000Z',
  vendorName: 'GALERI 24',
  ...over,
});

const rowOf = (
  rows: ReturnType<typeof parse>['rows'],
  brand: string,
  variant: string,
  weight: number,
) => rows.find((r) => r.brand === brand && r.variant === variant && r.weight_g === weight);

const REQUIRED_CODES = ['00005201808001', '00005201808002', '00005202003010'];

describe('parse — page-data 17 Nov 2026', () => {
  const r = parse(viaPageData(pageData));

  it('jumlah baris per brand; vendor lain diabaikan', () => {
    const count = (brand: string, variant: string) =>
      r.rows.filter((x) => x.brand === brand && x.variant === variant).length;
    expect(count('antam', '')).toBe(9);
    expect(count('ubs', '')).toBe(10);
    expect(count('galeri24', '')).toBe(11);
    expect(count('lotusarchi', '')).toBe(6);
    expect(count('antam', 'non_pegadaian')).toBe(9);
    expect(r.rows).toHaveLength(45);
  });

  it('nilai 1 g (jual / buyback)', () => {
    const want: [string, string, number, number][] = [
      ['galeri24', '', 2_456_000, 2_312_000],
      ['antam', '', 2_560_000, 2_286_000],
      ['ubs', '', 2_480_000, 2_286_000],
      ['lotusarchi', '', 2_471_000, 2_286_000],
      ['antam', 'non_pegadaian', 2_464_000, 2_178_000],
    ];
    for (const [brand, variant, sell, buyback] of want) {
      const row = rowOf(r.rows, brand, variant, 1)!;
      expect([row.sell_price, row.buyback_price], `${brand} ${variant}`).toEqual([sell, buyback]);
    }
  });

  it('metadata baris dan run', () => {
    const row = rowOf(r.rows, 'antam', '', 1)!;
    expect(row).toMatchObject({
      date: '2026-11-17',
      source: 'galeri24',
      product: 'gold_bar',
      location: '',
    });
    expect(row.source_updated_at).toMatch(/^2026-11-16T2[12]:\d\d:\d\d\+07:00$/);
    expect(r.dataDate).toBe('2026-11-17');
    expect(r.sourceUpdatedAt).toMatch(/^2026-11-16T21:/);
    expect(r.stale).toBeNull();
    expect(r.note).toBeUndefined();
  });

  it('rumus V-12 cocok untuk seluruh baris fixture', () => {
    expect(r.suspect).toBeUndefined();
  });
});

describe('parse — jalur nuxt', () => {
  it('data.goldPrice dari __NUXT_DATA__ = baris page-data untuk snapshot yang sama', () => {
    const nuxt = parse(payload({ via: 'nuxt', body: extractNuxtData(html) }));
    const direct = parse(viaPageData(pageData));
    // Urutan dalam `data.goldPrice` bisa beda dari `results`; isi barisnya harus sama.
    const byKey = (rows: typeof direct.rows) =>
      [...rows].sort((a, b) => (priceRowKey(a) < priceRowKey(b) ? -1 : 1));
    expect(byKey(nuxt.rows)).toEqual(byKey(direct.rows));
    expect(nuxt.dataDate).toBe(direct.dataDate);
    expect(nuxt.sourceUpdatedAt).toBe(direct.sourceUpdatedAt);
    expect(nuxt.note).toMatch(/fallback __NUXT_DATA__/);
  });

  it('payload tanpa data.goldPrice → PARSE_ERROR', () => {
    expect(() => parse(payload({ via: 'nuxt', body: '[["Reactive",1],{"data":2},{}]' }))).toThrow(
      expect.objectContaining({ code: 'PARSE_ERROR' }),
    );
  });
});

describe('parse — fixture sintetis dan kasus tepi', () => {
  it('tanggal campur di brand wajib → VALIDATION_FAILED', () => {
    expect(() => parse(viaPageData(edge))).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });

  it('buyback "0" → null; status "3" diabaikan', () => {
    const r = parse(
      edit((rs) => [
        ...rs.map((x) =>
          x.vendorCode === '00005202003010' && x.denomination === '0.5'
            ? { ...x, buybackPrice: '0' }
            : x,
        ),
        entry({
          vendorCode: '00005201808002',
          denomination: '3',
          status: '3',
          sellingPrice: '9999000',
          updatedAt: '2030-01-01T00:00:00.000Z',
        }),
      ]),
    );
    expect(rowOf(r.rows, 'galeri24', '', 0.5)!.buyback_price).toBeNull();
    expect(rowOf(r.rows, 'ubs', '', 3)).toBeUndefined();
    expect(r.rows).toHaveLength(45);
    expect(r.sourceUpdatedAt).toMatch(/^2026-11-16T/);
  });

  it('Lotus Archi bertanggal lain dibuang + note', () => {
    const r = parse(
      edit((rs) =>
        rs.map((x) =>
          x.vendorCode === '00005202001009' && x.denomination === '5'
            ? { ...x, date: '2026-11-16' }
            : x,
        ),
      ),
    );
    expect(r.rows.filter((x) => x.brand === 'lotusarchi')).toHaveLength(5);
    expect(r.note).toMatch(/lotusarchi 5 g: date 2026-11-16 ≠ 2026-11-17, dibuang/);
    expect(r.dataDate).toBe('2026-11-17');
  });

  it('Lotus Archi dengan buyback ≥ jual dibuang + note (V-03 baris opsional)', () => {
    const r = parse(
      edit((rs) =>
        rs.map((x) =>
          x.vendorCode === '00005202001009' && x.denomination === '1'
            ? ({ ...x, buybackPrice: x.sellingPrice } as Entry)
            : x,
        ),
      ),
    );
    expect(rowOf(r.rows, 'lotusarchi', '', 1)).toBeUndefined();
    expect(r.rows).toHaveLength(44);
    expect(r.note).toMatch(/lotusarchi 1 g: buyback .* ≥ jual .*, dibuang/);
  });

  it('duplikat status 1 → updatedAt terbesar + note', () => {
    const r = parse(
      edit((rs) => [
        ...rs,
        entry({
          vendorCode: '00005202003010',
          denomination: '1',
          price: '2400000',
          margin: '2.5',
          sellingPrice: '2460000',
          buybackPrice: '2320000',
          updatedAt: '2026-11-17T01:00:00.000Z',
        }),
      ]),
    );
    const row = rowOf(r.rows, 'galeri24', '', 1)!;
    expect(row.buyback_price).toBe(2_320_000);
    expect(row.source_updated_at).toBe('2026-11-17T08:00:00+07:00');
    expect(r.rows.filter((x) => x.brand === 'galeri24' && x.weight_g === 1)).toHaveLength(1);
    expect(r.note).toMatch(/duplikat 2026-11-17\|00005202003010\|1 \(2 entri status 1\)/);
    expect(r.sourceUpdatedAt).toBe('2026-11-17T08:00:00+07:00');
  });

  it('V-12: sellingPrice tidak cocok rumus → suspect, baris tetap ada', () => {
    const r = parse(
      edit((rs) =>
        rs.map((x) =>
          x.vendorCode === '00005201808001' && x.denomination === '2'
            ? { ...x, sellingPrice: String(Number(x.sellingPrice) + 1000) }
            : x,
        ),
      ),
    );
    const row = rowOf(r.rows, 'antam', '', 2)!;
    expect(row).toBeDefined();
    expect(r.suspect).toEqual([
      expect.objectContaining({ key: priceRowKey(row), reason: 'PRICE_FORMULA' }),
    ]);
  });

  it('non_pegadaian: jual 0 → sell_price null; kedua harga 0 → dilewati', () => {
    const r = parse(
      edit((rs) =>
        rs.map((x) => {
          if (x.vendorCode !== '00005201905007') return x;
          if (x.denomination === '1') return { ...x, sellingPrice: '0' };
          if (x.denomination === '2') return { ...x, sellingPrice: '0', buybackPrice: '0' };
          return x;
        }),
      ),
    );
    expect(rowOf(r.rows, 'antam', 'non_pegadaian', 1)).toMatchObject({
      sell_price: null,
      buyback_price: 2_178_000,
    });
    expect(rowOf(r.rows, 'antam', 'non_pegadaian', 2)).toBeUndefined();
    expect(r.suspect).toBeUndefined();
  });

  it('brand wajib dengan jual 0 → dilewati', () => {
    const r = parse(
      edit((rs) =>
        rs.map((x) =>
          x.vendorCode === '00005201808001' && x.denomination === '3'
            ? { ...x, sellingPrice: '0' }
            : x,
        ),
      ),
    );
    expect(rowOf(r.rows, 'antam', '', 3)).toBeUndefined();
  });

  it('tanpa brand wajib sama sekali → dataDate null', () => {
    const r = parse(edit((rs) => rs.filter((x) => !REQUIRED_CODES.includes(x.vendorCode!))));
    expect(r.dataDate).toBeNull();
    expect(r.sourceUpdatedAt).toBeNull();
  });

  it('harga bukan integer → PARSE_ERROR', () => {
    expect(() => parse(edit((rs) => [...rs, entry({ sellingPrice: '2460000.5' })]))).toThrow(
      expect.objectContaining({ code: 'PARSE_ERROR' }),
    );
  });

  it('respons rusak → PARSE_ERROR', () => {
    for (const body of ['<html>blokir</html>', '{"count":0}', '']) {
      expect(() => parse(viaPageData(body))).toThrow(
        expect.objectContaining({ code: 'PARSE_ERROR' }),
      );
    }
    expect(() =>
      parse({ body: 'bukan json', contentType: 'application/json', fetchedAt: '' }),
    ).toThrow(expect.objectContaining({ code: 'PARSE_ERROR' }));
  });
});

describe('modul', () => {
  it('tabel vendor dan versi parser', () => {
    expect(galeri24.parserVersion).toBe('galeri24@1.0.0');
    expect(Object.values(GALERI24_VENDOR).filter((v) => v.required)).toHaveLength(3);
    expect(GALERI24_VENDOR['00005201905007']).toEqual({
      brand: 'antam',
      variant: 'non_pegadaian',
      required: false,
    });
  });

  it('mapEntries dapat dipakai ulang job histori', () => {
    const { mapped, notes } = mapEntries(results(pageData));
    expect(mapped).toHaveLength(45);
    expect(notes).toEqual([]);
  });

  it('extractNuxtData tanpa script → PARSE_ERROR', () => {
    expect(() => extractNuxtData('<html></html>')).toThrow(
      expect.objectContaining({ code: 'PARSE_ERROR' }),
    );
  });
});
