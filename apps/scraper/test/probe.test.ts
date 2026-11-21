import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  checkFrankfurter,
  checkGaleri24,
  checkHrtaGold,
  checkLotusArchi,
  checkJisdor,
  checkLogamMulia,
  checkPegadaian,
  checkUbsLifestyle,
  checkWorldBank,
  checkXaus,
  parseTanggalIndonesia,
  type CheckResult,
} from '../src/probe/checks';
import { fieldBySuffix, hiddenFields } from '../src/probe/targets';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (f: string) => readFileSync(path.join(DIR, f));
const gz = (f: string) => gunzipSync(read(f));
const TODAY = '2026-10-25'; // tanggal pengambilan fixture

const failed = (r: CheckResult) => r.checks.filter((c) => !c.ok).map((c) => c.name);

describe('probe checks dengan fixture riset', () => {
  it('UBS Lifestyle lolos; data_date dari grafik (D-19)', () => {
    const r = checkUbsLifestyle(
      gz('ubslifestyle/page-2026-10-25-sunday.html.gz'),
      read('ubslifestyle/chart-interval-1095-2026-10-25.json'),
      TODAY,
    );
    expect(failed(r)).toEqual([]);
    expect(r.dataDate).toBe('2026-10-24');
  });

  it('UBS Lifestyle: grafik kosong gagal', () => {
    const r = checkUbsLifestyle(
      gz('ubslifestyle/page-2026-10-25-sunday.html.gz'),
      read('ubslifestyle/chart-range-empty.json'),
      TODAY,
    );
    expect(failed(r)).toContain('endpoint grafik: JSON [{data: [[ts, a, …]]}]');
  });

  it('Pegadaian lolos', () => {
    const r = checkPegadaian(read('pegadaian/prices-table-2026-10-25-sunday.json'), TODAY);
    expect(failed(r)).toEqual([]);
    expect(r.dataDate).toBe('2026-10-24');
  });

  it('Pegadaian sintetis: V-04 Galeri 24 dan tanggal campur terdeteksi', () => {
    const r = checkPegadaian(read('pegadaian/prices-table-edge-synthetic.json'), TODAY);
    expect(failed(r)).toEqual(['galeri24 ≥ 5 gramasi (V-04)', 'tglBerlaku sama untuk semua brand']);
  });

  it('Pegadaian: data basi (> 3 hari) gagal', () => {
    const r = checkPegadaian(read('pegadaian/prices-table-2026-10-25-sunday.json'), '2026-10-30');
    expect(failed(r)).toEqual(['tglBerlaku ≤ 3 hari']);
  });

  it('Logam Mulia: halaman maintenance gagal tanpa token', () => {
    const r = checkLogamMulia({ homeStatus: 503, homeTitle: 'Maintenance', token: null }, TODAY);
    expect(failed(r)).toEqual(['bukan halaman maintenance', 'token CSRF ada']);
  });

  it('Logam Mulia: dua array histori lolos', () => {
    const ts = Date.UTC(2026, 9, 24, 2, 0); // 09.00 WIB
    const r = checkLogamMulia(
      {
        homeStatus: 200,
        homeTitle: 'Logam Mulia',
        token: 'abc',
        sell: JSON.stringify([[ts, 2579000]]),
        buyback: JSON.stringify([[ts, 2380000]]),
      },
      TODAY,
    );
    expect(failed(r)).toEqual([]);
    expect(r.dataDate).toBe('2026-10-24');
  });

  it('xaus: fixture dipotong 15 titik → hanya aturan ≥ 200 titik yang gagal', () => {
    const r = checkXaus(
      read('xaus/history-last15-2026-10-25.json'),
      read('xaus/spot-compact-2026-10-25.json'),
      TODAY,
    );
    expect(failed(r)).toEqual(['≥ 200 titik']);
    expect(r.dataDate).toBe('2026-10-23');
  });

  it('Frankfurter lolos', () => {
    const r = checkFrankfurter(read('frankfurter/rates-eur-idr-usd-2026-tail.csv'), TODAY);
    expect(failed(r)).toEqual([]);
    expect(r.dataDate).toBe('2026-10-23');
  });

  it('JISDOR halaman + ekspor lolos', () => {
    const r = checkJisdor(
      gz('jisdor/page-2026-10-25.html.gz'),
      read('jisdor/export-trimmed-2013-2026.xlsx'),
      TODAY,
    );
    expect(failed(r)).toEqual([]);
    expect(r.dataDate).toBe('2026-10-23');
  });

  it('World Bank: tautan halaman + XLSX lolos', () => {
    const page =
      '<a href="https://thedocs.worldbank.org/en/doc/74e8-0050012026/related/CMO-Historical-Data-Monthly.xlsx">';
    const r = checkWorldBank(page, read('worldbank/cmo-monthly-trimmed-2026-10.xlsx'), TODAY);
    expect(failed(r)).toEqual([]);
    expect(r.dataDate).toBe('2026-09-01');
  });
});

