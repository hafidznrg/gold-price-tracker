import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SourceStatusEntry } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { loadConfig, type ProjectConfig } from '../src/config';
import { isExpectedDay } from '../src/pipeline/calendar';
import {
  doneToday,
  plan,
  PlanError,
  GITHUB_SCHEDULES,
  SCHEDULES,
  slotOf,
  targetDate,
  type PlanInput,
} from '../src/pipeline/plan';
import { ROOT } from './helpers';

const config: ProjectConfig = await loadConfig(ROOT);
/**
 * Konfigurasi uji: UBS dan Pegadaian aktif, Logam Mulia nonaktif. Pegadaian dipaksa berjendela
 * `midday` agar perilaku jendela malam tetap teruji (D-46); `midday` dan `any` diuji terpisah (D-42).
 * UBS dipaksa ke jendela `day` dan kalender Senin–Jumat (konfigurasi sebelum D-63) sebagai sumber
 * jendela siang generik; konfigurasi aslinya (`afternoon`, `mon_sat_id`) diuji terpisah.
 */
const retail: ProjectConfig = {
  ...config,
  sources: config.sources.map((s) => ({
    ...s,
    enabled: s.id === 'ubslifestyle' || s.id === 'pegadaian',
    ...(s.id === 'pegadaian' ? { schedule_window: 'evening' as const } : {}),
    ...(s.id === 'ubslifestyle'
      ? { schedule_window: 'day' as const, update_calendar: 'business_days_id' as const }
      : {}),
  })),
};
const anyWindow: ProjectConfig = {
  ...retail,
  sources: retail.sources.map((s) =>
    s.id === 'pegadaian' ? { ...s, schedule_window: 'any' as const } : s,
  ),
};

const midday: ProjectConfig = {
  ...retail,
  sources: retail.sources.map((s) =>
    s.id === 'pegadaian' ? { ...s, schedule_window: 'midday' as const } : s,
  ),
};

const MONDAY_1040 = new Date('2026-10-26T03:40:00Z');
const MONDAY_1340 = new Date('2026-10-26T06:40:00Z');
const MONDAY_1925 = new Date('2026-10-26T12:25:00Z');

const entry = (over: Partial<SourceStatusEntry>): SourceStatusEntry => ({
  last_run_id: '1-1',
  last_status: 'success',
  last_success_at: '2026-10-26T03:30:00Z',
  last_data_date: '2026-10-26',
  consecutive_failures: 0,
  updated_at: '2026-10-26T03:30:00Z',
  ...over,
});

const input = (over: Partial<PlanInput>): PlanInput => ({
  workflow: 'scrape-retail',
  event: 'schedule',
  schedule: '20 2 * * *',
  sources: '',
  force: false,
  config: retail,
  status: {},
  now: MONDAY_1040,
  ...over,
});

describe('isExpectedDay', () => {
  const holidays = [{ date: '2026-12-25' }];
  it.each([
    ['daily', '2026-10-25', true],
    ['weekdays', '2026-10-24', false],
    ['weekdays', '2026-10-26', true],
    ['business_days_id', '2026-10-26', true],
    ['business_days_id', '2026-12-25', false],
    ['mon_sat_id', '2026-11-14', true], // Sabtu
    ['mon_sat_id', '2026-11-15', false], // Minggu
    ['mon_sat_id', '2026-12-25', false],
    ['weekdays', '2026-12-25', true],
    ['monthly', '2026-10-26', false],
  ] as const)('%s %s → %s', (calendar, date, expected) => {
    expect(isExpectedDay(calendar, date, holidays)).toBe(expected);
  });
});

