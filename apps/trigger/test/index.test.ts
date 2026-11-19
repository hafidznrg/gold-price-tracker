import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { SCHEDULES } from '../../scraper/src/pipeline/plan';
import { WATCHDOG_SCHEDULES } from '../../scraper/src/pipeline/watchdog';
import { dispatch, route, ROUTES, run, type Env } from '../src/index';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => readFile(path.join(ROOT, p), 'utf8');
/** Cron dari baris `- cron: '…'` di YAML workflow. */
const ymlCrons = async (file: string) =>
  [...(await read(`.github/workflows/${file}`)).matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);

const env: Env = { GITHUB_TOKEN: 't0k', GITHUB_REPO: 'o/r' };

const ALL = '20 1,2,4,6,9,10,12,16 * * *';

describe('ROUTES', () => {
  it('sama dengan crons di wrangler.toml dan ≤ 5 (paket Free)', async () => {
    const toml = await read('apps/trigger/wrangler.toml');
    const crons = JSON.parse(/^crons = (\[.*\])$/m.exec(toml)![1]!) as string[];
    expect(crons.sort()).toEqual(Object.keys(ROUTES).sort());
    expect(crons).toEqual([ALL]);
    expect(crons.length).toBeLessThanOrEqual(5);
  });

  /** Kunci slot yang dikenal `plan --emulate` / `watchdog --emulate` per file workflow. */
  const registered = (workflow: string): string[] =>
    Object.keys(
      workflow === 'watchdog.yml'
        ? WATCHDOG_SCHEDULES
        : SCHEDULES[workflow.replace('.yml', '') as 'scrape-retail' | 'scrape-macro']!,
    );

  it('setiap jam terpetakan ke slot terdaftar yang bukan cron GitHub (D-46)', async () => {
    for (const [cron, byHour] of Object.entries(ROUTES)) {
      const [minute, hours] = cron.split(' ');
      expect(Object.keys(byHour).sort()).toEqual(hours!.split(',').sort());
      for (const [hour, targets] of Object.entries(byHour)) {
        expect(targets.length).toBeGreaterThan(0);
        for (const target of targets) {
          expect(registered(target.workflow)).toContain(target.schedule);
          // Cron GitHub cadangan berslot retry; slot Worker tidak boleh tertimpa olehnya.
          expect(await ymlCrons(target.workflow)).not.toContain(target.schedule);
          // Menit dan jam sama dengan cron yang ditiru; hari = * atau 1-5 untuk weekdaysOnly.
          const [m, h, , , dow] = target.schedule.split(' ');
          expect(m).toBe(minute);
          expect(h).toBe(hour);
          expect(dow).toBe(target.weekdaysOnly ? '1-5' : '*');
        }
      }
    }
  });

  it('hari-minggu Worker memakai nama hari bila ada (Cloudflare: 1 = Minggu, bukan Senin)', () => {
    for (const cron of Object.keys(ROUTES)) expect(cron.split(' ')[4]).toMatch(/^(\*|[A-Z-]+)$/);
  });

  it('route memilih menurut jam UTC scheduledTime', () => {
    const slots = (iso: string) => route(ALL, Date.parse(iso)).map((t) => t.schedule);
    expect(slots('2026-11-13T01:20:00Z')).toEqual(['20 1 * * *']);
    expect(slots('2026-11-13T02:20:00Z')).toEqual(['20 2 * * *']);
    expect(slots('2026-11-13T04:20:00Z')).toEqual(['20 4 * * *']);
    expect(slots('2026-11-13T06:20:00Z')).toEqual(['20 6 * * *']);
    expect(slots('2026-11-13T10:20:00Z')).toEqual(['20 10 * * *']);
    expect(slots('2026-11-13T12:20:00Z')).toEqual(['20 12 * * *']);
    expect(slots('2026-11-13T16:20:00Z')).toEqual(['20 16 * * *']);
    expect(route(ALL, Date.parse('2026-11-13T10:20:00Z'))[0]?.workflow).toBe('watchdog.yml');
    expect(slots('2026-11-13T05:20:00Z')).toEqual([]);
    expect(route('* * * * *', Date.now())).toEqual([]);
  });

  it('jam 09 UTC Senin–Jumat: ritel + makro (2 dispatch); Sabtu/Minggu: ritel saja', () => {
    const mon = route(ALL, Date.parse('2026-11-16T09:20:00Z'));
    expect(mon).toEqual([
      { workflow: 'scrape-retail.yml', schedule: '20 9 * * *' },
      { workflow: 'scrape-macro.yml', schedule: '20 9 * * 1-5' },
    ]);
    expect(route(ALL, Date.parse('2026-11-13T09:20:00Z'))).toHaveLength(2); // Jumat
    for (const day of ['2026-11-14', '2026-11-15']) {
      expect(route(ALL, Date.parse(`${day}T09:20:00Z`))).toEqual([
        { workflow: 'scrape-retail.yml', schedule: '20 9 * * *' },
      ]);
    }
  });
});

describe('dispatch', () => {
  const target = { workflow: 'scrape-retail.yml', schedule: '20 2 * * *' };

  it('POST workflow_dispatch dengan input schedule', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    await dispatch(target, env, fetchFn, 0);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/o/r/actions/workflows/scrape-retail.yml/dispatches',
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t0k');
    expect(JSON.parse(init.body as string)).toEqual({
      ref: 'main',
      inputs: { schedule: '20 2 * * *' },
    });
  });

  it('coba ulang 5xx lalu sukses; 4xx langsung gagal', async () => {
    const flaky = vi
      .fn()
      .mockResolvedValueOnce(new Response('down', { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await dispatch(target, env, flaky, 0);
    expect(flaky).toHaveBeenCalledTimes(2);

    const denied = vi.fn(async () => new Response('Bad credentials', { status: 401 }));
    await expect(dispatch(target, env, denied, 0)).rejects.toThrow(/HTTP 401 Bad credentials/);
    expect(denied).toHaveBeenCalledOnce();
  });

  it('run: gagal → kabari Telegram bila dikonfigurasi, lalu lempar galat', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('telegram') ? new Response('{}') : new Response('nope', { status: 403 }),
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      run(
        ALL,
        Date.parse('2026-11-13T02:20:00Z'),
        {
          ...env,
          TELEGRAM_BOT_TOKEN: 'b',
          TELEGRAM_CHAT_ID: 'c',
        },
        fetchFn,
      ),
    ).rejects.toThrow(/HTTP 403/);
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      expect.stringContaining('api.github.com'),
      'https://api.telegram.org/botb/sendMessage',
    ]);
    errors.mockRestore();
  });

  it('run: jam 09 UTC hari kerja mengirim dua dispatch; satu gagal tetap mengirim yang lain', async () => {
    const ok = vi.fn(async () => new Response(null, { status: 204 }));
    const sent = await run(ALL, Date.parse('2026-11-13T09:20:00Z'), env, ok);
    expect(sent.map((t) => t.workflow)).toEqual(['scrape-retail.yml', 'scrape-macro.yml']);
    expect(ok).toHaveBeenCalledTimes(2);

    const macroDown = vi.fn(async (url: string) =>
      url.includes('scrape-macro')
        ? new Response('nope', { status: 403 })
        : new Response(null, { status: 204 }),
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(run(ALL, Date.parse('2026-11-13T09:20:00Z'), env, macroDown)).rejects.toThrow(
      /scrape-macro/,
    );
    expect(macroDown).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });
});
