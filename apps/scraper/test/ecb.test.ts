import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MacroRow } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { ecb, HISTORY_START, parseEcbRates, ratesUrl } from '../src/backfill/ecb';
import type { RawPayload } from '../src/sources/types';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/frankfurter');
const raw = (body: string): RawPayload => ({
  body,
  contentType: 'text/csv',
  fetchedAt: '2026-11-01T03:00:00Z',
});
const fixture = (f: string) => raw(readFileSync(path.join(DIR, f), 'utf8'));
const csv = (...lines: string[]) => raw(['date,base,quote,rate', ...lines].join('\n') + '\n');

describe('ecb (P2-08)', () => {
  it('fixture Okt 2026: EUR/IDR ÷ EUR/USD per tanggal, 2 desimal', () => {
    const { rows, dataDate } = parseEcbRates(fixture('rates-eur-idr-usd-2026-tail.csv'));
    expect(rows).toHaveLength(10);
    expect(dataDate).toBe('2026-10-23');
    expect(rows.at(-1)).toEqual({
      date: '2026-10-23',
      series: 'usd_idr_ecb',
      frequency: 'D',
      value: 18_107.8, // 20268.06 ÷ 1.1193 (TECH-SPEC §5.5 cek silang)
      unit: 'IDR/USD',
      source: 'ecb',
    });
    expect(rows[0]).toMatchObject({ date: '2026-10-12', value: 17_919.85 }); // 20036.18 ÷ 1.1181
    expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort());
  });

  it('fixture Jan 1999: histori dimulai 4 Jan 1999', () => {
    const { rows } = parseEcbRates(fixture('rates-eur-idr-usd-1999-head.csv'));
    expect(rows[0]).toMatchObject({ date: HISTORY_START, value: 8002.04 }); // 9433.61 ÷ 1.1789
    expect(rows).toHaveLength(10);
  });

  it('baris lolos skema MacroRow setelah kolom pipeline diisi', () => {
    for (const row of parseEcbRates(fixture('rates-eur-idr-usd-2026-tail.csv')).rows) {
      const full = {
        ...row,
        scraped_at: '2026-11-01T03:00:00Z',
        run_id: '1-1',
        origin: 'backfill',
      };
      expect(MacroRow.safeParse(full).success).toBe(true);
    }
  });

  it('urutan baris di respons tidak berpengaruh; kuotasi lain diabaikan; CRLF dan BOM diterima', () => {
    const body =
      String.fromCharCode(0xfeff) +
      'date,base,quote,rate\r\n' +
      [
        '2026-10-23,EUR,USD,1.1193',
        '2026-10-22,EUR,IDR,20000',
        '2026-10-23,EUR,JPY,170.1',
        '2026-10-23,EUR,IDR,20268.06',
        '2026-10-22,EUR,USD,1.25',
      ].join('\r\n');
    expect(parseEcbRates(raw(body)).rows.map((r) => [r.date, r.value])).toEqual([
      ['2026-10-22', 16_000],
      ['2026-10-23', 18_107.8],
    ]);
  });

  it.each([
    ['header berubah', raw('tanggal,base,quote,rate\n2026-10-23,EUR,IDR,1\n'), /header/],
    ['tanpa data', csv(), /tanpa data/],
    ['kuotasi USD hilang', csv('2026-10-23,EUR,IDR,20268.06'), /USD tidak ada/],
    ['kuotasi IDR hilang', csv('2026-10-23,EUR,USD,1.1193'), /IDR tidak ada/],
    [
      'kuotasi ganda',
      csv('2026-10-23,EUR,IDR,1', '2026-10-23,EUR,IDR,2', '2026-10-23,EUR,USD,1'),
      /ganda/,
    ],
    ['base bukan EUR', csv('2026-10-23,USD,IDR,18000'), /baris Frankfurter 2/],
    ['rate kosong', csv('2026-10-23,EUR,IDR,'), /tidak valid/],
    ['tanggal tidak valid', csv('2026-02-30,EUR,IDR,1'), /tidak valid/],
  ])('%s → PARSE_ERROR', (_, input, message) => {
    expect(() => parseEcbRates(input)).toThrow(message);
    try {
      parseEcbRates(input);
    } catch (err) {
      expect((err as { code?: string }).code).toBe('PARSE_ERROR');
    }
  });

  it('URL Frankfurter v2 sesuai TECH-SPEC §5.6', () => {
    expect(ratesUrl('1999-01-04', '2026-11-01')).toBe(
      'https://api.frankfurter.dev/v2/rates.csv?base=EUR&quotes=IDR,USD&from=1999-01-04&to=2026-11-01&providers=ecb',
    );
    expect(ecb).toMatchObject({ kind: 'macro', series: 'usd_idr_ecb', source: 'ecb' });
  });
});