describe('slotOf', () => {
  it('cron retry siang/malam → retry, cron lain → primary, manual → manual', () => {
    for (const c of ['20 1', '20 2', '20 4', '20 6', '20 9', '15 21', '15 2']) {
      expect(slotOf('scrape-retail', 'schedule', `${c} * * *`)).toBe('retry');
    }
    expect(slotOf('scrape-retail', 'schedule', '20 12 * * *')).toBe('primary'); // sapuan
    expect(slotOf('scrape-retail', 'schedule', '15 12 * * *')).toBe('primary'); // tak terdaftar
    expect(slotOf('scrape-retail', 'workflow_dispatch', '')).toBe('manual');
    expect(slotOf('scrape-macro', 'schedule', '20 9 * * 1-5')).toBe('primary');
  });

  it('cron scrape-*.yml = GITHUB_SCHEDULES, semuanya slot retry terdaftar (D-46)', async () => {
    for (const wf of ['scrape-retail', 'scrape-macro'] as const) {
      const file = path.join(ROOT, '.github', 'workflows', `${wf}.yml`);
      const yml = parseYaml(await readFile(file, 'utf8')) as {
        on: { schedule: { cron: string }[] };
      };
      const crons = yml.on.schedule.map((s) => s.cron).sort();
      expect(crons).toEqual([...GITHUB_SCHEDULES[wf]!].sort());
      for (const c of crons) expect(SCHEDULES[wf]![c]?.slot).toBe('retry');
    }
  });
});

describe('carry_over (snapshot salinan hari sebelumnya)', () => {
  it('doneToday false bila carry_over true', () => {
    expect(doneToday(entry({}), '2026-10-26')).toBe(true);
    expect(doneToday(entry({ carry_over: false }), '2026-10-26')).toBe(true);
    expect(doneToday(entry({ carry_over: true }), '2026-10-26')).toBe(false);
  });

  it('retry siang tidak melewati sumber accept_previous_day yang carry_over', () => {
    const cfg = { config: anyWindow, schedule: '20 6 * * *', now: MONDAY_1340 };
    const base = { last_data_date: '2026-10-25' };
    const done = plan(input({ ...cfg, status: { pegadaian: entry(base) } }));
    expect(done.skipped).toContainEqual({ source: 'pegadaian', reason: 'sudah sukses hari ini' });
    const carry = plan(
      input({ ...cfg, status: { pegadaian: entry({ ...base, carry_over: true }) } }),
    );
    expect(carry.sources).toContain('pegadaian');
    const today = plan(input({ ...cfg, status: { pegadaian: entry({ carry_over: true }) } }));
    expect(today.sources).toContain('pegadaian');
  });
});

