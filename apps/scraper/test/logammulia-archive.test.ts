import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { logammuliaArchive, parseArchive } from '../src/backfill/logammulia-archive';
import type { RawPayload } from '../src/sources/types';

// Data sintetis; bentuk mengikuti arsip (D-29): [[ts_ms, harga], …], ts = jam dinding WIB
// yang tersimpan sebagai UTC.

const wib = (date: string, time = '00:00:00') => Date.parse(`${date}T${time}Z`);
const raw = (sell: unknown, buyback: unknown): RawPayload => ({
  body: JSON.stringify({ sell, buyback }),
  contentType: 'application/json',
  fetchedAt: '2026-10-31T15:00:00Z',
});

describe('logammulia-archive (D-29)', () => {
  it('tanggal = tanggal UTC dari ts; jual + buyback digabung per tanggal', () => {
    const { rows, dataDate } = parseArchive(
      raw(
        [
          [wib('2026-10-22', '08:33:00'), 2_550_000],
          [wib('2026-10-23', '08:37:00'), 2_540_000],
        ],
        [
          [wib('2026-10-22', '08:33:00'), 2_365_000],
          [wib('2026-10-23', '08:37:00'), 2_335_000],
        ],
      ),
    );
    expect(dataDate).toBe('2026-10-23');
    expect(rows.at(-1)).toEqual({
      date: '2026-10-23',
      source: 'logammulia',
      brand: 'antam',
      product: 'gold_bar',
      variant: '',
      weight_g: 1,
      location: 'jakarta',
      sell_price: 2_540_000,
      buyback_price: 2_335_000,
      source_updated_at: '2026-10-23T08:37:00+07:00',
    });
  });

  it('jam 23.xx WIB tetap di tanggal yang sama (tidak digeser ke hari berikutnya)', () => {
    const { rows } = parseArchive(raw([[wib('2025-03-01', '23:10:00'), 1_700_000]], []));
    expect(rows[0]).toMatchObject({ date: '2025-03-01', buyback_price: null });
  });

  it('titik ganda per tanggal → titik terakhir; titik tanpa jam → source_updated_at kosong', () => {
    const { rows } = parseArchive(
      raw(
        [
          [wib('2012-05-02'), 560_000],
          [wib('2020-03-19', '08:30:00'), 830_000],
          [wib('2020-03-19', '14:05:00'), 845_000],
        ],
        [[wib('2020-03-19', '08:30:00'), 760_000]],
      ),
    );
    expect(rows).toEqual([
      expect.objectContaining({ date: '2012-05-02', sell_price: 560_000, source_updated_at: null }),
      expect.objectContaining({
        date: '2020-03-19',
        sell_price: 845_000,
        buyback_price: 760_000,
        source_updated_at: '2020-03-19T14:05:00+07:00',
      }),
    ]);
  });

  it('arsip rusak → PARSE_ERROR', () => {
    for (const r of [
      { ...raw([], []), body: 'bukan json' },
      raw('x', []),
      raw([[1, 0]], []),
      raw([['x', 1]], []),
    ]) {
      expect(() => parseArchive(r)).toThrow(expect.objectContaining({ code: 'PARSE_ERROR' }));
    }
  });

  it('fetchRaw membaca dua file dari --input; tanpa --input → galat', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lm-archive-'));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'antam_sell.json'), JSON.stringify([[wib('2026-10-23'), 1]]));
    await writeFile(path.join(dir, 'antam_buy.json'), '[]');
    const ctx = { root: dir, runId: 'local-x', userAgent: 't', now: new Date() };
    const got = await logammuliaArchive.fetchRaw({ ...ctx, input: dir });
    expect(JSON.parse(got.body)).toEqual({ sell: [[wib('2026-10-23'), 1]], buyback: [] });
    await expect(logammuliaArchive.fetchRaw(ctx)).rejects.toThrow(/--input wajib/);
    expect(logammuliaArchive.localOnly).toBe(true);
  });
});
