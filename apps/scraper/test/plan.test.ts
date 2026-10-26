import type { SourceStatusEntry } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { loadConfig, type ProjectConfig } from '../src/config';
import { isExpectedDay } from '../src/pipeline/calendar';
import { plan, PlanError, slotOf, type PlanInput } from '../src/pipeline/plan';
import { ROOT } from './helpers';

const config: ProjectConfig = await loadConfig(ROOT);
/** Konfigurasi uji: UBS dan Pegadaian aktif, Logam Mulia nonaktif. */
const retail: ProjectConfig = {
  ...config,
  sources: config.sources.map((s) => ({
    ...s,
    enabled: s.id === 'ubslifestyle' || s.id === 'pegadaian',
  })),
};

const MONDAY_1040 = new Date('2026-10-26T03:40:00Z');

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
  schedule: '25 3 * * *',
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
    ['weekdays', '2026-12-25', true],
    ['monthly', '2026-10-26', false],
  ] as const)('%s %s → %s', (calendar, date, expected) => {
    expect(isExpectedDay(calendar, date, holidays)).toBe(expected);
  });
});

describe('slotOf', () => {
  it('cron 25 6 → retry, cron lain → primary, manual → manual', () => {
    expect(slotOf('scrape-retail', 'schedule', '25 6 * * *')).toBe('retry');
    expect(slotOf('scrape-retail', 'schedule', '25 3 * * *')).toBe('primary');
    expect(slotOf('scrape-retail', 'workflow_dispatch', '')).toBe('manual');
    expect(slotOf('scrape-macro', 'schedule', '40 9 * * 1-5')).toBe('primary');
  });
});

describe('plan', () => {
  it('primary: semua sumber aktif workflow itu, walau sudah sukses', () => {
    const r = plan(input({ status: { ubslifestyle: entry({}) } }));
    expect(r).toMatchObject({
      slot: 'primary',
      sources: ['ubslifestyle', 'pegadaian'],
      has_work: true,
    });
    expect(r.matrix.include).toEqual([
      { source: 'ubslifestyle', browser: false },
      { source: 'pegadaian', browser: false },
    ]);
  });

  it('retry: lewati yang sudah sukses hari ini; jalankan yang gagal/stale', () => {
    const r = plan(
      input({
        schedule: '25 6 * * *',
        status: {
          ubslifestyle: entry({}),
          pegadaian: entry({ last_status: 'failed', last_success_at: '2026-10-25T03:30:00Z' }),
        },
      }),
    );
    expect(r.sources).toEqual(['pegadaian']);
    expect(r.skipped).toEqual([{ source: 'ubslifestyle', reason: 'sudah sukses hari ini' }]);
  });

  it('retry: sukses kemarin tidak dihitung sukses hari ini', () => {
    const yesterday = entry({ last_success_at: '2026-10-25T03:30:00Z' });
    const r = plan(input({ schedule: '25 6 * * *', status: { ubslifestyle: yesterday } }));
    expect(r.sources).toContain('ubslifestyle');
  });

  it('retry: stale di hari yang tidak diharapkan dilewati (UBS hari Minggu)', () => {
    const sunday = new Date('2026-10-25T06:30:00Z');
    const stale = entry({
      last_status: 'stale',
      last_success_at: '2026-10-24T03:30:00Z',
      updated_at: '2026-10-25T03:30:00Z',
    });
    const r = plan(input({ schedule: '25 6 * * *', now: sunday, status: { ubslifestyle: stale } }));
    expect(r.sources).toEqual(['pegadaian']);
  });

  it('manual: input sources; force=false melewati yang sudah sukses', () => {
    const status = { ubslifestyle: entry({}) };
    const base = { event: 'workflow_dispatch', schedule: '', status };
    expect(plan(input({ ...base, sources: 'ubslifestyle' })).has_work).toBe(false);
    expect(plan(input({ ...base, sources: 'ubslifestyle', force: true })).sources).toEqual([
      'ubslifestyle',
    ]);
    expect(plan(input({ ...base })).sources).toEqual(['pegadaian']);
  });

  it('manual: sumber nonaktif boleh disebut eksplisit; browser untuk Logam Mulia', () => {
    const r = plan(input({ event: 'workflow_dispatch', schedule: '', sources: 'logammulia' }));
    expect(r.matrix.include).toEqual([{ source: 'logammulia', browser: true }]);
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