describe('plan', () => {
  it('retry 09.20: hanya jendela day; sumber yang sudah sukses dilewati', () => {
    const r = plan(input({}));
    expect(r).toMatchObject({ slot: 'retry', sources: ['ubslifestyle'], has_work: true });
    expect(r.matrix.include).toEqual([{ source: 'ubslifestyle', browser: false, early: false }]);
    const done = plan(input({ status: { ubslifestyle: entry({}) } }));
    expect(done.has_work).toBe(false);
  });

  it('sapuan 19.20 (primary): menjalankan ulang sumber yang sudah sukses (D-67)', () => {
    const done = { ubslifestyle: entry({}), pegadaian: entry({}) };
    const cfg = { config: midday };
    const r = plan(input({ ...cfg, schedule: '20 12 * * *', now: MONDAY_1925, status: done }));
    expect(r).toMatchObject({ slot: 'primary', date: '2026-10-26', has_work: true });
    expect(r.sources).toEqual(['ubslifestyle', 'pegadaian']);
    expect(r.skipped).toEqual([]);
    const retry = plan(input({ ...cfg, schedule: '20 9 * * *', now: MONDAY_1925, status: done }));
    expect(retry.sources).toEqual([]);
  });

  it('percobaan awal 08.20 (D-67): lolos DAY_FROM (08.15) dan ditandai early', () => {
    const at = (t: string) => new Date(`2026-10-26T${t}:00+07:00`);
    const r = plan(input({ schedule: '20 1 * * *', now: at('08:20') }));
    expect(r).toMatchObject({ slot: 'retry', date: '2026-10-26', sources: ['ubslifestyle'] });
    expect(r.matrix.include).toEqual([{ source: 'ubslifestyle', browser: false, early: true }]);
    const done = plan(
      input({ schedule: '20 1 * * *', now: at('08:20'), status: { ubslifestyle: entry({}) } }),
    );
    expect(done.sources).toEqual([]);
    expect(done.skipped).toEqual([{ source: 'ubslifestyle', reason: 'sudah sukses hari ini' }]);
  });

  it('jendela any (D-42): Pegadaian ikut slot siang dan malam, tidak dilewati manual siang', () => {
    expect(config.sources.find((s) => s.id === 'pegadaian')?.schedule_window).toBe('midday'); // D-67; ny diuji lewat anyWindow
    const cfg = { config: anyWindow };
    expect(plan(input(cfg)).sources).toEqual(['ubslifestyle', 'pegadaian']);
    expect(plan(input({ ...cfg, schedule: '20 12 * * *', now: MONDAY_1925 })).sources).toEqual([
      'ubslifestyle',
      'pegadaian',
    ]);
    const manual = plan(input({ ...cfg, event: 'workflow_dispatch', schedule: '' }));
    expect(manual.sources).toEqual(['ubslifestyle', 'pegadaian']);
    // Slot siang membaca snapshot kemarin → last_data_date kemarin. Sekali sukses hari ini, retry
    // siang berikutnya dilewati karena hanya menghasilkan commit +0 (D-46).
    const caughtUp = entry({
      last_data_date: '2026-10-25',
      last_success_at: '2026-10-26T02:06:00Z',
    });
    const retry = plan(
      input({ ...cfg, schedule: '20 6 * * *', now: MONDAY_1340, status: { pegadaian: caughtUp } }),
    );
    expect(retry.sources).toEqual(['ubslifestyle']);
    expect(retry.skipped).toContainEqual({ source: 'pegadaian', reason: 'sudah sukses hari ini' });
    // Sukses terakhir kemarin malam → retry siang tetap menambal.
    const lastNight = entry({
      last_data_date: '2026-10-25',
      last_success_at: '2026-10-25T12:10:00Z',
    });
    expect(
      plan(
        input({
          ...cfg,
          schedule: '20 6 * * *',
          now: MONDAY_1340,
          status: { pegadaian: lastNight },
        }),
      ).sources,
    ).toEqual(['ubslifestyle', 'pegadaian']);
    // Sapuan 19.20 tetap menjalankan ulang walau siangnya sukses (primary, D-67).
    expect(
      plan(
        input({
          ...cfg,
          schedule: '20 12 * * *',
          now: MONDAY_1925,
          status: { pegadaian: caughtUp },
        }),
      ).sources,
    ).toEqual(['ubslifestyle', 'pegadaian']);
  });

  it('pengaman jendela siang (D-46): cron 04.15 yang tiba sebelum 08.15 WIB tidak scrape', () => {
    const early = plan(input({ schedule: '15 21 * * *', now: new Date('2026-10-25T21:20:00Z') }));
    expect(early.date).toBe('2026-10-26');
    expect(early.sources).toEqual([]);
    expect(early.skipped).toContainEqual({
      source: 'ubslifestyle',
      reason: 'jendela siang mulai 08:15 WIB',
    });
    // Tiba terlambat seperti biasa (±11.00 WIB) → jalan sebagai retry.
    const late = plan(input({ schedule: '15 21 * * *', now: new Date('2026-10-26T04:00:00Z') }));
    expect(late).toMatchObject({ slot: 'retry', date: '2026-10-26', sources: ['ubslifestyle'] });
    // Retry siang kemarin yang tiba dini hari tetap menambal tanggal kemarin.
    const overnight = plan(
      input({ schedule: '15 2 * * *', now: new Date('2026-10-26T19:00:00Z') }),
    );
    expect(overnight).toMatchObject({ date: '2026-10-26', sources: ['ubslifestyle'] });
  });

  it('retry: lewati yang sudah sukses hari ini; jalankan yang gagal/stale', () => {
    const failed = entry({ last_status: 'failed', last_success_at: '2026-10-25T12:10:00Z' });
    const day = plan(
      input({ schedule: '20 6 * * *', now: MONDAY_1340, status: { ubslifestyle: entry({}) } }),
    );
    expect(day.sources).toEqual([]);
    expect(day.skipped).toEqual([{ source: 'ubslifestyle', reason: 'sudah sukses hari ini' }]);
    const noon = plan(
      input({
        config: midday,
        schedule: '20 4 * * *',
        now: new Date('2026-10-26T04:25:00Z'),
        status: { ubslifestyle: entry({}), pegadaian: failed },
      }),
    );
    expect(noon.sources).toEqual(['pegadaian']);
    // Jendela midday tidak ikut slot 09.20 (hanya day).
    expect(plan(input({ config: midday })).sources).toEqual(['ubslifestyle']);
  });

  it('retry: sukses kemarin tidak dihitung sukses hari ini', () => {
    const yesterday = entry({
      last_success_at: '2026-10-25T03:30:00Z',
      last_data_date: '2026-10-25',
    });
    const r = plan(
      input({ schedule: '20 6 * * *', now: MONDAY_1340, status: { ubslifestyle: yesterday } }),
    );
    expect(r.sources).toContain('ubslifestyle');
  });

  it('retry: stale di hari yang tidak diharapkan dilewati (UBS hari Minggu)', () => {
    const sunday = new Date('2026-10-25T06:30:00Z');
    const stale = entry({
      last_status: 'stale',
      last_success_at: '2026-10-24T03:30:00Z',
      updated_at: '2026-10-25T03:30:00Z',
    });
    const r = plan(input({ schedule: '20 6 * * *', now: sunday, status: { ubslifestyle: stale } }));
    expect(r.sources).toEqual([]);
    expect(r.skipped).toEqual([
      { source: 'ubslifestyle', reason: 'stale di hari yang tidak diharapkan' },
    ]);
  });

  it('manual: input sources; force=false melewati yang sudah sukses', () => {
    const status = { ubslifestyle: entry({}) };
    const base = { event: 'workflow_dispatch', schedule: '', status };
    expect(plan(input({ ...base, sources: 'ubslifestyle' })).has_work).toBe(false);
    expect(plan(input({ ...base, sources: 'ubslifestyle', force: true })).sources).toEqual([
      'ubslifestyle',
    ]);
    expect(plan(input({ ...base, now: MONDAY_1925 })).sources).toEqual(['pegadaian']);
  });

  it('manual tanpa daftar sumber: sumber evening dilewati sebelum 18.45 WIB, kecuali disebut', () => {
    const manual = { event: 'workflow_dispatch', schedule: '' };
    const r = plan(input(manual));
    expect(r.sources).toEqual(['ubslifestyle']);
    expect(r.skipped).toEqual([{ source: 'pegadaian', reason: 'jendela malam mulai 18:45 WIB' }]);
    expect(plan(input({ ...manual, sources: 'pegadaian' })).sources).toEqual(['pegadaian']);
    const at1845 = new Date('2026-10-26T11:45:00Z');
    expect(plan(input({ ...manual, now: at1845 })).sources).toEqual(['ubslifestyle', 'pegadaian']);
  });

  it('manual: sumber nonaktif boleh disebut eksplisit; browser untuk Logam Mulia', () => {
    const r = plan(input({ event: 'workflow_dispatch', schedule: '', sources: 'logammulia' }));
    expect(r.matrix.include).toEqual([{ source: 'logammulia', browser: true, early: false }]);
  });

  it('manual: sumber tak dikenal atau dari workflow lain → PlanError', () => {
    const manual = { event: 'workflow_dispatch', schedule: '' };
    expect(() => plan(input({ ...manual, sources: 'tokopedia' }))).toThrow(PlanError);
    expect(() => plan(input({ ...manual, sources: 'xaus' }))).toThrow(/scrape-retail/);
  });

  it('tidak ada sumber aktif → has_work=false, matrix kosong', () => {
    const none = { ...retail, sources: retail.sources.map((s) => ({ ...s, enabled: false })) };
    expect(plan(input({ config: none }))).toMatchObject({
      has_work: false,
      sources: [],
      matrix: { include: [] },
    });
  });
});

