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
    expect(Object.keys(WATCHDOG_SCHEDULES).sort()).toEqual([
      '15 16 * * *',
      '20 10 * * *',
      '20 16 * * *',
    ]);
  });

  it('slot Cloudflare (D-67) dan cadangan GitHub', () => {
    const retail = SCHEDULES['scrape-retail']!;
    expect(retail['20 1 * * *']).toEqual({ slot: 'retry', windows: [], early: ['day'] });
    expect(retail['20 2 * * *']).toEqual({ slot: 'retry', windows: ['day'] });
    expect(retail['20 4 * * *']).toEqual({ slot: 'retry', windows: ['day', 'midday'] });
    expect(retail['20 6 * * *']).toEqual({
      slot: 'retry',
      windows: ['day', 'midday'],
      early: ['afternoon'],
    });
    expect(retail['20 9 * * *']).toEqual({
      slot: 'retry',
      windows: ['day', 'midday', 'afternoon'],
    });
    expect(retail['20 12 * * *']).toEqual({
      slot: 'primary',
      windows: ['day', 'midday', 'afternoon'],
    });
    expect(retail['15 21 * * *']).toEqual({ slot: 'retry', windows: ['day', 'midday'] });
    expect(retail['15 2 * * *']).toEqual({
      slot: 'retry',
      windows: ['day', 'midday', 'afternoon'],
    });
    expect(retail['15 12 * * *']).toBeUndefined();
    expect(SCHEDULES['scrape-macro']!['20 9 * * 1-5']).toEqual({
      slot: 'primary',
      windows: ['day'],
    });
    expect(SCHEDULES['scrape-macro']!['45 9 * * 1-5']).toEqual({ slot: 'retry', windows: ['day'] });
    expect(WATCHDOG_SCHEDULES).toMatchObject({
      '20 10 * * *': 'day_midday',
      '20 16 * * *': 'all',
    });
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

  it('cakupan day_midday (17.20 WIB): ritel day + midday, bukan afternoon (D-67)', () => {
    const r = watchdog({
      ...base,
      event: 'schedule',
      schedule: '20 10 * * *',
      now: new Date('2026-11-11T10:20:00Z'),
    });
    expect(r).toMatchObject({ date: '2026-11-11', scope: 'day_midday' });
    expect(r.checked).toEqual(['pegadaian', 'galeri24', 'logammulia']);
    expect(r.overdue.map((o) => o.source)).toEqual(['pegadaian', 'galeri24', 'logammulia']);
  });

  it('cakupan day_midday hari Sabtu tidak memeriksa UBS dan Lotus Archi', () => {
    const r = watchdog({
      ...base,
      event: 'schedule',
      schedule: '20 10 * * *',
      now: new Date('2026-11-14T10:20:00Z'), // Sabtu 17.20 WIB
    });
    expect(r).toMatchObject({ date: '2026-11-14', scope: 'day_midday' });
    expect(r.checked).toEqual(['pegadaian', 'galeri24', 'logammulia']);
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
      schedule: '20 16 * * *',
      now: new Date('2026-11-11T16:55:00Z'),
    });
    expect(r.scope).toBe('all');
    expect(r.overdue.map((o) => o.source).sort()).toEqual([
      'galeri24',
      'jisdor',
      'lotusarchi',
      'pegadaian',
    ]);
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
      schedule: '20 16 * * *',
      now: new Date('2026-11-11T18:30:00Z'), // 12 Nov 01.30 WIB
    });
    expect(r.date).toBe('2026-11-11');
  });

  it('sumber yang tidak diharapkan hari itu tidak diperiksa (Minggu: UBS dan makro libur, Galeri24 harian)', () => {
    const r = watchdog({
      ...base,
      event: 'workflow_dispatch',
      schedule: '',
      now: new Date('2026-11-15T15:00:00Z'), // Minggu 22.00 WIB
    });
    expect(r.checked.sort()).toEqual(['galeri24', 'logammulia', 'pegadaian']);
  });

  it('lotusarchi diperiksa di hari kerja, tidak di Sabtu/Minggu (business_days_id, D-68)', () => {
    expect(base.config.sources.find((s) => s.id === 'lotusarchi')).toMatchObject({
      enabled: true,
      update_calendar: 'business_days_id',
      stale_is_error_on_expected_day: true,
    });
    const run = (now: string) =>
      watchdog({ ...base, event: 'workflow_dispatch', schedule: '', now: new Date(now) });
    expect(run('2026-11-17T15:00:00Z').checked).toContain('lotusarchi'); // Selasa 22.00 WIB
    expect(run('2026-11-14T15:00:00Z').checked).not.toContain('lotusarchi'); // Sabtu
    expect(run('2026-11-15T15:00:00Z').checked).not.toContain('lotusarchi'); // Minggu
  });

  it('sumber ritel dengan stale_is_error_on_expected_day: false tidak diperiksa', () => {
    const cfg = {
      ...base.config,
      sources: base.config.sources.map((s) =>
        s.id === 'lotusarchi' ? { ...s, stale_is_error_on_expected_day: false } : s,
      ),
    };
    const r = watchdog({
      ...base,
      config: cfg,
      event: 'workflow_dispatch',
      schedule: '',
      now: new Date('2026-11-17T15:00:00Z'),
    });
    expect(r.checked).not.toContain('lotusarchi');
  });

  it('formatWatchdog: null bila lengkap, daftar sumber bila terlambat', () => {
    const okStatus = { logammulia: entry({}), pegadaian: entry({}), galeri24: entry({}) };
    const ok = watchdog({
      config,
      status: okStatus,
      event: 'schedule',
      schedule: '20 10 * * *',
      now: new Date('2026-11-11T10:20:00Z'),
    });
    expect(formatWatchdog(ok, 'https://x')).toBeNull();

    const late = watchdog({
      config,
      status: { ...missed, pegadaian: entry({}), galeri24: entry({}) },
      event: 'schedule',
      schedule: '20 10 * * *',
      now: new Date('2026-11-11T10:20:00Z'),
    });
    const text = formatWatchdog(late, 'https://github.com/o/r/actions')!;
    expect(text).toContain('data 2026-11-11 belum masuk (1 dari 3 sumber)');
    expect(text).toContain('• logammulia: data terakhir 2026-11-10, status success');
    expect(text).toContain('2026-11-10 18:27 WIB');
    expect(text).toContain('https://github.com/o/r/actions');
  });
});
