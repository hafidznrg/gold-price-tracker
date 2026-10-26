import {
  canonicalWeight,
  isIsoDate,
  jakartaDate,
  parseRupiah,
  parseWeight,
  utcIso,
  type PriceRow,
} from '@gold/schema';
import { ScrapeError } from '../pipeline/errors';
import type { ParsedRow, ParseResult, RawPayload, SourceScraper } from './types';

// TECH-SPEC §5.3 — Logam Mulia versi baru (D-26). API `api.logammulia.com` terenkripsi dan Akamai
// menolak browser otomatis biasa, jadi halaman dibuka dengan Playwright + stealth dan yang dibaca
// hanya hasil tampilan aplikasi: teks halaman (tabel Emas Batangan) dan seri grafik ApexCharts 1 g.

export const PAGE_URL = 'https://logammulia.com/harga-emas';
/** Butik default halaman; harga berbeda per butik, jadi butik lain = PARSE_ERROR. */
export const BOUTIQUE = 'Butik Emas ANTAM Jakarta Ekspedisi';
/** `id` grafik ApexCharts: Harga Beli (= jual Antam) dan Harga Jual (= buyback). */
export const CHART_SELL = 'chart-harga-emas';
export const CHART_BUYBACK = 'chart-harga-emas-jual';

export interface ChartPoint {
  /** epoch ms, waktu harga ditetapkan */
  x: number;
  y: number;
}

/** Isi raw snapshot: teks tampilan `<body>` dan kedua seri grafik apa adanya. */
export interface LogamMuliaRaw {
  url: string;
  text: string;
  chart: { sell: ChartPoint[]; buyback: ChartPoint[] };
}

const MONTHS: Record<string, string> = {
  januari: '01',
  februari: '02',
  maret: '03',
  april: '04',
  mei: '05',
  juni: '06',
  juli: '07',
  agustus: '08',
  september: '09',
  oktober: '10',
  november: '11',
  desember: '12',
};

const parseError = (message: string) => new ScrapeError('PARSE_ERROR', message);

/** `Terakhir diperbarui: Senin, 26 Oktober 2026 | 07:58 WIB` → tanggal + ISO +07:00. */
export function parseUpdated(text: string): { date: string; at: string } {
  const m =
    /Terakhir diperbarui:\s*\S+,\s*(\d{1,2})\s+(\p{L}+)\s+(\d{4})\s*\|\s*(\d{2}):(\d{2})\s*WIB/u.exec(
      text,
    );
  const month = m && MONTHS[m[2]!.toLowerCase()];
  const date = m && month ? `${m[3]}-${month}-${m[1]!.padStart(2, '0')}` : null;
  if (!m || !date || !isIsoDate(date)) throw parseError('"Terakhir diperbarui" tidak terbaca');
  return { date, at: `${date}T${m[4]}:${m[5]}:00+07:00` };
}

