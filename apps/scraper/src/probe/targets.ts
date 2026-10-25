import { addDaysIso } from '@gold/schema';
import {
  checkFrankfurter,
  checkJisdor,
  checkLogamMulia,
  checkPegadaian,
  checkUbsLifestyle,
  checkWorldBank,
  checkXaus,
  findPinkSheetUrl,
  type CheckResult,
} from './checks';
import { cookieHeader, request, sleep, type HttpResponse } from './http';

// Urutan fetch per sumber untuk probe (P0-11). Jeda antar request mengikuti NFR-12.

/** Sumber yang bisa di-probe: semua modul scraper + Frankfurter (fallback JISDOR & backfill ECB). */
export const PROBE_TARGETS = [
  'ubslifestyle',
  'pegadaian',
  'logammulia',
  'xaus',
  'jisdor',
  'worldbank',
  'frankfurter',
] as const;
export type ProbeTarget = (typeof PROBE_TARGETS)[number];

export interface RawFile {
  name: string;
  body: Buffer;
  meta: Omit<HttpResponse, 'body' | 'setCookies'>;
}

export interface ProbeContext {
  userAgent: string;
  today: string;
  /** Jeda antar request; 0 di uji. */
  pauseMs: number;
}

export interface TargetOutput {
  raws: RawFile[];
  result: CheckResult;
}

function recorder(ctx: ProbeContext, raws: RawFile[]) {
  let first = true;
  const fetchAs = async (
    name: string,
    url: string,
    init: Partial<Parameters<typeof request>[1]> = {},
  ) => {
    if (!first) await sleep(ctx.pauseMs);
    first = false;
    const res = await request(url, { userAgent: ctx.userAgent, ...init });
    const { status, contentType, ms, body } = res;
    const meta = { url: res.url, status, contentType, ms };
    raws.push({ name, body, meta });
    return res;
  };
  return fetchAs;
}

const ensureOk = (res: HttpResponse) => {
  if (res.status !== 200) throw new Error(`HTTP ${res.status} dari ${res.url}`);
  return res;
};

export async function probeUbsLifestyle(ctx: ProbeContext): Promise<TargetOutput> {
  const raws: RawFile[] = [];
  const get = recorder(ctx, raws);
  const page = ensureOk(await get('page.html', 'https://ubslifestyle.com/harga-buyback-hari-ini/'));
  const chart = ensureOk(
    await get('chart.json', 'https://ubslifestyle.com/wp-admin/admin-ajax.php', {
      method: 'POST',
      body: new URLSearchParams({
        action: 'get_harga_emas_hari_ini',
        path: 'ajax/chart_interval/GOLD/7',
      }),
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    }),
  );
  return { raws, result: checkUbsLifestyle(page.body, chart.body, ctx.today) };
}

export async function probePegadaian(ctx: ProbeContext): Promise<TargetOutput> {
  const raws: RawFile[] = [];
  const get = recorder(ctx, raws);
  const res = ensureOk(
    await get('prices-table.json', 'https://pegadaian.co.id/gold/prices/table', {
      headers: { Accept: 'application/json' },
    }),
  );
  return { raws, result: checkPegadaian(res.body, ctx.today) };
}

export async function probeXaus(ctx: ProbeContext): Promise<TargetOutput> {
  const raws: RawFile[] = [];
  const get = recorder(ctx, raws);
  const history = ensureOk(await get('history.json', 'https://xaus.com/api/v1/history'));
  const spot = ensureOk(await get('spot.json', 'https://xaus.com/api/v1/spot?compact=1'));
  return { raws, result: checkXaus(history.body, spot.body, ctx.today) };
}

export async function probeFrankfurter(ctx: ProbeContext): Promise<TargetOutput> {
  const raws: RawFile[] = [];
  const get = recorder(ctx, raws);
  const from = addDaysIso(ctx.today, -14);
  const res = ensureOk(
    await get(
      'rates.csv',
      `https://api.frankfurter.dev/v2/rates.csv?base=EUR&quotes=IDR,USD&from=${from}&to=${ctx.today}&providers=ecb`,
    ),
  );
  return { raws, result: checkFrankfurter(res.body, ctx.today) };
}

const JISDOR_URL = 'https://www.bi.go.id/id/statistik/informasi-kurs/jisdor/default.aspx';

/** Semua `input[type=hidden]` di dalam `<form>` pertama (ViewState ASP.NET, dsb.). */
export function hiddenFields(html: string): Map<string, string> {
  const form = html.slice(html.indexOf('<form'), html.indexOf('</form>'));
  const fields = new Map<string, string>();
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]+)"/.exec(m[0])?.[1];
    const value = /value="([^"]*)"/.exec(m[0])?.[1] ?? '';
    if (name) {
      fields.set(
        name,
        value
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&'),
      );
    }
  }
  return fields;
}

/**
 * Nama kontrol ASP.NET lengkap dari akhirannya (ID web part SharePoint bisa berubah).
 * Menangkap `name="…$TextBoxFrom"` maupun argumen `__doPostBack(&#39;…$ButtonExport&#39;)`.
 */
