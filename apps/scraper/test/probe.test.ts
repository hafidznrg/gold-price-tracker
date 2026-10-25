import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  checkFrankfurter,
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
