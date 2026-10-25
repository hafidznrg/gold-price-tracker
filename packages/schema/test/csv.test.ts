import { describe, expect, it } from 'vitest';
import {
  formatMacroValue,
  MACRO_COLUMNS,
  PRICE_COLUMNS,
  readMacroCsv,
  readPriceCsv,
  writeMacroCsv,
  writePriceCsv,
  type MacroRow,
} from '../src';
import { priceRow } from './factories';

describe('CSV harga', () => {
  const rows = [
    priceRow({ weight_g: 10, variant: '2026' }),
    priceRow({ weight_g: 0.5, variant: '2025', buyback_price: null }),
    priceRow({ weight_g: 0.5, variant: '2026' }),
    priceRow({ date: '2026-10-23', weight_g: 100 }),
  ];

  it('header sesuai urutan kolom, LF, tanpa BOM, null = kosong', () => {
    const csv = writePriceCsv(rows);
    expect(csv.startsWith(PRICE_COLUMNS.join(',') + '\n')).toBe(true);
    expect(csv).not.toContain('\r');
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
    expect(csv).toContain(
      '2026-10-24,ubslifestyle,ubs,gold_bar,2025,0.5,,2488800,,2026-10-24T10:12:08+07:00,',
    );
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('baris diurutkan menurut kunci utama (berat numerik, bukan leksikal)', () => {
    const lines = writePriceCsv(rows).trim().split('\n').slice(1);
    expect(lines.map((l) => l.split(',').slice(0, 6).join(','))).toEqual([
      '2026-10-23,ubslifestyle,ubs,gold_bar,2026,100',
      '2026-10-24,ubslifestyle,ubs,gold_bar,2025,0.5',
      '2026-10-24,ubslifestyle,ubs,gold_bar,2026,0.5',
      '2026-10-24,ubslifestyle,ubs,gold_bar,2026,10',
    ]);
  });

  it('round-trip tulis → baca → tulis identik (diff Git stabil)', () => {
    const csv = writePriceCsv(rows);
    const back = readPriceCsv(csv);
    expect(back).toHaveLength(rows.length);
    expect(writePriceCsv(back)).toBe(csv);
    expect(back.find((r) => r.variant === '2025')?.buyback_price).toBeNull();
  });

  it('teks dengan koma dikutip RFC 4180', () => {
    const csv = writePriceCsv([priceRow({ location: 'jakarta, pusat' })]);
    expect(csv).toContain('"jakarta, pusat"');
    expect(readPriceCsv(csv)[0]?.location).toBe('jakarta, pusat');
  });

  it('file kosong = tidak ada baris', () => {
    expect(readPriceCsv('')).toEqual([]);
  });

  it('menolak header yang berbeda', () => {
    const csv = writePriceCsv(rows).replace('sell_price,buyback_price', 'buyback_price,sell_price');
    expect(() => readPriceCsv(csv)).toThrow(/Header CSV/);
  });

  it('menolak baris tidak valid dengan nomor baris', () => {
    const csv = writePriceCsv(rows).replace('2488800', 'abc');
    expect(() => readPriceCsv(csv)).toThrow(/Baris CSV \d+/);
  });
});

describe('CSV makro', () => {
  const row = (over: Partial<MacroRow> = {}): MacroRow => ({
    date: '2026-10-23',
    series: 'usd_idr_jisdor',
    frequency: 'D',
    value: 16310,
    unit: 'IDR/USD',
    source: 'bi',
    scraped_at: '2026-10-23T09:41:10Z',
    run_id: '18734512345-1',
    origin: 'scrape',
    ...over,
  });

  it('nilai desimal maks. 6 angka, tanpa nol di belakang', () => {
    expect(formatMacroValue(4120.55)).toBe('4120.55');
    expect(formatMacroValue(16310)).toBe('16310');
    expect(formatMacroValue(1.123456789)).toBe('1.123457');
    expect(formatMacroValue(0.0000001)).toBe('0');
  });

  it('round-trip dan urutan kunci', () => {
    const rows = [row({ date: '2026-10-24' }), row({ frequency: 'A' }), row()];
    const csv = writeMacroCsv(rows);
    expect(csv.split('\n')[0]).toBe(MACRO_COLUMNS.join(','));
    expect(
      csv
        .trim()
        .split('\n')
        .slice(1)
        .map((l) => l.split(',').slice(0, 3).join(',')),
    ).toEqual([
      '2026-10-23,usd_idr_jisdor,A',
      '2026-10-23,usd_idr_jisdor,D',
      '2026-10-24,usd_idr_jisdor,D',
    ]);
    expect(writeMacroCsv(readMacroCsv(csv))).toBe(csv);
  });
});