export function fieldBySuffix(html: string, suffix: string): string | null {
  return new RegExp(`(ctl00[A-Za-z0-9_$]*\\$${suffix})(?![A-Za-z0-9_])`).exec(html)?.[1] ?? null;
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export async function probeJisdor(ctx: ProbeContext): Promise<TargetOutput> {
  const raws: RawFile[] = [];
  const get = recorder(ctx, raws);
  const page = ensureOk(await get('page.html', JISDOR_URL));
  const html = page.body.toString('utf8');

  // Ekspor rentang pendek untuk membuktikan jalur backfill (postback ButtonExport) dari runner.
  let exportXlsx: Buffer | null = null;
  const exportTarget = fieldBySuffix(html, 'ButtonExport');
  if (exportTarget) {
    const form = new URLSearchParams([...hiddenFields(html)]);
    const from = ddmmyyyy(addDaysIso(ctx.today, -30));
    const to = ddmmyyyy(ctx.today);
    form.set('__EVENTTARGET', exportTarget);
    form.set('__EVENTARGUMENT', '');
    for (const [suffix, value] of [
      ['TextBoxFrom', from],
      ['TextBoxDateTo', to],
      ['HiddenFieldDateFrom', from],
      ['HiddenFieldDateTo', to],
    ] as const) {
      const name = fieldBySuffix(html, suffix);
      if (name) form.set(name, value);
    }
    const exp = await get('export.xlsx', JISDOR_URL, {
      method: 'POST',
      body: form,
      headers: { Cookie: cookieHeader(page.setCookies), Referer: JISDOR_URL },
    });
    if (exp.status === 200 && /sheet|excel|octet/.test(exp.contentType)) exportXlsx = exp.body;
  }
  const result = checkJisdor(page.body, exportXlsx, ctx.today);
  if (exportTarget && !exportXlsx) {
    result.checks.push({
      name: 'ekspor XLSX diterima',
      ok: false,
      detail: raws.at(-1)?.meta.contentType ?? '',
    });
  }
  return { raws, result };
}

export async function probeWorldBank(ctx: ProbeContext): Promise<TargetOutput> {
  const raws: RawFile[] = [];
  const get = recorder(ctx, raws);
  const page = ensureOk(
    await get('page.html', 'https://www.worldbank.org/en/research/commodity-markets'),
  );
  const url = findPinkSheetUrl(page.body.toString('utf8'));
  const xlsx = url ? ensureOk(await get('monthly.xlsx', url)).body : null;
  return { raws, result: checkWorldBank(page.body, xlsx, ctx.today) };
}

export async function probeLogamMulia(ctx: ProbeContext): Promise<TargetOutput> {
  const raws: RawFile[] = [];
  // Playwright dimuat hanya untuk sumber ini (job matrix lain tidak memasang Chromium).
  const { chromium } = await import('playwright-extra');
  const { default: stealth } = await import('puppeteer-extra-plugin-stealth');
  chromium.use(stealth());
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
    const started = Date.now();
    const res = await page.goto('https://www.logammulia.com/id', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    const homeStatus = res?.status() ?? 0;
    const homeTitle = await page.title();
    const html = Buffer.from(await page.content());
    raws.push({
      name: 'home.html',
      body: html,
      meta: {
        url: page.url(),
        status: homeStatus,
        contentType: 'text/html',
        ms: Date.now() - started,
      },
    });
    const input = await page.$('input[name="_token"]');
    const token = input ? await input.inputValue() : null;
    const out: { sell?: Buffer; buyback?: Buffer } = {};
    if (token) {
      for (const [key, path] of [
        ['sell', `/data-base-price/gold_eai/sell?_token=${encodeURIComponent(token)}&transition=1`],
        ['buyback', `/data-base-price/gold/buy?_token=${encodeURIComponent(token)}`],
      ] as const) {
        await page.waitForTimeout(ctx.pauseMs);
        const t = Date.now();
        const r = await page.evaluate(async (u) => {
          const x = await fetch(u, {
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          });
          return {
            status: x.status,
            contentType: x.headers.get('content-type') ?? '',
            body: await x.text(),
          };
        }, path);
        out[key] = Buffer.from(r.body);
        raws.push({
          name: `${key}.json`,
          body: out[key]!,
          meta: {
            url: path.split('?')[0]!,
            status: r.status,
            contentType: r.contentType,
            ms: Date.now() - t,
          },
        });
      }
    }
    return { raws, result: checkLogamMulia({ homeStatus, homeTitle, token, ...out }, ctx.today) };
  } finally {
    await browser.close();
  }
}

export const PROBES: Record<ProbeTarget, (ctx: ProbeContext) => Promise<TargetOutput>> = {
  ubslifestyle: probeUbsLifestyle,
  pegadaian: probePegadaian,
  logammulia: probeLogamMulia,
  xaus: probeXaus,
  jisdor: probeJisdor,
  worldbank: probeWorldBank,
  frankfurter: probeFrankfurter,
};
