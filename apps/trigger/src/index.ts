// D-45/D-46 — pemicu utama di Cloudflare Workers (Cron Triggers, paket Free). Cron GitHub di repo
// ini rutin terlambat 4,5–10 jam (8–11 Nov 2026), jadi Worker ini memanggil `workflow_dispatch`
// tepat waktu dengan input `schedule` = kunci di SCHEDULES / WATCHDOG_SCHEDULES. Workflow
// memperlakukan run itu persis seperti run terjadwal cron tersebut (slot, jendela, tanggal
// sasaran). Cron GitHub tinggal cadangan berslot retry.

export interface Env {
  /** Fine-grained PAT, hanya repo ini, izin Actions: Read and write (`wrangler secret put`). */
  GITHUB_TOKEN: string;
  /** `owner/name` (wrangler.toml `[vars]`). */
  GITHUB_REPO: string;
  GITHUB_REF?: string;
  /** Opsional: kabari Telegram bila dispatch gagal. */
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export interface Dispatch {
  /** Nama file di `.github/workflows/`. */
  workflow: string;
  /** Kunci slot; harus terdaftar di SCHEDULES / WATCHDOG_SCHEDULES (apps/scraper). */
  schedule: string;
}

/** Dispatch dalam ROUTES; `weekdaysOnly` = hanya Senin–Jumat (hari UTC dari scheduledTime). */
export interface Route extends Dispatch {
  weekdaysOnly?: boolean;
}

const d = (workflow: string, schedule: string, weekdaysOnly = false): Route =>
  weekdaysOnly ? { workflow, schedule, weekdaysOnly } : { workflow, schedule };

/**
 * Cron Worker (harus sama dengan `crons` di wrangler.toml) → jam UTC → daftar dispatch (D-46, D-67).
 * Worker memegang semua slot Cloudflare (menit :20); cron GitHub tinggal cadangan berslot retry.
 * Satu Cron Trigger boleh memuat banyak jam selama menitnya sama, jadi cukup satu dari batas 5 per
 * akun paket Free. Jam 09 UTC memicu dua workflow (ritel, dan makro hanya Senin–Jumat).
 */
export const ROUTES: Record<string, Record<number, Route[]>> = {
  '20 1,2,4,6,9,10,12,16 * * *': {
    1: [d('scrape-retail.yml', '20 1 * * *')], // 08.20 WIB percobaan awal Logam Mulia
    2: [d('scrape-retail.yml', '20 2 * * *')], // 09.20 WIB retry day
    4: [d('scrape-retail.yml', '20 4 * * *')], // 11.20 WIB retry day + midday
    6: [d('scrape-retail.yml', '20 6 * * *')], // 13.20 WIB retry day + midday, UBS/Lotus awal
    9: [
      d('scrape-retail.yml', '20 9 * * *'), // 16.20 WIB retry day + midday + afternoon
      d('scrape-macro.yml', '20 9 * * 1-5', true), // 16.20 WIB makro, Senin–Jumat
    ],
    10: [d('watchdog.yml', '20 10 * * *')], // 17.20 WIB watchdog day + midday
    12: [d('scrape-retail.yml', '20 12 * * *')], // 19.20 WIB sapuan semua sumber
    16: [d('watchdog.yml', '20 16 * * *')], // 23.20 WIB watchdog semua sumber
  },
};

/** Dispatch yang berlaku untuk cron dan waktu terjadwal ini (kosong bila tidak terpetakan). */
export function route(cron: string, scheduledTime: number): Dispatch[] {
  const at = new Date(scheduledTime);
  const day = at.getUTCDay();
  const weekday = day >= 1 && day <= 5;
  return (ROUTES[cron]?.[at.getUTCHours()] ?? [])
    .filter((r) => weekday || !r.weekdaysOnly)
    .map(({ workflow, schedule }) => ({ workflow, schedule }));
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST workflow_dispatch; coba ulang 3× untuk 5xx/429/galat jaringan, langsung gagal untuk 4xx. */
export async function dispatch(
  target: Dispatch,
  env: Env,
  fetchFn: FetchFn = fetch,
  delayMs = 5_000,
): Promise<void> {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${target.workflow}/dispatches`;
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.GITHUB_TOKEN}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'gold-price-trigger',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify({
          ref: env.GITHUB_REF || 'main',
          inputs: { schedule: target.schedule },
        }),
      });
      if (res.ok) return;
      last = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      last = (err as Error).message;
    }
    if (attempt < 3) await sleep(delayMs * attempt);
  }
  throw new Error(`dispatch ${target.workflow} (cron ${target.schedule}) gagal: ${last}`);
}

async function telegram(env: Env, text: string, fetchFn: FetchFn): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
}

export async function run(
  cron: string,
  scheduledTime: number,
  env: Env,
  fetchFn: FetchFn = fetch,
): Promise<Dispatch[]> {
  const targets = route(cron, scheduledTime);
  if (targets.length === 0) {
    console.log(`cron "${cron}" jam ${new Date(scheduledTime).toISOString()} tidak dipetakan`);
    return [];
  }
  const results = await Promise.allSettled(targets.map((t) => dispatch(t, env, fetchFn)));
  const failures: Error[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`dispatch ${targets[i]!.workflow} (cron ${targets[i]!.schedule})`);
    } else {
      failures.push(r.reason as Error);
    }
  });
  if (failures.length > 0) {
    const msg = `⚠️ pemicu Cloudflare: ${failures.map((f) => f.message).join('; ')}. Cron GitHub cadangan tetap jalan (terlambat).`;
    console.error(msg);
    await telegram(env, msg, fetchFn).catch(() => undefined);
    throw failures[0];
  }
  return targets;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(controller.cron, controller.scheduledTime, env));
  },
};