describe('util probe', () => {
  it('parseTanggalIndonesia', () => {
    expect(parseTanggalIndonesia('23 Oktober 2026')).toBe('2026-10-23');
    expect(parseTanggalIndonesia('1 Mei 2026')).toBe('2026-05-01');
    expect(() => parseTanggalIndonesia('23 October 2026')).toThrow();
    expect(() => parseTanggalIndonesia('31 Februari 2026')).toThrow();
  });

  it('field ASP.NET JISDOR ditemukan lewat akhiran', () => {
    const html = gz('jisdor/page-2026-10-25.html.gz').toString('utf8');
    expect(fieldBySuffix(html, 'ButtonExport')).toMatch(
      /^ctl00\$ctl51\$g_[0-9a-f_]+\$ctl00\$ButtonExport$/,
    );
    expect(fieldBySuffix(html, 'TextBoxFrom')).toMatch(/\$TextBoxFrom$/);
    const hidden = hiddenFields(html);
    expect(hidden.has('__VIEWSTATE')).toBe(true);
    expect(hidden.has('__EVENTVALIDATION')).toBe(true);
  });
});

describe('probe Galeri24 & Lotus Archi (P6-01)', () => {
  const NOW = '2026-11-17';
  const pageData = read('galeri24/page-data-2026-11-17.json');
  const harga = gz('galeri24/harga-emas-2026-11-17.html.gz');

  it('Galeri24 lolos; parameter date diabaikan', () => {
    const r = checkGaleri24(pageData, pageData, harga, NOW);
    expect(failed(r)).toEqual([]);
    expect(r.dataDate).toBe('2026-11-17');
    expect(r.checks.find((x) => x.name.startsWith('parameter date'))?.detail).toMatch(/identik/);
  });

  it('Galeri24 sintetis: tanggal campur gagal; halaman null gagal NUXT', () => {
    const r = checkGaleri24(read('galeri24/page-data-edge-synthetic.json'), null, null, NOW);
    expect(failed(r)).toContain('date sama untuk semua brand wajib');
    expect(failed(r)).toContain('__NUXT_DATA__ ada di /harga-emas');
  });

  it('Lotus Archi lolos dari dua endpoint JSON; tanggal terbaru dari harga-gold', () => {
    const r = checkLotusArchi(
      read('lotusarchi/harga-display-2026-11-17.json'),
      read('lotusarchi/harga-gold-2026-11-17.json'),
      '2026-11-17',
    );
    expect(failed(r)).toEqual([]);
    expect(r.dataDate).toBe('2026-11-17');
    const sync = r.checks.find((x) => x.name.startsWith('harga-display sinkron'));
    expect(sync!.detail).toBe('sinkron 2026-11-17');
    const rows = r.checks.find((x) => x.name.startsWith('≥ 8 baris'));
    expect(Number.parseInt(rows!.detail)).toBe(10);
  });

  it('Lotus Archi: display tertinggal tetap lolos (informatif); JSON rusak gagal', () => {
    const display = read('lotusarchi/harga-display-2026-11-17.json')
      .toString()
      .replace('2397000', '2406000');
    const lag = checkLotusArchi(display, read('lotusarchi/harga-gold-2026-11-17.json'), NOW);
    expect(failed(lag)).not.toContain('baris "1 gr"');
    expect(lag.checks.find((x) => x.name.startsWith('harga-display sinkron'))!.detail).toMatch(
      /display masih 2026-11-16, gold sudah 2026-11-17/,
    );
    const bad = checkLotusArchi('<html>', '{}', NOW);
    expect(failed(bad)).toEqual(
      expect.arrayContaining(['harga-display JSON', '≥ 8 baris gramasi + harga']),
    );
  });

  it('Lotus Archi: halaman tantangan Cloudflare gagal', () => {
    const r = checkLotusArchi('<html><title>Just a moment...</title></html>', '{}', NOW);
    expect(failed(r)).toContain('bukan halaman tantangan Cloudflare');
  });
});

