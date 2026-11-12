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

const d = (workflow: string, schedule: string): Dispatch => ({ workflow, schedule });

/**
 * Cron Worker (harus sama dengan `crons` di wrangler.toml) → jam UTC → dispatch (D-46). Worker
 * memegang semua slot utama; cron GitHub tinggal cadangan berslot retry. Satu Cron Trigger boleh
 * memuat banyak jam selama menitnya sama, jadi cukup dua dari batas 5 per akun paket Free.
 */
export const ROUTES: Record<string, Record<number, Dispatch>> = {
  '5 2,5,6,12,15,16 * * *': {
    2: d('scrape-retail.yml', '5 2 * * *'), // 09.05 WIB primary siang
    5: d('scrape-retail.yml', '5 5 * * *'), // 12.05 WIB retry siang
    6: d('watchdog.yml', '5 6 * * *'), // 13.05 WIB watchdog ritel siang
    12: d('scrape-retail.yml', '5 12 * * *'), // 19.05 WIB primary malam
    15: d('scrape-retail.yml', '5 15 * * *'), // 22.05 WIB retry malam
    16: d('watchdog.yml', '5 16 * * *'), // 23.05 WIB watchdog semua sumber
  },
  // Hari-minggu di Cloudflare: 1 = Minggu (GitHub: 1 = Senin). Nama hari menghindari salah tafsir.
  '40 9 * * MON-FRI': {
    9: d('scrape-macro.yml', '40 9 * * 1-5'), // 16.40 WIB makro
  },
};

export function route(cron: string, scheduledTime: number): Dispatch | null {
  return ROUTES[cron]?.[new Date(scheduledTime).getUTCHours()] ?? null;
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
): Promise<Dispatch | null> {
  const target = route(cron, scheduledTime);
  if (!target) {
    console.log(`cron "${cron}" jam ${new Date(scheduledTime).toISOString()} tidak dipetakan`);
    return null;
  }
  try {
    await dispatch(target, env, fetchFn);
    console.log(`dispatch ${target.workflow} (cron ${target.schedule})`);
    return target;
  } catch (err) {
    const msg = `⚠️ pemicu Cloudflare: ${(err as Error).message}. Cron GitHub cadangan tetap jalan (terlambat).`;
    console.error(msg);
    await telegram(env, msg, fetchFn).catch(() => undefined);
    throw err;
  }
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
