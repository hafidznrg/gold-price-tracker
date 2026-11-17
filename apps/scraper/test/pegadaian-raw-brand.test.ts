import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { PriceRow } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import {
  parseSnapshots,
  pegadaianRawBrand,
  selectUncoveredBrand,
} from '../src/backfill/pegadaian-raw-brand';
import type { RawPayload } from '../src/sources/types';

// P6-08 — histori Lotus Archi dari arsip raw Pegadaian, dengan fixture Pegadaian yang ada.

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/pegadaian');
const fixture = (name: string) => readFileSync(path.join(DIR, name), 'utf8');
const sunday = fixture('prices-table-2026-10-25-sunday.json'); // tglBerlaku 24 Okt
const monday = fixture('prices-table-2026-10-26-monday-per-i.json'); // tglBerlaku 25 Okt
const edge = fixture('prices-table-edge-synthetic.json'); // tanggal campur → VALIDATION_FAILED
const savings = fixture('tabungan-2026-10-25.json');

const LOTUS = '00005202001009';
const wrapped = JSON.stringify({ table: sunday, savings });

const raw = (snapshots: { name: string; body: string }[]): RawPayload => ({
  body: JSON.stringify({ snapshots }),
  contentType: 'application/json',
  fetchedAt: '2026-11-17T00:00:00Z',
});

describe('pegadaian-raw-brand (P6-08)', () => {
  it('hanya baris lotusarchi; snapshot gagal parse dilewati dan dihitung', () => {
    const r = parseSnapshots(
      raw([
        { name: 'a.json.gz', body: wrapped },
        { name: 'b.json.gz', body: monday },
        { name: 'c.json.gz', body: edge },
        { name: 'd.json.gz', body: '<html>Just a moment</html>' },
      ]),
    );
    expect(r.rows.every((x) => x.brand === 'lotusarchi' && x.source === 'pegadaian')).toBe(true);
    expect(r.rows).toHaveLength(12); // 2 tanggal × 6 gramasi
    expect(r.rows.every((x) => x.buyback_price === null)).toBe(true);
    expect([...new Set(r.rows.map((x) => x.date))]).toEqual(['2026-10-24', '2026-10-25']);
    expect(r.dataDate).toBe('2026-10-25');
    expect(r.note).toBe(
      '4 snapshot dibaca, 2 dilewati (gagal parse), 12 baris lotusarchi di 2 tanggal',
    );
  });

  it('beberapa snapshot sama tanggal → source_updated_at terbesar per tanggal × gramasi', () => {
    const bump = (body: string, ms: number, price: number) => {
      const j = JSON.parse(body);
      for (const v of j.data) {
        if (v.idVendor !== LOTUS) continue;
        v.idHarga = ms;
        for (const d of v.hargaMuliaDetails) if (d.berat === 1) d.hargaJual = price;
      }
      return JSON.stringify(j);
    };
    const newer = bump(sunday, Date.parse('2026-10-24T12:00:00Z'), 9_999_000);
    const older = bump(sunday, Date.parse('2026-10-24T01:00:00Z'), 1_111_000);
    // urutan sengaja: yang lebih baru di tengah
    const r = parseSnapshots(
      raw([
        { name: '1', body: older },
        { name: '2', body: newer },
        { name: '3', body: older },
      ]),
    );
    expect(r.rows).toHaveLength(6);
    expect(r.rows.find((x) => x.weight_g === 1)).toMatchObject({
      sell_price: 9_999_000,
      source_updated_at: '2026-10-24T19:00:00+07:00',
    });
  });

  it('select membuang tanggal yang sudah punya baris lotusarchi (asal apa pun)', () => {
    const rows = parseSnapshots(
      raw([
        { name: 'a', body: sunday },
        { name: 'b', body: monday },
      ]),
    ).rows;
    const existing = [
      { brand: 'lotusarchi', date: '2026-10-24', origin: 'backfill' },
      { brand: 'antam', date: '2026-10-25', origin: 'scrape' }, // brand lain tidak ikut menutup
    ] as PriceRow[];
    const kept = selectUncoveredBrand(rows, existing);
    expect(kept).toHaveLength(6);
    expect(new Set(kept.map((x) => x.date))).toEqual(new Set(['2026-10-25']));
    expect(pegadaianRawBrand.select).toBe(selectUncoveredBrand);
  });

  it('fetchRaw: baca *.json.gz rekursif terurut, lewati arsip gabungan, wajib --input', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pgd-raw-'));
    await mkdir(path.join(dir, '2026-10'), { recursive: true });
    await mkdir(path.join(dir, '2026-11'), { recursive: true });
    const gz = (file: string, text: string) => writeFile(path.join(dir, file), gzipSync(text));
    await gz('2026-11/2026-11-01T000000Z-b.json.gz', monday);
    await gz('2026-10/2026-10-26T000000Z-a.json.gz', wrapped);
    await gz('2026-10/2026-10-27T000000Z-merged.json.gz', JSON.stringify({ snapshots: [] }));
    await writeFile(path.join(dir, '2026-10/catatan.txt'), 'bukan arsip');

    const ctx = { root: dir, runId: 'local-x', userAgent: 't', now: new Date() };
    const got = await pegadaianRawBrand.fetchRaw({ ...ctx, input: dir });
    const { snapshots } = JSON.parse(got.body) as { snapshots: { name: string; body: string }[] };
    expect(snapshots.map((s) => s.name)).toEqual([
      '2026-10/2026-10-26T000000Z-a.json.gz',
      '2026-11/2026-11-01T000000Z-b.json.gz',
    ]);
    expect(snapshots[0]!.body).toBe(wrapped);
    expect(parseSnapshots(got).rows).toHaveLength(12);
    await expect(pegadaianRawBrand.fetchRaw(ctx)).rejects.toThrow(/--input wajib/);
  });

  it('metadata job', () => {
    expect(pegadaianRawBrand).toMatchObject({
      id: 'pegadaian-raw-brand',
      source: 'pegadaian',
      parserVersion: 'pegadaian-raw-brand@1.0.0',
      localOnly: true,
    });
  });
});
