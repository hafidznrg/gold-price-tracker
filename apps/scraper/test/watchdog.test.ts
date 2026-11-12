import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SourceStatusEntry } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { loadConfig } from '../src/config';
import { plan, SCHEDULES } from '../src/pipeline/plan';
import {
  formatWatchdog,
  GITHUB_WATCHDOG_SCHEDULES,
  watchdog,
  WATCHDOG_SCHEDULES,
} from '../src/pipeline/watchdog';
import { ROOT } from './helpers';

const config = await loadConfig(ROOT);

const entry = (over: Partial<SourceStatusEntry>): SourceStatusEntry => ({
  last_run_id: '1-1',
  last_status: 'success',
  last_success_at: '2026-11-11T03:30:00Z',
  last_data_date: '2026-11-11',
  consecutive_failures: 0,
  updated_at: '2026-11-11T03:30:00Z',
  ...over,
});

/** Status 11 Nov 2026 pukul 17.00 WIB: belum ada satu pun run terjadwal hari itu. */
const missed = {
  logammulia: entry({ last_success_at: '2026-11-10T11:27:18Z', last_data_date: '2026-11-10' }),
  ubslifestyle: entry({ last_success_at: '2026-11-10T11:25:11Z', last_data_date: '2026-11-10' }),
  pegadaian: entry({ last_status: 'stale', last_data_date: '2026-11-09' }),
  xaus: entry({ last_success_at: '2026-11-10T17:18:00Z', last_data_date: '2026-11-09' }),
  jisdor: entry({ last_success_at: '2026-11-10T17:18:02Z', last_data_date: '2026-11-10' }),
};

const crons = async (file: string) => {
  const yml = parseYaml(await readFile(path.join(ROOT, '.github', 'workflows', file), 'utf8')) as {
    on: { schedule: { cron: string }[] };
  };
  return yml.on.schedule.map((s) => s.cron).sort();
};

describe('jadwal (D-46)', () => {
  it('cron watchdog.yml = GITHUB_WATCHDOG_SCHEDULES, terdaftar di WATCHDOG_SCHEDULES', async () => {
    expect(await crons('watchdog.yml')).toEqual([...GITHUB_WATCHDOG_SCHEDULES].sort());
    for (const c of GITHUB_WATCHDOG_SCHEDULES) expect(WATCHDOG_SCHEDULES[c]).toBe('all');
  });

  it('slot utama Cloudflare dan cadangan GitHub', () => {
    const retail = SCHEDULES['scrape-retail']!;
    expect(retail['5 2 * * *']).toEqual({ slot: 'primary', window: 'day' });
    expect(retail['5 5 * * *']).toEqual({ slot: 'retry', window: 'day' });
    expect(retail['5 12 * * *']).toEqual({ slot: 'primary', window: 'evening' });
    expect(retail['5 15 * * *']).toEqual({ slot: 'retry', window: 'evening' });
    expect(retail['15 21 * * *']).toEqual({ slot: 'retry', window: 'day' });
    expect(SCHEDULES['scrape-macro']!['45 9 * * 1-5']).toEqual({ slot: 'retry', window: 'day' });
    expect(WATCHDOG_SCHEDULES).toMatchObject({ '5 6 * * *': 'day', '5 16 * * *': 'all' });
  });

  it('watchdog GitHub yang tiba esok pagi memeriksa tanggal kemarin', () => {
    const r = watchdog({
      config,
      status: missed,
      event: 'schedule',
      schedule: '15 16 * * *',
      now: new Date('2026-11-11T23:10:00Z'), // 12 Nov 06.10 WIB
    });
    expect(r).toMatchObject({ date: '2026-11-11', scope: 'all' });
  });

  it('retry makro melewati xaus yang sudah sukses hari ini walau tanggal datanya kemarin', () => {
    const now = new Date('2026-11-11T11:45:00Z'); // Rabu 18.45 WIB
    const status = {
      xaus: entry({ last_success_at: '2026-11-11T09:44:00Z', last_data_date: '2026-11-10' }),
      jisdor: entry({ last_success_at: '2026-11-10T09:44:00Z', last_data_date: '2026-11-10' }),
    };
    const r = plan({
      workflow: 'scrape-macro',
      event: 'schedule',
      schedule: '45 9 * * 1-5',
      sources: '',
      force: false,
      monthlyGold: ['2026-10-01'],
      config,
      status,
      now,
    });
    expect(r.slot).toBe('retry');
    expect(r.sources).toEqual(['jisdor']);
    expect(r.skipped).toContainEqual({ source: 'xaus', reason: 'sudah sukses hari ini' });
  });
});

