import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parseRupiah } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

// Kontrak hasil riset P0-10 — mengunci asumsi tentang sumber makro sebelum
// scraper/backfill ditulis di Fase 2. Bila fixture diperbarui dan tes ini gagal,
// perbarui TECH-SPEC §5.4–5.6 lebih dulu.

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (f: string) => readFileSync(path.join(DIR, f));
const json = <T>(f: string) => JSON.parse(read(f).toString('utf8')) as T;
const sheetRows = (f: string, sheet?: string) => {
  const wb = XLSX.read(read(f));
  const ws = wb.Sheets[sheet ?? wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
};

describe('xaus', () => {
  const history = json<{
    unit: string;
    price_source: string;
    data_state: { status: string };
    points: { d: string; c: number }[];
  }>('xaus/history-last15-2026-10-25.json');

  it('histori: troy oz, data_state fresh, sumber futures GC=F', () => {
    expect(history.unit).toBe('troy_oz');
    expect(history.data_state.status).toBe('fresh');
    expect(history.price_source).toMatch(/GC=F/);
  });

  it('titik histori {d, c} terurut naik, hanya hari perdagangan', () => {
    const dates = history.points.map((p) => p.d);
    expect([...dates].sort()).toEqual(dates);
    expect(dates.at(-1)).toBe('2026-10-23'); // diambil Minggu: penutupan terakhir = Jumat
    for (const d of dates)
      expect([1, 2, 3, 4, 5]).toContain(new Date(`${d}T00:00:00Z`).getUTCDay());
  });

  it('spot punya flag stale (V-10) dan harga USD/oz', () => {
    const spot = json<{ stale: boolean; spot_usd_oz: number; xau: { unit: string } }>(
      'xaus/spot-compact-2026-10-25.json',
    );
    expect(spot.stale).toBe(false);
    expect(spot.xau.unit).toBe('troy_oz');
    expect(spot.spot_usd_oz).toBeGreaterThan(1000);
  });
});

describe('Frankfurter (ECB)', () => {
  const parse = (f: string) =>
    read(f)
      .toString('utf8')
      .trim()
      .split('\n')
      .slice(1)
      .map((l) => l.split(','));

  it('format long: date,base,quote,rate dengan pasangan IDR & USD per tanggal', () => {
    expect(read('frankfurter/rates-eur-idr-usd-2026-tail.csv').toString().split('\n')[0]).toBe(
      'date,base,quote,rate',
    );
    const rows = parse('frankfurter/rates-eur-idr-usd-2026-tail.csv');
    const byDate = new Map<string, string[]>();
    for (const [date, , quote] of rows) byDate.set(date!, [...(byDate.get(date!) ?? []), quote!]);
    for (const [, quotes] of byDate) expect(quotes.sort()).toEqual(['IDR', 'USD']);
  });

  it('histori dimulai 1999-01-04 (lebih awal dari perkiraan Feb 1999)', () => {
    expect(parse('frankfurter/rates-eur-idr-usd-1999-head.csv')[0]?.[0]).toBe('1999-01-04');
  });

  it('usd_idr_ecb = EUR/IDR ÷ EUR/USD', () => {
    const rows = parse('frankfurter/rates-eur-idr-usd-2026-tail.csv').filter(
      (r) => r[0] === '2026-10-23',
    );
    const idr = Number(rows.find((r) => r[2] === 'IDR')![3]);
    const usd = Number(rows.find((r) => r[2] === 'USD')![3]);
    expect(idr / usd).toBeCloseTo(18107.8, 1);
  });
});

describe('World Bank Pink Sheet', () => {
  const rows = sheetRows('worldbank/cmo-monthly-trimmed-2026-10.xlsx', 'Monthly Prices');
  // Cari kolom berdasarkan nama, bukan posisi (fase-2 risiko: tata letak bisa berubah).
  const header = rows.findIndex((r) => r.some((c) => c === 'Gold'));
  const col = rows[header]!.indexOf('Gold');
  const data = rows.filter((r) => typeof r[0] === 'string' && /^\d{4}M\d{2}$/.test(r[0]));

  it('kolom "Gold" bersatuan ($/troy oz) di baris tepat di bawah nama', () => {
    expect(header).toBeGreaterThan(0);
    expect(rows[header + 1]![col]).toBe('($/troy oz)');
  });

  it('label periode YYYYMmm; nilai numerik', () => {
    expect(data.find((r) => r[0] === '1996M01')![col]).toBe(399);
    expect(data.at(-1)![0]).toBe('2026M09');
    expect(data.at(-1)![col]).toBe(4319);
  });
});

describe('JISDOR', () => {
  it('halaman GET memuat tabel 10 hari kerja terakhir: "DD Bulan YYYY" | "Rp 18.069,00"', () => {
    const html = gunzipSync(read('jisdor/page-2026-10-25.html.gz')).toString('utf8');
    const start = html.indexOf('<table class="table table-striped');
    const table = html.slice(start, html.indexOf('</table>', start));
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
      [...m[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
        c[1]!
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    );
    expect(rows[0]).toEqual(['Tanggal', 'Kurs']);
    expect(rows).toHaveLength(11);
    expect(rows[1]).toEqual(['23 Oktober 2026', 'Rp 18.069,00']);
    expect(parseRupiah(rows[1]![1]!)).toBe(18069);
  });

  it('ekspor XLSX: tanggal teks M/D/YYYY, kurs teks "9.760,00"', () => {
    const rows = sheetRows('jisdor/export-trimmed-2013-2026.xlsx');
    const head = rows.findIndex((r) => r[1] === 'Tanggal');
    expect(rows[head]?.slice(0, 3)).toEqual(['NO', 'Tanggal', 'Kurs']);
    const first = rows[head + 1]!;
    expect(first[1]).toBe('5/20/2013 12:00:00 AM');
    expect(parseRupiah(first[2] as string)).toBe(9760);
    const last = rows.at(-1)!;
    expect(last[1]).toBe('10/23/2026 12:00:00 AM');
    expect(parseRupiah(last[2] as string)).toBe(18069);
  });
});
