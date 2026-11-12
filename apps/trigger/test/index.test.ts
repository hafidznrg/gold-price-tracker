import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { dispatch, route, ROUTES, run, type Env } from '../src/index';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p: string) => readFile(path.join(ROOT, p), 'utf8');
/** Cron dari baris `- cron: '…'` di YAML workflow. */
const ymlCrons = async (file: string) =>
  [...(await read(`.github/workflows/${file}`)).matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);

const env: Env = { GITHUB_TOKEN: 't0k', GITHUB_REPO: 'o/r' };

describe('ROUTES', () => {
  it('sama dengan crons di wrangler.toml dan ≤ 5 (paket Free)', async () => {
    const toml = await read('apps/trigger/wrangler.toml');
    const crons = JSON.parse(/^crons = (\[.*\])$/m.exec(toml)![1]!) as string[];
    expect(crons.sort()).toEqual(Object.keys(ROUTES).sort());
    expect(crons.length).toBeLessThanOrEqual(5);
  });

  /** Hari-minggu Cloudflare → padanannya di cron GitHub (0/7 = Minggu, 1 = Senin). */
  const GITHUB_DOW: Record<string, string> = { '*': '*', 'MON-FRI': '1-5' };

  it('setiap jam di cron Worker terpetakan, dan cron tiruan terdaftar di workflow-nya', async () => {
    for (const [cron, byHour] of Object.entries(ROUTES)) {
      const [minute, hours] = cron.split(' ');
      expect(Object.keys(byHour).sort()).toEqual(hours!.split(',').sort());
      for (const target of Object.values(byHour)) {
        expect(await ymlCrons(target.workflow)).toContain(target.schedule);
        // Menit dan hari sama dengan cron yang ditiru: hanya jam yang dikelompokkan.
        expect(target.schedule.split(' ')[0]).toBe(minute);
        expect(target.schedule.split(' ')[4]).toBe(GITHUB_DOW[cron.split(' ')[4]!]);
      }
    }
  });

  it('hari-minggu Worker memakai nama hari (Cloudflare: 1 = Minggu, bukan Senin)', () => {
    for (const cron of Object.keys(ROUTES)) expect(cron.split(' ')[4]).toMatch(/^(\*|[A-Z-]+)$/);
  });

  it('route memilih menurut jam UTC scheduledTime', () => {
    expect(route('25 3,6 * * *', Date.parse('2026-11-12T03:25:00Z'))).toEqual({
      workflow: 'scrape-retail.yml',
      schedule: '25 3 * * *',
    });
    expect(route('50 9,16 * * *', Date.parse('2026-11-12T16:50:00Z'))?.schedule).toBe(
      '50 16 * * *',
    );
    expect(route('25 3,6 * * *', Date.parse('2026-11-12T04:25:00Z'))).toBeNull();
    expect(route('* * * * *', Date.now())).toBeNull();
  });
});

describe('dispatch', () => {
  const target = { workflow: 'scrape-retail.yml', schedule: '25 3 * * *' };

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
      inputs: { schedule: '25 3 * * *' },
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
        '25 3,6 * * *',
        Date.parse('2026-11-12T03:25:00Z'),
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
});
