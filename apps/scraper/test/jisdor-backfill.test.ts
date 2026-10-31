import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MacroRow } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { jisdor, parseJisdorExport, parseKurs, parseUsDate } from '../src/backfill/jisdor';
import type { RawPayload } from '../src/sources/types';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/jisdor');
const raw = (buf: Buffer): RawPayload => ({
  body: buf.toString('base64'),
  contentType: 'application/octet-stream',
  fetchedAt: '2026-11-01T03:00:00Z',
});
const fixture = raw(readFileSync(path.join(DIR, 'export-trimmed-2013-2026.xlsx')));

/** XLSX sintetis dengan tata letak ekspor BI. */
function book(data: unknown[][], header = ['NO', 'Tanggal', 'Kurs']): RawPayload {
  const wb = XLSX.utils.book_new();
  const rows = [['Informasi Kurs Jisdor'], [], header, ...data];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Informasi Kurs Jisdor');
  return raw(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

describe('jisdor backfill (P2-09)', () => {
  it('fixture ekspor 20/05/2013–24/10/2026: tanggal AS, kurs format Indonesia', () => {
    const { rows, dataDate } = parseJisdorExport(fixture);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({
      date: '2013-05-20',
      series: 'usd_idr_jisdor',
      frequency: 'D',
      value: 9760,
      unit: 'IDR/USD',
      source: 'bi',
    });
    expect(rows.at(-1)).toMatchObject({ date: '2026-10-23', value: 18_069 });
    expect(dataDate).toBe('2026-10-23');
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

  it('parseUsDate: M/D/YYYY, bukan D/M', () => {
    expect(parseUsDate('5/20/2013 12:00:00 AM')).toBe('2013-05-20');
    expect(parseUsDate('10/2/2026 12:00:00 AM')).toBe('2026-10-02');
    expect(parseUsDate('1/9/2026')).toBe('2026-01-09');
    expect(parseUsDate('20/5/2013 12:00:00 AM')).toBeNull();
    expect(parseUsDate('2/30/2026 12:00:00 AM')).toBeNull();
    expect(parseUsDate('2026-10-23')).toBeNull();
  });

  it('parseKurs: titik ribuan, koma desimal (sen diterima)', () => {
    expect(parseKurs('18.069,00')).toBe(18_069);
    expect(parseKurs('9.760,5')).toBe(9760.5);
    expect(parseKurs('Rp 18.069,00')).toBe(18_069);
    expect(parseKurs('980')).toBe(980);
    expect(parseKurs('18,069.00')).toBeNull();
    expect(parseKurs('18069,00')).toBeNull();
    expect(parseKurs('')).toBeNull();
  });

  it('baris kosong dilewati; hasil terurut', () => {
    const out = parseJisdorExport(
      book([
        [2, '5/21/2013 12:00:00 AM', '9.765,00'],
        [],
        [1, '5/20/2013 12:00:00 AM', '9.760,00'],
      ]),
    );
    expect(out.rows.map((r) => [r.date, r.value])).toEqual([
      ['2013-05-20', 9760],
      ['2013-05-21', 9765],
    ]);
  });

  it.each([
    [
      'header berubah',
      book([[1, '5/20/2013 12:00:00 AM', '9.760,00']], ['NO', 'Date', 'Rate']),
      /header/,
    ],
    ['tanpa data', book([]), /tanpa data/],
    ['tanggal format lain', book([[1, '20-05-2013', '9.760,00']]), /tidak valid/],
    ['kurs format lain', book([[1, '5/20/2013 12:00:00 AM', '9,760.00']]), /tidak valid/],
    ['kurs kosong', book([[1, '5/20/2013 12:00:00 AM', null]]), /tidak valid/],
    [
      'tanggal ganda',
      book([
        [1, '5/20/2013 12:00:00 AM', '9.760,00'],
        [2, '5/20/2013 12:00:00 AM', '9.761,00'],
      ]),
      /ganda/,
    ],
    ['bukan XLSX', { ...fixture, body: Buffer.from('<html>').toString('base64') }, /./],
  ])('%s → PARSE_ERROR', (_, input, message) => {
    let caught: unknown;
    try {
      parseJisdorExport(input);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: 'PARSE_ERROR', message: expect.stringMatching(message) });
  });

  it('job makro untuk seri usd_idr_jisdor', () => {
    expect(jisdor).toMatchObject({ kind: 'macro', series: 'usd_idr_jisdor', source: 'bi' });
  });
});
