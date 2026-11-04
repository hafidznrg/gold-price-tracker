import { addDaysIso, isIsoDate, jakartaDate, utcIso, type MacroRow } from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import { checkXausFresh } from '../pipeline/validate';
import { sleep } from '../probe/http';
import { fetchOk } from './http';
import type { ParsedRow, ParseResult, RawPayload, SourceScraper } from './types';

// TECH-SPEC §5.4 — XAU/USD indikatif dari xaus.com (futures GC=F, bukan LBMA; D-21). Histori:
// penutupan 10 hari terakhir tanpa hari berjalan (belum final) → `xau_usd_oz` frekuensi D.
// Spot: ditimpa ke spot.json oleh merge. Respons basi ditolak seluruhnya (V-10).

export const HISTORY_URL = 'https://xaus.com/api/v1/history';
export const SPOT_URL = 'https://xaus.com/api/v1/spot?compact=1';
/** Jendela upsert (hari kalender) yang menutup akhir pekan, libur, dan run yang terlewat. */
export const WINDOW_DAYS = 10;

/** Isi raw snapshot: kedua respons apa adanya + tanggal sasaran (parse tidak boleh membaca jam). */
export interface XausRaw {
  today: string;
  history: string;
  spot: string;
}

interface History {
  data_state?: { status?: string | null };
  points?: unknown;
}
interface Spot {
  spot_usd_oz?: unknown;
  stale?: boolean | null;
}

function json<T>(label: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ScrapeError('PARSE_ERROR', `${label} bukan JSON: ${text.slice(0, 80)}`);
  }
}

export function parse(raw: RawPayload): ParseResult<MacroRow> {
  const body = JSON.parse(raw.body) as XausRaw;
  const history = json<History>('histori xaus', body.history);
  const spot = json<Spot>('spot xaus', body.spot);

  // V-10: sebelum apa pun dibaca, respons basi menggagalkan run.
  const stale = checkXausFresh({
    historyStatus: history.data_state?.status ?? null,
    spotStale: spot.stale ?? null,
  });
  if (stale) throw new ScrapeError(stale.error_code, stale.error_message);

  if (!Array.isArray(history.points)) throw new ScrapeError('PARSE_ERROR', 'histori tanpa points');
  const from = addDaysIso(body.today, -WINDOW_DAYS);
  const rows: ParsedRow<MacroRow>[] = [];
  for (const p of history.points as { d?: unknown; c?: unknown }[]) {
    if (typeof p.d !== 'string' || !isIsoDate(p.d) || typeof p.c !== 'number' || !(p.c > 0)) {
      throw new ScrapeError('PARSE_ERROR', `titik histori tidak valid: ${JSON.stringify(p)}`);
    }
    if (p.d < from || p.d >= body.today) continue; // hari berjalan belum final
    rows.push({
      date: p.d,
      series: 'xau_usd_oz',
      frequency: 'D',
      value: p.c,
      unit: 'USD/ozt',
      source: 'xaus',
    });
  }
  if (rows.length === 0) {
    throw new ScrapeError('PARSE_ERROR', `tidak ada penutupan ${from} s/d kemarin (${body.today})`);
  }
  if (typeof spot.spot_usd_oz !== 'number' || !(spot.spot_usd_oz > 0)) {
    throw new ScrapeError('PARSE_ERROR', `spot_usd_oz tidak valid: ${String(spot.spot_usd_oz)}`);
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    rows,
    dataDate: rows.at(-1)!.date,
    sourceUpdatedAt: null,
    stale: null,
    spot: { xau_usd_oz: spot.spot_usd_oz, fetched_at: raw.fetchedAt, stale: false },
  };
}

export const xaus: SourceScraper<MacroRow> = {
  id: 'xaus',
  kind: 'macro',
  parserVersion: 'xaus@1.0.0',
  async fetchRaw(ctx) {
    const fetchedAt = utcIso();
    const history = await fetchOk(ctx, HISTORY_URL, { headers: { Accept: 'application/json' } });
    await sleep(ctx.pauseMs ?? 5_000);
    const spot = await fetchOk(ctx, SPOT_URL, { headers: { Accept: 'application/json' } });
    const raw: XausRaw = {
      today: ctx.date ?? jakartaDate(ctx.now),
      history: history.body.toString('utf8'),
      spot: spot.body.toString('utf8'),
    };
    return { body: JSON.stringify(raw), contentType: 'application/json', fetchedAt };
  },
  parse,
};
