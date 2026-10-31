import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MacroRow } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { annualFx, API_URL, parseWdiRates } from '../src/backfill/annual-fx';
import type { RawPayload } from '../src/sources/types';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/wdi');
const raw = (body: string): RawPayload => ({
  body,
  contentType: 'application/json',
  fetchedAt: '2026-11-01T03:00:00Z',
});
const fixture = raw(readFileSync(path.join(DIR, 'pa-nus-fcrf-idn-1996-1998.json'), 'utf8'));

const obs = (date: string, value: number | null, over: Record<string, unknown> = {}) => ({
  indicator: { id: 'PA.NUS.FCRF', value: 'Official exchange rate (LCU per US$, period average)' },
  countryiso3code: 'IDN',
  date,
  value,
  ...over,
});
const api = (...observations: unknown[]) =>
  raw(JSON.stringify([{ page: 1, pages: 1, total: observations.length }, observations]));
const ALL = [obs('1998', 10_013.6225), obs('1997', 2909.38), obs('1996', 2342.29629166666)];

describe('annual-fx (P2-10, Q-3)', () => {
  it('fixture WDI PA.NUS.FCRF: 1996–1998, 1 Januari, 2 desimal, terurut naik', () => {
    const { rows, dataDate } = parseWdiRates(fixture);
    expect(rows).toEqual([
      {
        date: '1996-01-01',
        series: 'usd_idr_annual',
        frequency: 'A',
        value: 2342.3,
        unit: 'IDR/USD',
        source: 'wdi',
      },
      {
        date: '1997-01-01',
        series: 'usd_idr_annual',
        frequency: 'A',
        value: 2909.38,
        unit: 'IDR/USD',
        source: 'wdi',
      },
      {
        date: '1998-01-01',
        series: 'usd_idr_annual',
        frequency: 'A',
        value: 10_013.62,
        unit: 'IDR/USD',
        source: 'wdi',
      },
    ]);
    expect(dataDate).toBe('1998-01-01');
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

  it('tahun di luar 1996–1998 diabaikan', () => {
    expect(parseWdiRates(api(obs('1999', 7855.15), ...ALL, obs('1995', 2248.6))).rows).toHaveLength(
      3,
    );
  });

  it.each([
    ['bukan JSON', raw('<html>'), /bukan JSON/],
    ['galat API', raw('[{"message":[{"id":"120","key":"Invalid value"}]}]'), /tanpa observasi/],
    [
      'indikator lain',
      api(...ALL, obs('1997', 1, { indicator: { id: 'PA.NUS.ATLS' } })),
      /bukan PA\.NUS\.FCRF/,
    ],
    ['negara lain', api(obs('1996', 1, { countryiso3code: 'MYS' })), /IDN/],
    ['nilai null', api(obs('1998', null), obs('1997', 2909.38), obs('1996', 2342.3)), /1998/],
    ['tahun hilang', api(obs('1998', 10_013.62), obs('1997', 2909.38)), /tidak ada: 1996/],
  ])('%s → PARSE_ERROR', (_, input, message) => {
    let caught: unknown;
    try {
      parseWdiRates(input);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ code: 'PARSE_ERROR', message: expect.stringMatching(message) });
  });

  it('job makro untuk seri usd_idr_annual dari API WDI', () => {
    expect(annualFx).toMatchObject({ kind: 'macro', series: 'usd_idr_annual', source: 'wdi' });
    expect(API_URL).toBe(
      'https://api.worldbank.org/v2/country/IDN/indicator/PA.NUS.FCRF?format=json&date=1996:1998&per_page=50',
    );
  });
});
