import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { selectUncovered } from '../src/backfill/select';
import { parseHistory, ubsHistory } from '../src/backfill/ubs-history';
import type { RawPayload } from '../src/sources/types';
import { stored } from './helpers';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/ubslifestyle');
const raw = (body: string): RawPayload => ({
  body,
  contentType: 'application/json',
  fetchedAt: '2026-10-25T01:41:00Z',
});
const fixture = raw(readFileSync(path.join(DIR, 'chart-interval-1095-2026-10-25.json'), 'utf8'));

describe('ubs-history (P1-09)', () => {
  it('fixture P0-07: 30 titik → buyback 1 g, variant kosong, tanpa harga beli', () => {
    const { rows, dataDate } = parseHistory(fixture);
    expect(rows).toHaveLength(30);
    expect(dataDate).toBe('2026-10-24');
    expect(rows.at(-1)).toEqual({
      date: '2026-10-24',
      source: 'ubslifestyle',
      brand: 'ubs',
      product: 'gold_bar',
      variant: '',
      weight_g: 1,
      location: '',
      sell_price: null,
      buyback_price: 2_288_000, // = tabel 1 g 24 Okt (fixture README)
      source_updated_at: null,
    });
    expect(rows[0]!.date).toBe('2026-09-17');
    expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort());
  });

  it('tanggal dari UTC 00:00 apa adanya; titik ganda per tanggal → titik terakhir', () => {
    const day = Date.UTC(2026, 9, 20);
    const { rows } = parseHistory(
      raw(
        JSON.stringify([
          {
            name: 'GOLD',
            data: [
              [day, 2_250_000, 0, 0, 0],
              [day + 3_600_000, 2_251_000, 0, 0, 0],
            ],
          },
        ]),
      ),
    );
    expect(rows).toEqual([
      expect.objectContaining({ date: '2026-10-20', buyback_price: 2_251_000 }),
    ]);
  });

  it('respons rusak → PARSE_ERROR', () => {
    for (const body of [
      '<html>',
      '[]',
      '[{"name":"GOLD","data":[["x",1]]}]',
      '[{"name":"GOLD","data":[[1,0]]}]',
    ]) {
      expect(() => parseHistory(raw(body))).toThrow(
        expect.objectContaining({ code: 'PARSE_ERROR' }),
      );
    }
  });

  it('select: tanggal yang sudah di-scrape harian (1 g, tahun apa pun) dibuang', () => {
    const { rows } = parseHistory(fixture);
    const existing = [
      stored({ date: '2026-10-24', variant: '2026', weight_g: 1 }),
      stored({ date: '2026-10-23', variant: '2026', weight_g: 5 }), // bukan 1 g → tetap diambil
      stored({ date: '2026-10-22', variant: '', origin: 'backfill' }), // backfill lama → diambil lagi
    ];
    const selected = selectUncovered(rows, existing);
    expect(selected).toHaveLength(29);
    expect(selected.map((r) => r.date)).not.toContain('2026-10-24');
    expect(selected.map((r) => r.date)).toContain('2026-10-22');
  });

  it('terdaftar dengan parserVersion', () => {
    expect(ubsHistory).toMatchObject({
      id: 'ubs-history',
      source: 'ubslifestyle',
      parserVersion: 'ubs-history@1.0.0',
    });
  });
});