/** Tabel Emas Batangan: baris `0.5 gr` / Harga Dasar / Harga +PPh. Yang diambil Harga Dasar (D-24). */
export function parseTable(text: string): { weight_g: number; base: number }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const start = lines.indexOf('Emas Batangan');
  const end = lines.indexOf('Perak Batangan', start);
  if (start === -1 || end === -1) throw parseError('bagian "Emas Batangan" tidak ada');
  const section = lines.slice(start, end);
  if (!section.includes('Harga Dasar')) throw parseError('kolom "Harga Dasar" tidak ada');

  const out: { weight_g: number; base: number }[] = [];
  for (let i = 0; i < section.length; i++) {
    if (!/^\d+([.,]\d+)?\s*gr$/i.test(section[i]!)) continue;
    const label = section[i]!;
    try {
      out.push({ weight_g: parseWeight(label), base: parseRupiah(section[i + 1] ?? '') });
    } catch (err) {
      throw parseError(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
    i += 2; // lewati Harga Dasar dan Harga +PPh
  }
  return out;
}

function readRaw(body: string): LogamMuliaRaw {
  let raw: LogamMuliaRaw;
  try {
    raw = JSON.parse(body);
  } catch {
    throw parseError(`raw bukan JSON: ${body.slice(0, 80)}`);
  }
  if (typeof raw?.text !== 'string') throw parseError('raw tanpa teks halaman');
  const ok = (s: unknown) =>
    Array.isArray(s) && s.every((p) => Number.isFinite(p?.x) && Number.isSafeInteger(p?.y));
  if (!ok(raw.chart?.sell) || !ok(raw.chart?.buyback)) throw parseError('seri grafik tidak valid');
  return raw;
}

/** Titik terakhir pada tanggal Jakarta `date` (bisa lebih dari satu titik per hari). */
const lastOn = (points: ChartPoint[], date: string) =>
  points
    .filter((p) => jakartaDate(p.x) === date)
    .sort((a, b) => a.x - b.x)
    .at(-1);

export function parse(payload: RawPayload): ParseResult<PriceRow> {
  const raw = readRaw(payload.body);
  if (!raw.text.includes(BOUTIQUE)) throw parseError(`butik bukan "${BOUTIQUE}"`);
  const updated = parseUpdated(raw.text);
  const table = parseTable(raw.text);

  const sellPoint = lastOn(raw.chart.sell, updated.date);
  const buybackPoint = lastOn(raw.chart.buyback, updated.date);
  const base1g = table.find((r) => r.weight_g === 1)?.base;
  // Seperti UBS (D-19): grafik dan tabel dimuat terpisah; bila titik 1 g hari ini ≠ tabel,
  // salah satunya belum segar dan buyback-nya tidak bisa dipasangkan dengan aman.
  const stale = !sellPoint
    ? `grafik tanpa titik ${updated.date}`
    : sellPoint.y !== base1g
      ? `grafik 1 g ${sellPoint.y} ≠ tabel ${base1g ?? '?'}`
      : null;

  const rows: ParsedRow<PriceRow>[] = table.map(({ weight_g, base }) => ({
    date: updated.date,
    source: 'logammulia',
    brand: 'antam',
    product: 'gold_bar',
    variant: '',
    weight_g: Number(canonicalWeight(weight_g)),
    location: 'jakarta',
    sell_price: base,
    buyback_price: weight_g === 1 && !stale ? (buybackPoint?.y ?? null) : null,
    source_updated_at: updated.at,
  }));

  return { rows, dataDate: updated.date, sourceUpdatedAt: updated.at, stale };
}

interface ApexWindow {
  Apex?: {
    _chartInstances?: {
      id: string;
      chart: { w: { config: { series: { data: ChartPoint[] }[] } } };
    }[];
  };
}

export const logammulia: SourceScraper<PriceRow> = {
  id: 'logammulia',
  kind: 'prices',
  parserVersion: 'logammulia@1.0.0',
  async fetchRaw(ctx) {
    // Impor dinamis: Playwright hanya dimuat oleh sumber browser (matrix.browser di scrape-retail).
    const { chromium } = await import('playwright-extra');
    const { default: stealth } = await import('puppeteer-extra-plugin-stealth');
    chromium.use(stealth());
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ locale: 'id-ID', timezoneId: 'Asia/Jakarta' });
      const fetchedAt = utcIso();
      const res = await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
      const status = res?.status() ?? 0;
      if (status !== 200) {
        const title = await page.title().catch(() => '');
        const head = (await page.content().catch(() => '')).slice(0, 4096);
        if (/Maintenance/i.test(title)) {
          throw new ScrapeError('FETCH_HTTP', `MAINTENANCE: HTTP ${status} dari ${PAGE_URL}`);
        }
        if (/Access Denied|Reference #/i.test(head) || status === 403) {
          throw new ScrapeError(
            'BLOCKED',
            `HTTP ${status} (Akamai Access Denied) dari ${PAGE_URL}`,
          );
        }
        throw new ScrapeError('FETCH_HTTP', `HTTP ${status} dari ${PAGE_URL}`);
      }
      await page.getByText('Terakhir diperbarui').first().waitFor({ timeout: 30_000 });
      await page.getByText('Harga Dasar').first().waitFor({ timeout: 30_000 });

      // Popup (v-overlay) menutupi halaman setelah load; tab grafik cukup menerima event click.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(Math.min(ctx.pauseMs ?? 3_000, 3_000));
      await page.locator('[role="tab"]', { hasText: 'Harga Jual' }).first().dispatchEvent('click');
      const seriesOf = (id: string) =>
        page.evaluate((chartId) => {
          const inst = (globalThis as ApexWindow).Apex?._chartInstances?.find(
            (c) => c.id === chartId,
          );
          return inst?.chart.w.config.series[0]?.data ?? null;
        }, id);
      await page.waitForFunction(
        (chartId) =>
          ((globalThis as ApexWindow).Apex?._chartInstances ?? []).some(
            (c) => c.id === chartId && (c.chart.w.config.series[0]?.data.length ?? 0) > 0,
          ),
        CHART_BUYBACK,
        { timeout: 30_000 },
      );

      const raw: LogamMuliaRaw = {
        url: page.url(),
        text: await page.innerText('body'),
        chart: {
          sell: (await seriesOf(CHART_SELL)) ?? [],
          buyback: (await seriesOf(CHART_BUYBACK)) ?? [],
        },
      };
      return { body: JSON.stringify(raw), contentType: 'application/json', fetchedAt };
    } finally {
      await browser.close();
    }
  },
  parse,
};
