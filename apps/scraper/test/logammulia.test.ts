import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { validate } from '../src/pipeline/validate';
import { parse, parseUpdated, type LogamMuliaRaw } from '../src/sources/logammulia';
import type { RawPayload } from '../src/sources/types';
import { ROOT } from './helpers';

// P1-06 — parser Logam Mulia versi baru diuji dengan raw asli 26 Okt 2026 (TECH-SPEC §5.3, D-26).

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/logammulia');
const body = readFileSync(path.join(DIR, 'harga-emas-2026-10-26.json'), 'utf8');

const payload = (b: string): RawPayload => ({
  body: b,
  contentType: 'application/json',
  fetchedAt: '2026-10-26T03:30:00Z',
});
const edit = (fn: (raw: LogamMuliaRaw) => void) => {
  const raw = JSON.parse(body) as LogamMuliaRaw;
  fn(raw);
  return payload(JSON.stringify(raw));
};

describe('parse Logam Mulia', () => {
  const r = parse(payload(body));

  it('12 gramasi Emas Batangan dengan Harga Dasar sebagai sell_price', () => {
    expect(r.rows.map((x) => x.weight_g)).toEqual([
      0.5, 1, 2, 3, 5, 10, 25, 50, 100, 250, 500, 1000,
    ]);
    expect(r.rows.find((x) => x.weight_g === 0.5)?.sell_price).toBe(1_320_000);
    expect(r.rows.find((x) => x.weight_g === 1000)?.sell_price).toBe(2_480_600_000);
    expect(r.rows.every((x) => x.location === 'jakarta' && x.brand === 'antam')).toBe(true);
  });

  it('buyback hanya untuk 1 g, dari titik terakhir grafik Harga Jual hari itu', () => {
    const oneGram = r.rows.find((x) => x.weight_g === 1)!;
    expect(oneGram).toMatchObject({ sell_price: 2_540_000, buyback_price: 2_335_000 });
    expect(r.rows.filter((x) => x.buyback_price !== null)).toHaveLength(1);
  });

  it('tanggal dan waktu dari "Terakhir diperbarui"', () => {
    expect(r).toMatchObject({
      dataDate: '2026-10-26',
      sourceUpdatedAt: '2026-10-26T07:58:00+07:00',
      stale: null,
    });
  });

  it('grafik 1 g ≠ tabel → stale dan buyback dikosongkan', () => {
    const s = parse(edit((raw) => (raw.chart.sell.at(-1)!.y = 2_550_000)));
    expect(s.stale).toBe('grafik 1 g 2550000 ≠ tabel 2540000');
    expect(s.rows.every((x) => x.buyback_price === null)).toBe(true);
  });

  it('grafik tanpa titik hari ini → stale', () => {
    const s = parse(edit((raw) => (raw.chart.sell = raw.chart.sell.slice(0, -1))));
    expect(s.stale).toBe('grafik tanpa titik 2026-10-26');
  });

  it('butik lain → PARSE_ERROR', () => {
    expect(() =>
      parse(edit((raw) => (raw.text = raw.text.replaceAll('Jakarta Ekspedisi', 'Surabaya')))),
    ).toThrow(/butik/);
  });

  it('lolos validasi dengan katalog proyek', async () => {
    const { catalog } = await loadConfig(ROOT);
    const v = validate({
      source: 'logammulia',
      parsed: r,
      catalog,
      existing: [],
      today: '2026-10-26',
    });
    expect(v.outcome === 'ok' && v.rows.length).toBe(12);
  });
});

describe('parseUpdated', () => {
  it('membaca bulan Indonesia dan tanggal satu digit', () => {
    expect(parseUpdated('Terakhir diperbarui: Kamis, 5 Maret 2026 | 08:01 WIB')).toEqual({
      date: '2026-03-05',
      at: '2026-03-05T08:01:00+07:00',
    });
  });

  it('format lain → PARSE_ERROR', () => {
    expect(() => parseUpdated('Terakhir diperbarui: 26/10/2026')).toThrow(/tidak terbaca/);
  });
});
