import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { ScrapeError } from '../src/pipeline/errors';
import { scrape, SCRAPE_EXIT } from '../src/pipeline/scrape';
import { parse, pegadaian } from '../src/sources/pegadaian';
import type { RawPayload } from '../src/sources/types';
import { ROOT, tempRoot } from './helpers';

// P1-07 — parser Pegadaian diuji dengan fixture P0-08 (TECH-SPEC §5.2, D-20).

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/pegadaian');
const sunday = readFileSync(path.join(DIR, 'prices-table-2026-10-25-sunday.json'), 'utf8');
const edge = readFileSync(path.join(DIR, 'prices-table-edge-synthetic.json'), 'utf8');

const payload = (body: string): RawPayload => ({
  body,
  contentType: 'application/json',
  fetchedAt: '2026-10-25T01:50:00Z',
});

/** Ubah respons fixture: `fn` menerima objek JSON hasil parse. */
const edit = (
  body: string,
  fn: (json: { data: Record<string, unknown>[] } & Record<string, unknown>) => void,
) => {
  const json = JSON.parse(body);
  fn(json);
  return JSON.stringify(json);
};

describe('parse', () => {
  const r = parse(payload(sunday));

  it('tiga brand target lewat idVendor; vendor lain (Retro, Disney, Batik, …) diabaikan', () => {
    const count = (b: string) => r.rows.filter((x) => x.brand === b).length;
    expect([count('galeri24'), count('antam'), count('ubs')]).toEqual([11, 9, 10]);
    expect(r.rows).toHaveLength(30);
  });

  it('tglBerlaku → date dan data_date; hargaJual → sell; buyback kosong (Q-1)', () => {
    expect(r.dataDate).toBe('2026-10-24');
    expect(r.stale).toBeNull();
    const one = (b: string) => r.rows.find((x) => x.brand === b && x.weight_g === 1)!;
    expect(one('galeri24')).toMatchObject({
      sell_price: 2_467_000,
      buyback_price: null,
      date: '2026-10-24',
    });
    expect(one('antam').sell_price).toBe(2_579_000);
    expect(one('ubs').sell_price).toBe(2_491_000);
    expect(
      r.rows.every((x) => x.variant === '' && x.location === '' && x.product === 'gold_bar'),
    ).toBe(true);
  });

  it('idHarga → source_updated_at (Jakarta); dataset → yang terbaru', () => {
    const antam = r.rows.find((x) => x.brand === 'antam')!;
    expect(antam.source_updated_at).toBe('2026-10-24T10:20:16+07:00');
    expect(r.sourceUpdatedAt).toBe('2026-10-24T10:21:02+07:00');
  });

  it('hargaJual = 0 dibuang', () => {
    expect(r.rows.every((x) => (x.sell_price ?? 0) > 0)).toBe(true);
    expect(r.rows.some((x) => x.weight_g === 0.05)).toBe(false);
  });

  it('gramasi per brand = config/catalog.yml (tidak ada karantina pada data normal)', async () => {
    const config = await loadConfig(ROOT);
    for (const brand of ['antam', 'ubs', 'galeri24']) {
      const weights = r.rows
        .filter((x) => x.brand === brand)
        .map((x) => x.weight_g)
        .sort((a, b) => a - b);
      const catalog = config.catalog
        .filter((i) => i.source === 'pegadaian' && i.brand === brand)
        .map((i) => i.weight_g)
        .sort((a, b) => a - b);
      expect(weights, brand).toEqual(catalog);
    }
  });

  it('fixture Senin 09.43 WIB: harga Minggu (PER I) dibuat Sabtu malam, nilai sama dengan Sabtu', () => {
    const monday = readFileSync(
      path.join(DIR, 'prices-table-2026-10-26-monday-per-i.json'),
      'utf8',
    );
    const m = parse(payload(monday));
    expect(m.dataDate).toBe('2026-10-25');
    expect(m.sourceUpdatedAt?.slice(0, 13)).toBe('2026-10-24T18');
    expect(m.rows).toHaveLength(30);
    const oneGram = (x: typeof m) =>
      x.rows.filter((row) => row.weight_g === 1).map((row) => row.sell_price);
    expect(oneGram(m)).toEqual(oneGram(r));
  });

  it('tglBerlaku berbeda antar brand → VALIDATION_FAILED', () => {
    expect(() => parse(payload(edge))).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        message: expect.stringContaining('antam 2026-10-23'),
      }),
    );
  });

  it('responseCode bukan Approved atau body bukan JSON → PARSE_ERROR', () => {
    const denied = edit(sunday, (j) => {
      j.responseCode = '4000000100';
    });
    expect(() => parse(payload(denied))).toThrow(ScrapeError);
    expect(() => parse(payload('<html>Just a moment</html>'))).toThrow(/bukan JSON/);
  });

  it('harga bukan integer → PARSE_ERROR', () => {
    const broken = edit(sunday, (j) => {
      const ubs = j.data.find((v) => v.idVendor === '00005201808002')!;
      (ubs.hargaMuliaDetails as { berat: number; hargaJual: unknown }[]).find(
        (d) => d.berat === 1,
      )!.hargaJual = '2491000';
    });
    expect(() => parse(payload(broken))).toThrow(/ubs 1 g/);
  });

  it('modul: parserVersion = id@parser_version di config/sources.yml', async () => {
    const config = await loadConfig(ROOT);
    const source = config.sources.find((s) => s.id === 'pegadaian')!;
    expect(pegadaian.parserVersion).toBe(`pegadaian@${source.parser_version}`);
  });
});

