import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parseRupiah, parseWeight } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

// Kontrak hasil riset P0-07 — mengunci asumsi tentang halaman UBS Lifestyle
// sebelum parser ditulis di P1-03. Bila fixture diperbarui dan tes ini gagal,
// perbarui TECH-SPEC §5.1 dan config/catalog.yml lebih dulu.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const DIR = path.join(HERE, 'fixtures/ubslifestyle');

const page = gunzipSync(readFileSync(path.join(DIR, 'page-2026-10-25-sunday.html.gz'))).toString(
  'utf8',
);
const tableHtml = page.slice(page.indexOf('<table'), page.indexOf('</table>'));
const strip = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
  .map((m) => [...m[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => strip(c[1]!)))
  .filter((cells) => /Gram$/i.test(cells[0] ?? ''));

describe('fixture UBS Lifestyle', () => {
  it('halaman memuat tepat satu tabel harga, berlabel tahun produksi', () => {
    expect(page.match(/<table/g)).toHaveLength(1);
    expect(strip(tableHtml)).toMatch(/^Tahun 2026 Pecahan Harga Beli Harga Jual \(Buyback\)/);
  });

  it('blok "Updated": tanggal tercetak server, jam diisi JavaScript (bukan waktu update harga)', () => {
    expect(page).toContain('<p class="text-xs font-semibold">25 October 2026</p>');
    expect(page).toMatch(/getElementById\('clock'\)\.textContent/);
  });

  it('gramasi di tabel = katalog ubslifestyle', async () => {
    const config = await loadConfig(ROOT);
    const catalog = config.catalog
      .filter((i) => i.source === 'ubslifestyle')
      .map((i) => i.weight_g)
      .sort((a, b) => a - b);
    expect(rows.map((r) => parseWeight(r[0]!))).toEqual(catalog);
  });

  it('setiap baris: harga beli > buyback (V-03), keduanya bisa dibaca parseRupiah', () => {
    for (const [, beli, jual] of rows) {
      expect(parseRupiah(beli!)).toBeGreaterThan(parseRupiah(jual!));
    }
  });

  it('titik terakhir endpoint grafik = buyback 1 g di tabel', () => {
    const chart = JSON.parse(
      readFileSync(path.join(DIR, 'chart-interval-1095-2026-10-25.json'), 'utf8'),
    ) as [{ name: string; data: number[][] }];
    const last = chart[0].data.at(-1)!;
    expect(new Date(last[0]!).toISOString()).toBe('2026-10-24T00:00:00.000Z');
    const oneGram = rows.find((r) => parseWeight(r[0]!) === 1)!;
    expect(last[1]).toBe(parseRupiah(oneGram[2]!));
  });
});
