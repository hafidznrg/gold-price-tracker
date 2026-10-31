import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSavingsChart, pegadaianSavings } from '../src/backfill/pegadaian-savings';
import type { RawPayload } from '../src/sources/types';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/pegadaian');
const raw = (body: string): RawPayload => ({
  body,
  contentType: 'application/json',
  fetchedAt: '2026-10-31T15:00:00Z',
});
const fixture = raw(readFileSync(path.join(DIR, 'chart-tabungan-7d-2026-10-25.json'), 'utf8'));

const point = (date: string, harga: number) => ({
  id: String(Date.parse(`${date}T11:00:00Z`)),
  harga: String(harga),
  unit: '0.01',
  lastUpdate: `${date} 00:00:00`,
});
const chart = (grafik: unknown[]) =>
  raw(JSON.stringify({ responseCode: '2000000100', data: { allGrafik: grafik } }));

describe('pegadaian-savings (D-30)', () => {
  it('fixture P0-08 (7 hari): jual → sell, beli → buyback, per 0,01 g', () => {
    const { rows, dataDate } = parseSavingsChart(fixture);
    expect(rows).toHaveLength(7);
    expect(dataDate).toBe('2026-10-24');
    expect(rows.at(-1)).toMatchObject({
      date: '2026-10-24',
      brand: 'pegadaian',
      product: 'gold_savings',
      weight_g: 0.01,
      sell_price: 23_990,
      buyback_price: 23_150,
    });
    expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort());
  });

  it('memakai timeInterval terpanjang per tipe', () => {
    const { rows } = parseSavingsChart(
      chart([
        {
          tipe: 'jual',
          timeInterval: 7,
          jsonFluktuasi: { priceList: [point('2026-10-31', 23_600)] },
        },
        {
          tipe: 'jual',
          timeInterval: 360,
          jsonFluktuasi: { priceList: [point('2025-11-06', 21_000), point('2026-10-31', 23_600)] },
        },
        {
          tipe: 'beli',
          timeInterval: 360,
          jsonFluktuasi: { priceList: [point('2025-11-06', 20_200), point('2026-10-31', 22_770)] },
        },
      ]),
    );
    expect(rows.map((r) => [r.date, r.sell_price, r.buyback_price])).toEqual([
      ['2025-11-06', 21_000, 20_200],
      ['2026-10-31', 23_600, 22_770],
    ]);
    expect(rows[0]!.source_updated_at).toBe('2025-11-06T18:00:00+07:00');
  });

  it('tanpa tipe beli, satuan lain, atau respons ditolak → PARSE_ERROR', () => {
    const jual = {
      tipe: 'jual',
      timeInterval: 7,
      jsonFluktuasi: { priceList: [point('2026-10-31', 1)] },
    };
    expect(() => parseSavingsChart(chart([jual]))).toThrow(/tipe beli/);
    const unit = {
      tipe: 'beli',
      timeInterval: 7,
      jsonFluktuasi: { priceList: [{ ...point('2026-10-31', 1), unit: '1' }] },
    };
    expect(() =>
      parseSavingsChart(
        chart([
          { ...jual, jsonFluktuasi: { priceList: [{ ...point('2026-10-31', 1), unit: '1' }] } },
          unit,
        ]),
      ),
    ).toThrow(/satuan/);
    expect(() => parseSavingsChart(raw('{"responseCode":"4000000100"}'))).toThrow(/responseCode/);
  });

  it('job jarak jauh (muncul di backfill.yml)', () => {
    expect(pegadaianSavings).toMatchObject({ id: 'pegadaian-savings', source: 'pegadaian' });
    expect(pegadaianSavings.localOnly).toBeUndefined();
  });
});
