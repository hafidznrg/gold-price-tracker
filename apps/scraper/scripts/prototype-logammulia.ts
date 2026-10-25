/**
 * Prototipe P0-09 — sesi Playwright + stealth ke logammulia.com sesuai TECH-SPEC §5.3.
 * Bukan modul produksi: menyimpan respons mentah dan diagnostik ke folder keluaran
 * agar bisa dijadikan fixture. Modul `src/sources/logammulia.ts` dibuat di P1-06.
 *
 * Jalankan secukupnya (1–2 kali) agar tidak memicu pemblokiran:
 *   pnpm --filter scraper exec tsx scripts/prototype-logammulia.ts --out <folder-absolut>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

const BASE = 'https://www.logammulia.com';
const ENDPOINTS = {
  sell: '/data-base-price/gold_eai/sell?_token={token}&transition=1',
  buyback: '/data-base-price/gold/buy?_token={token}',
} as const;

const { values } = parseArgs({
  options: { out: { type: 'string' }, headed: { type: 'boolean', default: false } },
});
if (!values.out || !path.isAbsolute(values.out)) {
  console.error('--out wajib path absolut');
  process.exit(2);
}
const out = values.out;
await mkdir(out, { recursive: true });

const log: Record<string, unknown> = { started_at: new Date().toISOString() };
const save = (name: string, body: string) => writeFile(path.join(out, name), body);

chromium.use(stealth());
const browser = await chromium.launch({ headless: !values.headed });
const page = await browser.newPage({ locale: 'id-ID', timezoneId: 'Asia/Jakarta' });

try {
  const t0 = Date.now();
  const res = await page.goto(`${BASE}/id`, { waitUntil: 'networkidle', timeout: 60_000 });
  log.home = {
    status: res?.status(),
    ms: Date.now() - t0,
    url: page.url(),
    title: await page.title(),
  };
  await save('home.html', await page.content());

  const tokenInput = await page.$('input[name="_token"]');
  const token = tokenInput ? await tokenInput.inputValue() : null;
  log.token_found = token !== null;
  log.token_length = token?.length ?? 0;
  if (!token) throw new Error('TOKEN_MISSING');

  for (const [name, template] of Object.entries(ENDPOINTS)) {
    const url = template.replace('{token}', encodeURIComponent(token));
    const t1 = Date.now();
    const result = await page.evaluate(async (u) => {
      const r = await fetch(u, {
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      return { status: r.status, contentType: r.headers.get('content-type'), body: await r.text() };
    }, url);
    log[name] = {
      status: result.status,
      content_type: result.contentType,
      bytes: result.body.length,
      ms: Date.now() - t1,
    };
    await save(`${name}.raw`, result.body);
    await page.waitForTimeout(5_000);
  }
} catch (err) {
  log.error = err instanceof Error ? err.message : String(err);
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  await save('failure.html', await page.content().catch(() => ''));
  process.exitCode = 1;
} finally {
  log.finished_at = new Date().toISOString();
  await save('log.json', JSON.stringify(log, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(log, null, 2));
}
