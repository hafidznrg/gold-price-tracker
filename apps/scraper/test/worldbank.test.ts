import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MacroRow } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePinkSheet, SHEET, worldbank } from '../src/backfill/worldbank';
import type { RawPayload } from '../src/sources/types';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/worldbank');
const raw = (buf: Buffer): RawPayload => ({
  body: buf.toString('base64'),
  contentType: 'application/octet-stream',
  fetchedAt: '2026-11-01T03:00:00Z',
});
const fixture = raw(readFileSync(path.join(DIR, 'cmo-monthly-trimmed-2026-10.xlsx')));

/** XLSX sintetis dengan tata letak Pink Sheet: judul, nama kolom, satuan, data. */
function book(rows: unknown[][], sheet = SHEET): RawPayload {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  return raw(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}
const HEAD = [
  ['World Bank Commodity Price Data (The Pink Sheet)'],
  ['Updated on October 02, 2026'],
  [null, 'Crude oil, average', 'Gold', 'Silver'],
  [null, '($/bbl)', '($/troy oz)', '($/troy oz)'],
];

describe('worldbank (P2-06)', () => {
  it('fixture rilis Okt 2026: kolom Gold dicari lewat nama, bulan 1996 → 2026M09', () => {
    const { rows, dataDate } = parsePinkSheet(fixture);
    expect(rows).toHaveLength(15); // 12 bulan 1996 + 3 bulan terakhir
    expect(rows[0]).toEqual({
      date: '1996-01-01',
      series: 'xau_usd_oz',
      frequency: 'M',
      value: 399,
      unit: 'USD/ozt',
      source: 'worldbank',
    });
    expect(rows.at(-1)).toMatchObject({ date: '2026-09-01', value: 4319 });
    expect(dataDate).toBe('2026-09-01');
    for (const row of rows) {
      const full = {
        ...row,
        scraped_at: '2026-11-01T03:00:00Z',
        run_id: '1-1',
        origin: 'backfill',
      };
      expect(MacroRow.safeParse(full).success).toBe(true);
    }
  });

  it('bulan sebelum 1996 dibuang; posisi kolom bebas; hasil terurut', () => {
    const out = parsePinkSheet(
      book([...HEAD, ['1996M02', 18, 405, 5], ['1995M12', 17, 387, 5], ['1996M01', 18, 399.45, 5]]),
    );
    expect(out.rows.map((r) => [r.date, r.value])).toEqual([
      ['1996-01-01', 399.45],
      ['1996-02-01', 405],
    ]);
  });

  it.each([
    ['sheet tidak ada', book([...HEAD, ['1996M01', 1, 399, 5]], 'Annual Prices'), /sheet/],
    [
      'kolom Gold hilang',
      book([HEAD[0]!, [null, 'Silver'], [null, '($/troy oz)'], ['1996M01', 5]]),
      /kolom "Gold"/,
    ],
    [
      'satuan berubah',
      book([HEAD[0]!, [null, 'Gold'], [null, '($/kg)'], ['1996M01', 399]]),
      /satuan/,
    ],
    ['nilai "…"', book([...HEAD, ['1996M01', 18, '…', 5]]), /1996M01/],
    ['sel kosong', book([...HEAD, ['1996M01', 18, null, 5]]), /bukan angka/],
    ['periode ganda', book([...HEAD, ['1996M01', 18, 399, 5], ['1996M01', 18, 400, 5]]), /ganda/],
    ['tanpa bulan sejak 1996', book([...HEAD, ['1995M12', 17, 387, 5]]), /tidak ada bulan/],
    ['bukan XLSX', { ...fixture, body: Buffer.from('<html>').toString('base64') }, /./],
  ])('%s → PARSE_ERROR', (_, input, message) => {
    let caught: unknown;
    try {
      parsePinkSheet(input);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: 'PARSE_ERROR', message: expect.stringMatching(message) });
  });

  it('job makro untuk seri xau_usd_oz (M)', () => {
    expect(worldbank).toMatchObject({ kind: 'macro', series: 'xau_usd_oz', source: 'worldbank' });
  });
});
