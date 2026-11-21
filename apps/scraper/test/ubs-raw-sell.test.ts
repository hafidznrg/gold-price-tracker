import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type { PriceRow } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { fetchDateWib, parseRawSell, selectWithoutSell } from '../src/backfill/ubs-raw-sell';
import type { RawPayload } from '../src/sources/types';

// D-78 — harga jual UBS dari arsip raw untuk hari terbit tanpa titik grafik (21 Nov 2026).

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/ubslifestyle');
const gz = (name: string) => gunzipSync(readFileSync(path.join(DIR, name))).toString('utf8');
const final20 = gz('raw-2026-11-20T122046Z-final.json.gz');
const sell21 = gz('raw-2026-11-21T092035Z-sell-only.json.gz');

const REF = { name: '2026-11/2026-11-20T122046Z-5884a6cd.json.gz', body: final20 };
const SAT = { name: '2026-11/2026-11-21T092035Z-bc9915d5.json.gz', body: sell21 };

const raw = (snapshots: { name: string; body: string }[], holidays: string[] = []): RawPayload => ({
  body: JSON.stringify({ holidays, snapshots }),
  contentType: 'application/json',
  fetchedAt: '2026-11-22T00:00:00Z',
});

describe('ubs-raw-sell (D-78)', () => {
  it('tanggal WIB dari nama raw', () => {
    expect(fetchDateWib('2026-11/2026-11-21T092035Z-bc9915d5.json.gz')).toBe('2026-11-21');
    expect(fetchDateWib('2026-11-20T173000Z-x.json.gz')).toBe('2026-11-21');
    expect(fetchDateWib('raw.json.gz')).toBeNull();
  });

  it('Sabtu 21 Nov: harga jual baru, buyback kosong, tanggal = tanggal fetch', () => {
    const r = parseRawSell(raw([SAT, REF]));
    expect(r.rows).toHaveLength(13);
    expect(r.rows.every((x) => x.date === '2026-11-21' && x.buyback_price === null)).toBe(true);
    expect(r.rows.every((x) => x.source === 'ubslifestyle' && x.variant === '2026')).toBe(true);
    const oneGram = r.rows.find((x) => x.weight_g === 1);
    expect(oneGram?.sell_price).toBe(2278500);
    expect(r.rows.find((x) => x.weight_g === 100)?.sell_price).toBe(217110900);
    expect(r.dataDate).toBe('2026-11-21');
    expect(r.note).toBe(
      '2 snapshot dibaca, 0 dilewati, 13 baris harga jual di 1 tanggal (2026-11-21)',
    );
  });

  it('tanpa snapshot pembanding pada tanggal grafik → tidak ada baris', () => {
    expect(parseRawSell(raw([SAT])).rows).toHaveLength(0);
  });

  it('harga jual sama dengan versi final tanggal grafik → tidak ada baris', () => {
    const same = { name: '2026-11/2026-11-21T092035Z-same.json.gz', body: final20 };
    expect(parseRawSell(raw([REF, same])).rows).toHaveLength(0);
  });

  it('bukan hari terbit (Minggu atau libur) → tidak ada baris', () => {
    const sunday = { name: '2026-11/2026-11-22T020000Z-sun.json.gz', body: sell21 };
    expect(parseRawSell(raw([REF, sunday])).rows).toHaveLength(0);
    expect(parseRawSell(raw([REF, SAT], ['2026-11-21'])).rows).toHaveLength(0);
  });

  it('snapshot rusak dilewati dan dihitung', () => {
    const bad = { name: '2026-11/2026-11-21T100000Z-bad.json.gz', body: '<html>blok</html>' };
    const r = parseRawSell(raw([REF, SAT, bad]));
    expect(r.rows).toHaveLength(13);
    expect(r.note).toContain('3 snapshot dibaca, 1 dilewati');
  });

  it('select membuang tanggal yang sudah punya harga jual', () => {
    const rows = parseRawSell(raw([REF, SAT])).rows;
    const scraped = { ...rows[0], origin: 'scrape' } as unknown as PriceRow;
    const historyOnly = { ...rows[0], sell_price: null, buyback_price: 2115000 } as PriceRow;
    expect(selectWithoutSell(rows, [historyOnly])).toHaveLength(13);
    expect(selectWithoutSell(rows, [scraped])).toHaveLength(0);
  });
});