describe('targetDate (D-27)', () => {
  it('cron tepat waktu → tanggal slot itu', () => {
    expect(targetDate('schedule', '20 2 * * *', new Date('2026-10-26T03:31:00Z'))).toBe(
      '2026-10-26',
    );
    expect(targetDate('schedule', '20 12 * * *', MONDAY_1925)).toBe('2026-10-26');
  });

  it('slot malam terlambat lewat tengah malam WIB tetap menyasar tanggal slot', () => {
    // 26 Okt: cron 12.05 UTC jalan 18.35 UTC (01.35 WIB 27 Okt), cron 14.05 UTC jalan 19.47 UTC.
    expect(targetDate('schedule', '20 12 * * *', new Date('2026-10-26T18:35:00Z'))).toBe(
      '2026-10-26',
    );
    expect(targetDate('schedule', '15 2 * * *', new Date('2026-10-26T19:47:00Z'))).toBe(
      '2026-10-26',
    );
  });

  it('slot siang terlambat berjam-jam tetap di hari yang sama', () => {
    expect(targetDate('schedule', '20 6 * * *', new Date('2026-10-26T13:17:00Z'))).toBe(
      '2026-10-26',
    );
  });

  it('run manual dan cron tak dikenal memakai tanggal sekarang', () => {
    const late = new Date('2026-10-26T18:35:00Z');
    expect(targetDate('workflow_dispatch', '', late)).toBe('2026-10-27');
    expect(targetDate('schedule', '*/15 * * * *', late)).toBe('2026-10-27');
  });

  it('plan: retry malam yang terlambat melewati sumber yang sudah sukses untuk tanggal slot', () => {
    const now = new Date('2026-10-26T19:47:00Z');
    const done = entry({
      last_success_at: '2026-10-26T18:35:30Z', // 01.35 WIB 27 Okt
      last_data_date: '2026-10-26',
    });
    const r = plan(
      input({ config: midday, schedule: '15 2 * * *', now, status: { pegadaian: done } }),
    );
    expect(r.date).toBe('2026-10-26');
    expect(r.skipped).toEqual([{ source: 'pegadaian', reason: 'sudah sukses hari ini' }]);
  });
});

