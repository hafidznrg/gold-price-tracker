/**
 * Prototipe P1-06 (D-26) — sesi Playwright + stealth ke logammulia.com versi baru.
 * Menyimpan HTML, teks tampilan, dan daftar request API ke folder keluaran agar bisa
 * dijadikan fixture. Bukan modul produksi (lihat `src/sources/logammulia.ts`).
 *
 * Jalankan secukupnya (1–2 kali) agar tidak memicu pemblokiran:
 *   pnpm --filter scraper exec tsx scripts/prototype-logammulia.ts --out <folder-absolut>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    url: { type: 'string', default: 'https://logammulia.com/harga-emas' },
    headed: { type: 'boolean', default: false },
  },
});
if (!values.out || !path.isAbsolute(values.out)) {
  console.error('--out wajib path absolut');
  process.exit(2);
}
const out = values.out;
await mkdir(out, { recursive: true });

const log: Record<string, unknown> = { started_at: new Date().toISOString(), url: values.url };
const save = (name: string, body: string) => writeFile(path.join(out, name), body);

chromium.use(stealth());
const browser = await chromium.launch({ headless: !values.headed });
const page = await browser.newPage({ locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
const requests: { method: string; url: string; status?: number }[] = [];
page.on('response', (r) => {
  if (['xhr', 'fetch'].includes(r.request().resourceType())) {
    requests.push({ method: r.request().method(), url: r.url(), status: r.status() });
  }
});

try {
  const t0 = Date.now();
  const res = await page.goto(values.url, { waitUntil: 'networkidle', timeout: 60_000 });
  log.status = res?.status();
  log.ms = Date.now() - t0;
  log.final_url = page.url();
  log.title = await page.title();
  await page.waitForSelector('text=Terakhir diperbarui', { timeout: 30_000 }).catch(() => {});
  await save('page.html', await page.content());
  await save('page.txt', await page.innerText('body'));

  // Data yang sudah didekripsi aplikasi sendiri: state Pinia dan seri grafik ApexCharts.
  // Objek global halaman (Nuxt, ApexCharts) tidak bertipe; skrip prototipe sekali pakai.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const dumpState = () =>
    page.evaluate(() => {
      const w = globalThis as unknown as Record<string, any>;
      const app = w.document?.querySelector('#__nuxt')?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia?.state?.value ?? null;
      const charts = (w.Apex?._chartInstances ?? []).map((c: any) => ({
        id: c.id,
        series: c.chart?.w?.config?.series,
        categories: c.chart?.w?.config?.xaxis?.categories,
      }));
      return JSON.stringify({ pinia, charts }, null, 1);
    });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  await save('state-beli.json', await dumpState());
  await page.waitForTimeout(3_000);
  // Popup (v-overlay) menutupi halaman setelah load; tab grafik cukup menerima event click.
  await page.keyboard.press('Escape');
  await page.locator('[role="tab"]', { hasText: 'Harga Jual' }).first().dispatchEvent('click');
  await page.waitForTimeout(5_000);
  await save('state-jual.json', await dumpState());
} catch (err) {
  log.error = err instanceof Error ? err.message : String(err);
  process.exitCode = 1;
} finally {
  log.requests = requests;
  log.finished_at = new Date().toISOString();
  await page.screenshot({ path: path.join(out, 'page.png'), fullPage: true }).catch(() => {});
  await save('log.json', JSON.stringify(log, null, 2) + '\n');
  await browser.close();
}