describe('watchdog', () => {
  const base = { config, status: missed };

  it('cakupan day (16.50 WIB): hanya ritel jendela day', () => {
    const r = watchdog({
      ...base,
      event: 'schedule',
      schedule: '5 6 * * *',
      now: new Date('2026-11-11T10:05:00Z'),
    });
    expect(r).toMatchObject({ date: '2026-11-11', scope: 'day' });
    expect(r.checked.sort()).toEqual(['logammulia', 'ubslifestyle']);
    expect(r.overdue.map((o) => o.source).sort()).toEqual(['logammulia', 'ubslifestyle']);
  });

  it('cakupan all: ritel butuh data bertanggal hari itu, makro cukup sukses hari itu', () => {
    const status = {
      ...missed,
      logammulia: entry({}),
      ubslifestyle: entry({}),
      xaus: entry({ last_success_at: '2026-11-11T09:44:00Z', last_data_date: '2026-11-10' }),
    };
    const r = watchdog({
      config,
      status,
      event: 'schedule',
      schedule: '5 16 * * *',
      now: new Date('2026-11-11T16:55:00Z'),
    });
    expect(r.scope).toBe('all');
    expect(r.overdue.map((o) => o.source).sort()).toEqual(['jisdor', 'pegadaian']);
  });

  it('sukses makro dini hari = run kemarin yang terlambat, belum dihitung', () => {
    const r = watchdog({
      ...base,
      event: 'workflow_dispatch',
      schedule: '',
      now: new Date('2026-11-11T16:55:00Z'),
    });
    // jisdor & xaus sukses 11 Nov 00.18 WIB (run 10 Nov yang terlambat).
    expect(r.overdue.map((o) => o.source)).toEqual(expect.arrayContaining(['jisdor', 'xaus']));
  });

  it('terlambat lewat tengah malam tetap memeriksa tanggal cron', () => {
    const r = watchdog({
      ...base,
      event: 'schedule',
      schedule: '5 16 * * *',
      now: new Date('2026-11-11T18:30:00Z'), // 12 Nov 01.30 WIB
    });
    expect(r.date).toBe('2026-11-11');
  });

  it('sumber yang tidak diharapkan hari itu tidak diperiksa (Minggu: UBS dan makro libur)', () => {
    const r = watchdog({
      ...base,
      event: 'workflow_dispatch',
      schedule: '',
      now: new Date('2026-11-15T15:00:00Z'), // Minggu 22.00 WIB
    });
    expect(r.checked.sort()).toEqual(['logammulia', 'pegadaian']);
  });

  it('formatWatchdog: null bila lengkap, daftar sumber bila terlambat', () => {
    const ok = watchdog({
      config,
      status: { logammulia: entry({}), ubslifestyle: entry({}) },
      event: 'schedule',
      schedule: '5 6 * * *',
      now: new Date('2026-11-11T10:05:00Z'),
    });
    expect(formatWatchdog(ok, 'https://x')).toBeNull();

    const late = watchdog({
      ...base,
      event: 'schedule',
      schedule: '5 6 * * *',
      now: new Date('2026-11-11T10:05:00Z'),
    });
    const text = formatWatchdog(late, 'https://github.com/o/r/actions')!;
    expect(text).toContain('data 2026-11-11 belum masuk (2 dari 2 sumber)');
    expect(text).toContain('• logammulia: data terakhir 2026-11-10, status success');
    expect(text).toContain('2026-11-10 18:27 WIB');
    expect(text).toContain('https://github.com/o/r/actions');
  });
});