describe('jendela sore UBS (D-63)', () => {
  /** Konfigurasi asli: UBS `afternoon` + `mon_sat_id`, Logam Mulia `day`, Pegadaian/Galeri24 `midday`. */
  const real: ProjectConfig = config;
  const SAT = '2026-11-14';
  const at = (wib: string) => new Date(`${SAT}T${wib}:00+07:00`);
  const stale = entry({
    last_status: 'stale',
    last_data_date: '2026-11-13',
    last_success_at: '2026-11-13T08:16:50Z',
    updated_at: '2026-11-14T02:06:15Z',
  });

  it('konfigurasi UBS: jendela afternoon, kalender Senin–Sabtu', () => {
    const ubs = real.sources.find((s) => s.id === 'ubslifestyle')!;
    expect(ubs.schedule_window).toBe('afternoon');
    expect(ubs.update_calendar).toBe('mon_sat_id');
  });

  it('slot 09.20 dan 11.20 tidak menjalankan UBS', () => {
    for (const [schedule, wib] of [
      ['20 2 * * *', '09:20'],
      ['20 4 * * *', '11:20'],
    ] as const) {
      const r = plan(input({ config: real, schedule, now: at(wib) }));
      expect(r.sources).not.toContain('ubslifestyle');
    }
  });

  it('percobaan awal 13.20 dan retry 16.20 menjalankan UBS yang stale di hari Sabtu', () => {
    const early = plan(input({ config: real, schedule: '20 6 * * *', now: at('13:20') }));
    expect(early).toMatchObject({ slot: 'retry', date: SAT });
    expect(early.sources).toContain('ubslifestyle');
    expect(early.matrix.include.find((m) => m.source === 'ubslifestyle')?.early).toBe(true);
    const retry = plan(
      input({
        config: real,
        schedule: '20 9 * * *',
        now: at('16:20'),
        status: { ubslifestyle: stale },
      }),
    );
    expect(retry.slot).toBe('retry');
    expect(retry.sources).toContain('ubslifestyle');
  });

  it('retry 16.20 melewati UBS yang sudah sukses atau stale di hari Minggu', () => {
    const done = plan(
      input({
        config: real,
        schedule: '20 9 * * *',
        now: at('16:20'),
        status: { ubslifestyle: entry({ last_data_date: SAT }) },
      }),
    );
    expect(done.sources).not.toContain('ubslifestyle');
    const sunday = plan(
      input({
        config: real,
        schedule: '20 9 * * *',
        now: new Date('2026-11-15T16:20:00+07:00'),
        status: {
          ubslifestyle: { ...stale, last_data_date: SAT, updated_at: '2026-11-15T08:05:00Z' },
        },
      }),
    );
    expect(sunday.skipped).toContainEqual({
      source: 'ubslifestyle',
      reason: 'stale di hari yang tidak diharapkan',
    });
  });

  it('cron GitHub 09.15 mencakup day dan afternoon; UBS dilewati bila tiba sebelum 12.00 WIB', () => {
    const late = plan(input({ config: real, schedule: '15 2 * * *', now: at('16:30') }));
    expect(late.sources).toEqual(expect.arrayContaining(['ubslifestyle', 'logammulia']));
    const early = plan(input({ config: real, schedule: '15 2 * * *', now: at('11:30') }));
    expect(early.sources).not.toContain('ubslifestyle');
    expect(early.skipped).toContainEqual({
      source: 'ubslifestyle',
      reason: 'jendela sore mulai 12:00 WIB',
    });
  });
});

