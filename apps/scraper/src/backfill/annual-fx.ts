import { utcIso, type MacroRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { fetchOk } from '../sources/http';
import type { ParsedRow, ParseResult, RawPayload } from '../sources/types';
import type { MacroBackfillJob } from './types';

// P2-10 — kurs USD/IDR tahunan 1996–1998 sebelum histori ECB (4 Jan 1999). Sumber: World Bank
// WDI `PA.NUS.FCRF` (Official exchange rate, LCU per US$, period average; data IMF IFS), lewat
// API tanpa key (D-33). Respons JSON `[meta, observasi[]]`; nilai dibulatkan 2 desimal (D-32).

export const INDICATOR = 'PA.NUS.FCRF';
export const YEARS = ['1996', '1997', '1998'] as const;
export const API_URL = `https://api.worldbank.org/v2/country/IDN/indicator/${INDICATOR}?format=json&date=${YEARS[0]}:${YEARS.at(-1)}&per_page=50`;

interface Observation {
  indicator?: { id?: string };
  countryiso3code?: string;
  date?: string;
  value?: number | null;
}

export function parseWdiRates(raw: RawPayload): ParseResult<MacroRow> {
  let body: unknown;
  try {
    body = JSON.parse(raw.body);
  } catch {
    throw new ScrapeError('PARSE_ERROR', 'respons WDI bukan JSON');
  }
  // Galat API WDI berbentuk `[{ message: [...] }]` tanpa elemen kedua.
  const observations = Array.isArray(body) ? (body[1] as Observation[] | undefined) : undefined;
  if (!Array.isArray(observations)) {
    throw new ScrapeError('PARSE_ERROR', `respons WDI tanpa observasi: ${raw.body.slice(0, 200)}`);
  }

  const byYear = new Map<string, number>();
  for (const o of observations) {
    if (o.indicator?.id !== INDICATOR || o.countryiso3code !== 'IDN') {
      throw new ScrapeError(
        'PARSE_ERROR',
        `observasi WDI bukan ${INDICATOR} IDN: ${JSON.stringify(o)}`,
      );
    }
    if (!YEARS.includes(o.date as (typeof YEARS)[number])) continue;
    if (typeof o.value !== 'number' || !(o.value > 0)) {
      throw new ScrapeError('PARSE_ERROR', `${o.date}: nilai WDI kosong atau tidak valid`);
    }
    byYear.set(o.date!, Math.round(o.value * 100) / 100);
  }
  const missing = YEARS.filter((y) => !byYear.has(y));
  if (missing.length > 0) {
    throw new ScrapeError('PARSE_ERROR', `tahun WDI tidak ada: ${missing.join(', ')}`);
  }

  const rows: ParsedRow<MacroRow>[] = YEARS.map((year) => ({
    date: `${year}-01-01`,
    series: 'usd_idr_annual',
    frequency: 'A',
    value: byYear.get(year)!,
    unit: 'IDR/USD',
    source: 'wdi',
  }));
  return { rows, dataDate: rows.at(-1)!.date, sourceUpdatedAt: null, stale: null };
}

export const annualFx: MacroBackfillJob = {
  id: 'annual-fx',
  kind: 'macro',
  series: 'usd_idr_annual',
  source: 'wdi',
  parserVersion: 'annual-fx@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const res = await fetchOk(ctx, API_URL, { headers: { Accept: 'application/json' } });
    return { body: res.body.toString('utf8'), contentType: 'application/json', fetchedAt };
  },
  parse: parseWdiRates,
};