describe('probe Hartadinata (hrtagold)', () => {
  const real = () => read('hrtagold/price-daily-2026-11-21.json');

  it('respons asli 21 Nov lolos; mencatat updated_date, created_at, Gold 1 g', () => {
    const r = checkHrtaGold(real(), '2026-11-21');
    expect(failed(r)).toEqual([]);
    expect(r.dataDate).toBe('2026-11-21');
    const detail = (n: string) => r.checks.find((x) => x.name.startsWith(n))!.detail;
    expect(detail('updated_date (info)')).toBe('2026-11-21T08:12:26+07:00');
    expect(detail('created_at')).toContain('Prime=2026-11-21T08:12:26+07:00');
    expect(detail('Gold 1 g')).toBe('price 2258000, buyback 2122000');
  });

  it('kasus tepi: tanpa Gold gagal; Prime bermasalah hanya peringatan', () => {
    const r = checkHrtaGold(read('hrtagold/price-daily-edge-synthetic.json'), '2026-11-21');
    expect(failed(r)).toEqual(['seri Gold ≥ 12 gramasi']);
    const prime = r.checks.find((x) => x.name.startsWith('Prime: harga'))!;
    expect(prime.ok).toBe(true);
    expect(prime.detail).toMatch(/PERINGATAN: 2 baris/);
    expect(r.dataDate).toBe('2026-11-20');
  });

  it('Prime hilang hanya peringatan', () => {
    const j = JSON.parse(real().toString());
    j.data = j.data.filter((s: { series: string }) => s.series === 'Gold');
    const r = checkHrtaGold(JSON.stringify(j), '2026-11-21');
    expect(failed(r)).toEqual([]);
    expect(r.checks.find((x) => x.name.startsWith('seri Prime'))!.detail).toMatch(/PERINGATAN/);
  });

  it('Gold: harga 0 dan buyback >= jual gagal', () => {
    const j = JSON.parse(real().toString());
    j.data[0].prices[0].price = 0;
    j.data[0].prices[3].buyback_price = j.data[0].prices[3].price;
    const r = checkHrtaGold(JSON.stringify(j), '2026-11-21');
    expect(failed(r)).toEqual(
      expect.arrayContaining([
        'Gold: price/buyback_price bilangan bulat > 0',
        'Gold: buyback < price',
      ]),
    );
  });

  it('updated_date tanpa +07:00, code bukan 200, dan data basi gagal', () => {
    const j = JSON.parse(real().toString());
    j.code = 500;
    j.updated_date = '2026-11-21T01:12:26Z';
    expect(failed(checkHrtaGold(JSON.stringify(j), '2026-11-21'))).toEqual(
      expect.arrayContaining(['code = 200', 'updated_date ISO +07:00']),
    );
    expect(failed(checkHrtaGold(real(), '2026-11-25'))).toContain('updated_date ≤ 3 hari');
    expect(failed(checkHrtaGold(real(), '2026-11-24'))).toEqual([]);
  });

  it('halaman tantangan dan non-JSON gagal', () => {
    const r = checkHrtaGold('<html><title>Just a moment...</title></html>', '2026-11-21');
    expect(failed(r)).toEqual(
      expect.arrayContaining(['bukan halaman tantangan Cloudflare', 'JSON valid']),
    );
  });
});