describe('scrape pegadaian', () => {
  let root: string;
  beforeEach(async () => {
    root = await tempRoot();
  });

  const run = (body: string, now: string) =>
    scrape({
      root,
      source: 'pegadaian',
      slot: 'primary',
      trigger: 'schedule',
      out: path.join(root, 'out', 'pegadaian'),
      runId: '400-1',
      userAgent: 'test',
      now: new Date(now),
      scraper: { ...pegadaian, fetchRaw: async () => payload(body) },
    });

  it('Sabtu dengan data Sabtu → success, 30 baris', async () => {
    expect(await run(sunday, '2026-10-24T03:30:00Z')).toMatchObject({
      status: 'success',
      rows_parsed: 30,
      exit_code: SCRAPE_EXIT.OK,
    });
  });

  it('Minggu masih data Sabtu → stale di hari yang diharapkan (daily) → kode 3', async () => {
    // Harga Minggu biasanya sudah terbit Sabtu malam (P1-07), jadi data Sabtu di hari Minggu = basi.
    expect(await run(sunday, '2026-10-25T03:30:00Z')).toMatchObject({
      status: 'stale',
      expected_day: true,
      exit_code: SCRAPE_EXIT.STALE,
    });
  });

  it('fixture tepi (tanggal disamakan): Galeri 24 hanya 3 gramasi → V-04 gagal', async () => {
    const sameDate = edit(edge, (j) => {
      for (const v of j.data) v.tglBerlaku = '2026-10-24';
    });
    const r = await run(sameDate, '2026-10-24T03:30:00Z');
    expect(r).toMatchObject({ status: 'failed', error_code: 'VALIDATION_FAILED', exit_code: 1 });
    expect(r.error_message).toContain('galeri24 3 gramasi');
  });

  it('gramasi di luar katalog (UBS 1,06 g mulai dijual) → karantina UNKNOWN_ITEM, partial', async () => {
    const extra = edit(sunday, (j) => {
      const ubs = j.data.find((v) => v.idVendor === '00005201808002')!;
      (ubs.hargaMuliaDetails as { berat: number; hargaJual: number }[]).find(
        (d) => d.berat === 1.06,
      )!.hargaJual = 2_600_000;
    });
    const r = await run(extra, '2026-10-24T03:30:00Z');
    expect(r).toMatchObject({ status: 'partial', rows_parsed: 31, rows_held: 1, exit_code: 0 });
  });
});