describe('jadwal Cloudflare D-67 (konfigurasi asli, Sabtu 14 Nov 2026)', () => {
  const SAT = '2026-11-14';
  const at = (wib: string) => new Date(`${SAT}T${wib}:00+07:00`);
  const real = config;
  const run = (schedule: string, wib: string, status: PlanInput['status'] = {}) =>
    plan(input({ config: real, schedule, now: at(wib), status }));
  const earlyOf = (r: ReturnType<typeof plan>) =>
    r.matrix.include.filter((m) => m.early).map((m) => m.source);
  const ALL = ['ubslifestyle', 'pegadaian', 'galeri24', 'lotusarchi', 'logammulia'];

  it('konfigurasi: pegadaian dan galeri24 midday; UBS dan Lotus afternoon; Logam Mulia day', () => {
    const win = Object.fromEntries(real.sources.map((s) => [s.id, s.schedule_window]));
    expect(win).toMatchObject({
      pegadaian: 'midday',
      galeri24: 'midday',
      ubslifestyle: 'afternoon',
      lotusarchi: 'afternoon',
      logammulia: 'day',
    });
  });

  it('08.20: hanya Logam Mulia, early', () => {
    const r = run('20 1 * * *', '08:20');
    expect(r).toMatchObject({ slot: 'retry', sources: ['logammulia'] });
    expect(earlyOf(r)).toEqual(['logammulia']);
  });

  it('09.20: Logam Mulia, bukan early', () => {
    const r = run('20 2 * * *', '09:20');
    expect(r.sources).toEqual(['logammulia']);
    expect(earlyOf(r)).toEqual([]);
  });

  it('11.20: day + midday', () => {
    expect(run('20 4 * * *', '11:20').sources).toEqual(['pegadaian', 'galeri24', 'logammulia']);
  });

  it('13.20: day + midday, UBS dan Lotus Archi early', () => {
    const r = run('20 6 * * *', '13:20');
    expect(r.sources).toEqual(ALL);
    expect(earlyOf(r)).toEqual(['ubslifestyle', 'lotusarchi']);
  });

  it('16.20: semua jendela, tanpa early; yang sudah sukses dilewati', () => {
    const r = run('20 9 * * *', '16:20');
    expect(r.sources).toEqual(ALL);
    expect(earlyOf(r)).toEqual([]);
    const done = run('20 9 * * *', '16:20', { logammulia: entry({ last_data_date: SAT }) });
    expect(done.sources).not.toContain('logammulia');
  });

  it('19.20: sapuan primary menjalankan ulang semuanya walau sudah sukses', () => {
    const ok = entry({ last_data_date: SAT, last_success_at: `${SAT}T08:00:00Z` });
    const status = Object.fromEntries(real.sources.map((s) => [s.id, ok]));
    const r = run('20 12 * * *', '19:20', status);
    expect(r.slot).toBe('primary');
    expect(r.sources).toEqual(ALL);
  });
});
