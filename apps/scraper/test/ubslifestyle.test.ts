import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { ScrapeError } from '../src/pipeline/errors';
import { tables } from '../src/html';
import {
  lastChartPoint,
  parse,
  parseTables,
  ubslifestyle,
  type UbsRaw,
} from '../src/sources/ubslifestyle';
import type { RawPayload } from '../src/sources/types';
import { ROOT } from './helpers';

// P1-03 — parser UBS Lifestyle diuji dengan fixture P0-07 (TECH-SPEC §5.1, D-08, D-19).

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/ubslifestyle');
const fixture = (name: string) => readFileSync(path.join(DIR, name), 'utf8');
const page = gunzipSync(readFileSync(path.join(DIR, 'page-2026-10-25-sunday.html.gz'))).toString(
  'utf8',
);
const chart = fixture('chart-interval-1095-2026-10-25.json');

const payload = (raw: UbsRaw): RawPayload => ({
  body: JSON.stringify(raw),
  contentType: 'application/json',
  fetchedAt: '2026-10-25T01:41:00Z',
});

const fromPage = (html: string, chartBody = chart) =>
  payload({ tables: tables(html).join('\n'), chart: chartBody });

describe('parseTables', () => {
  it('halaman asli: 13 pecahan tahun 2026, Harga Beli → sell, Harga Jual (Buyback) → buyback', () => {
    const rows = parseTables(page);
    expect(rows).toHaveLength(13);
    expect(rows.every((r) => r.variant === '2026' && r.brand === 'ubs' && r.location === '')).toBe(
      true,
    );
    expect(rows.find((r) => r.weight_g === 1)).toMatchObject({
      sell_price: 2_483_400,
      buyback_price: 2_288_000,
      source_updated_at: null,
    });
    expect(rows.find((r) => r.weight_g === 0.05)).toMatchObject({
      sell_price: 213_300,
      buyback_price: 114_000,
    });
  });

  it('banyak tahun produksi (D-08): setiap tabel → variant; sel "-" → null', () => {
    const rows = parseTables(fixture('table-multiyear-synthetic.html'));
    expect(rows).toHaveLength(26);
    const y2025 = rows.filter((r) => r.variant === '2025');
    expect(y2025).toHaveLength(13);
    expect(y2025.every((r) => r.sell_price === null && r.buyback_price !== null)).toBe(true);
  });

  it('tanpa tabel atau tanpa label tahun → PARSE_ERROR', () => {
    expect(() => parseTables('<html></html>')).toThrow(ScrapeError);
    expect(() => parseTables('<table><tr><td>1 Gram</td><td>Rp1</td></tr></table>')).toThrow(
      /Tahun YYYY/,
    );
  });

  it('harga yang tidak bisa dibaca → PARSE_ERROR menyebut barisnya', () => {
    const broken = page.replace('Rp2.483.400', 'Rp2.483.4OO');
    expect(() => parseTables(broken)).toThrow(/1 Gram/);
  });
});

describe('lastChartPoint', () => {
  it('ts 00:00 UTC = tanggal harga; a = buyback 1 g', () => {
    expect(lastChartPoint(chart)).toEqual({ date: '2026-10-24', buyback: 2_288_000 });
  });

  it('seri kosong atau bukan JSON → PARSE_ERROR (D-19)', () => {
    expect(() => lastChartPoint(fixture('chart-range-empty.json'))).toThrow(/tanpa titik/);
    expect(() => lastChartPoint('<html>')).toThrow(/bukan JSON/);
  });
});

describe('parse', () => {
  it('fixture Minggu: data_date = Sabtu 24 Okt dari grafik, semua baris bertanggal itu, tidak basi', () => {
    const r = parse(fromPage(page));
    expect(r.dataDate).toBe('2026-10-24');
    expect(r.stale).toBeNull();
    expect(r.sourceUpdatedAt).toBeNull();
    expect(r.rows).toHaveLength(13);
    expect(new Set(r.rows.map((x) => x.date))).toEqual(new Set(['2026-10-24']));
  });

  it('titik terakhir grafik ≠ buyback 1 g tabel → stale (situs di tengah pembaruan)', () => {
    const series = JSON.parse(chart) as { data: number[][] }[];
    series[0]!.data.at(-1)![1] = 2_300_000;
    const r = parse(fromPage(page, JSON.stringify(series)));
    expect(r.stale).toMatch(/2026-10-24 \(2300000\) ≠ buyback 1 g tahun 2026 \(2288000\)/);
  });

  it('banyak tahun: dibandingkan dengan tahun terbaru', () => {
    expect(parse(fromPage(fixture('table-multiyear-synthetic.html'))).stale).toBeNull();
  });
});

describe('modul', () => {
  it('parserVersion = id@parser_version di config/sources.yml', async () => {
    const config = await loadConfig(ROOT);
    const source = config.sources.find((s) => s.id === 'ubslifestyle')!;
    expect(ubslifestyle.parserVersion).toBe(`ubslifestyle@${source.parser_version}`);
  });
});
