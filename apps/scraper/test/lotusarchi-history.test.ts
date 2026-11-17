import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PriceRow } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import {
  lotusarchiHistory,
  parseHistory,
  selectUncovered,
} from '../src/backfill/lotusarchi-history';
import type { BackfillContext } from '../src/backfill/types';
import type { RawPayload } from '../src/sources/types';

// Histori lotusarchi.com (`harga-gold`): satu baris 1 g per tanggal, revisi = harga_id terbesar.

const g = (harga_id: number, tanggal: string, harga_emas: number, buyback_emas: number) => ({
  harga_id,
  harga_emas,
  buyback_emas,
  tanggal,
});
const raw = (data: unknown[]): RawPayload => ({
  body: JSON.stringify({ data }),
  contentType: 'application/json',
  fetchedAt: '2026-11-17T13:00:00Z',
});

// Terbaru dulu, seperti respons asli; 2026-11-16 ganda (revisi), 2025-03-01 buyback ≥ jual.
const sample = [
  g(521, '2026-11-17', 2397000, 2249000),
  g(520, '2026-11-16', 2406000, 2258000),
  g(519, '2026-11-16', 2400000, 2250000),
  g(300, '2025-03-01', 1500000, 1500000),
  g(2, '2025-02-28', 1490000, 1400000),
  g(1, '2025-02-27', 1480000, 1390000),
];

describe('lotusarchi-history parse', () => {
  const r = parseHistory(raw(sample));

  it('satu baris 1 g per tanggal, urut naik, field sesuai asumsi harga_emas = jual 1 g', () => {
    expect(r.rows.map((x) => x.date)).toEqual([
      '2025-02-27',
      '2025-02-28',
      '2026-11-16',
      '2026-11-17',
    ]);
    expect(r.rows[0]).toEqual({
      date: '2025-02-27',
      source: 'lotusarchi',
      brand: 'lotusarchi',
      product: 'gold_bar',
      variant: '',
      weight_g: 1,
      location: '',
      sell_price: 1480000,
      buyback_price: 1390000,
      source_updated_at: null,
    });
    expect(r.dataDate).toBe('2026-11-17');
  });

  it('tanggal ganda: harga_id terbesar menang', () => {
    const row = r.rows.find((x) => x.date === '2026-11-16')!;
    expect([row.sell_price, row.buyback_price]).toEqual([2406000, 2258000]);
  });

  it('baris tak masuk akal dibuang dan dicatat (buyback ≥ jual; harga 0; tanggal rusak)', () => {
    expect(r.rows.some((x) => x.date === '2025-03-01')).toBe(false);
    const more = parseHistory(
      raw([...sample, g(9, '2025-05-01', 0, 0), g(10, '2025-05-02', 1e6, 1.1e6), { tanggal: 'x' }]),
    );
    expect(more.rows).toHaveLength(4);
    expect(more.note).toContain(
      '4 tanggal/baris dibuang (1 bentuk tidak valid, 3 harga tidak masuk akal)',
    );
  });

  it('revisi terakhir yang rusak menggugurkan tanggalnya', () => {
    const x = parseHistory(
      raw([g(1, '2025-02-27', 1480000, 1390000), g(2, '2025-02-27', 1480000, 1480000)]),
    );
    expect(x.rows).toHaveLength(0);
    expect(x.dataDate).toBeNull();
  });

  it('bukan JSON / data bukan array → PARSE_ERROR', () => {
    expect(() => parseHistory({ ...raw([]), body: '<html>' })).toThrow(/bukan JSON/);
    expect(() => parseHistory({ ...raw([]), body: '{"data":1}' })).toThrow(/bukan array/);
  });
});

describe('lotusarchi-history select', () => {
  const rows = parseHistory(raw(sample)).rows;
  const ex = (over: Partial<PriceRow>): PriceRow =>
    ({ ...rows[0]!, origin: 'scrape', ...over }) as PriceRow;

  it('melewati tanggal yang sudah ada untuk lotusarchi × lotusarchi 1 g', () => {
    const out = selectUncovered(rows, [
      ex({ date: '2026-11-17' }),
      ex({ date: '2025-02-28', origin: 'backfill' }),
      ex({ date: '2025-02-27', source: 'galeri24' }), // sumber lain: tidak dihitung
      ex({ date: '2026-11-16', weight_g: 5 }), // gramasi lain: tidak dihitung
    ]);
    expect(out.map((x) => x.date)).toEqual(['2025-02-27', '2026-11-16']);
  });
});

describe('lotusarchi-history job', () => {
  const ctx = (input?: string): BackfillContext =>
    ({ root: '/', runId: 'r', userAgent: 'ua', now: new Date(), input }) as BackfillContext;

  it('localOnly; membaca file langsung atau folder berisi harga-gold.json; raw = isi file', async () => {
    expect(lotusarchiHistory.localOnly).toBe(true);
    const dir = await mkdtemp(path.join(tmpdir(), 'la-hist-'));
    const body = JSON.stringify({ data: sample });
    await writeFile(path.join(dir, 'harga-gold.json'), body);
    expect((await lotusarchiHistory.fetchRaw(ctx(dir))).body).toBe(body);
    expect((await lotusarchiHistory.fetchRaw(ctx(path.join(dir, 'harga-gold.json')))).body).toBe(
      body,
    );
  });

  it('tanpa --input, folder kosong, atau bukan JSON → error', async () => {
    await expect(lotusarchiHistory.fetchRaw(ctx())).rejects.toThrow(/--input wajib/);
    const dir = await mkdtemp(path.join(tmpdir(), 'la-hist-'));
    await expect(lotusarchiHistory.fetchRaw(ctx(dir))).rejects.toThrow();
    await mkdir(path.join(dir, 'x'));
    await writeFile(path.join(dir, 'harga-gold.json'), '<html>');
    await expect(lotusarchiHistory.fetchRaw(ctx(dir))).rejects.toThrow(/harga-gold/);
  });
});
