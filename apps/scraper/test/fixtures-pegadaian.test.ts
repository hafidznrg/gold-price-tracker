import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

// Kontrak hasil riset P0-08 — mengunci asumsi tentang endpoint Pegadaian
// sebelum parser ditulis di P1-07. Bila fixture diperbarui dan tes ini gagal,
// perbarui TECH-SPEC §5.2 dan config/catalog.yml lebih dulu.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const DIR = path.join(HERE, 'fixtures/pegadaian');

interface Detail {
  idHargaDetail: string;
  berat: number;
  hargaJual: number;
  hargaBeli: number | null;
}
interface VendorPrices {
  idHarga: number;
  tglBerlaku: string;
  keterangan: string;
  idVendor: string;
  namaVendor: string;
  hargaMuliaDetails: Detail[];
  timestamp: string;
}

const table = JSON.parse(
  readFileSync(path.join(DIR, 'prices-table-2026-10-25-sunday.json'), 'utf8'),
) as {
  responseCode: string;
  data: VendorPrices[];
};

/** Pemetaan `idVendor` → brand proyek (kode lebih stabil daripada nama). */
const VENDOR_BRAND = {
  '00005201808001': 'antam',
  '00005201808002': 'ubs',
  '00005202003010': 'galeri24',
} as const;

describe('fixture Pegadaian /gold/prices/table', () => {
  it('respons sukses dengan kode Approved', () => {
    expect(table.responseCode).toBe('2000000100');
  });

  it('ketiga vendor target ada, dikenali lewat idVendor', () => {
    const byCode = new Map(table.data.map((v) => [v.idVendor, v.namaVendor]));
    expect(byCode.get('00005201808001')).toBe('ANTAM');
    expect(byCode.get('00005201808002')).toBe('UBS');
    expect(byCode.get('00005202003010')).toBe('GALERI 24');
  });

  it('semua vendor memakai tglBerlaku yang sama (data Sabtu, diambil Minggu)', () => {
    expect(new Set(table.data.map((v) => v.tglBerlaku))).toEqual(new Set(['2026-10-24']));
  });

  it('buyback tidak tersedia: hargaBeli selalu null (Q-1)', () => {
    const all = table.data.flatMap((v) => v.hargaMuliaDetails);
    expect(all.every((d) => d.hargaBeli === null)).toBe(true);
  });

  it('gramasi berharga (> 0) per brand target = katalog pegadaian', async () => {
    const config = await loadConfig(ROOT);
    for (const [code, brand] of Object.entries(VENDOR_BRAND)) {
      const vendor = table.data.find((v) => v.idVendor === code)!;
      const weights = vendor.hargaMuliaDetails
        .filter((d) => d.hargaJual > 0)
        .map((d) => d.berat)
        .sort((a, b) => a - b);
      const catalog = config.catalog
        .filter((i) => i.source === 'pegadaian' && i.brand === brand)
        .map((i) => i.weight_g)
        .sort((a, b) => a - b);
      expect(weights, brand).toEqual(catalog);
      expect(weights.length, `${brand} V-04`).toBeGreaterThanOrEqual(5);
    }
  });

  it('harga integer rupiah; 0 berarti gramasi tidak dijual', () => {
    for (const d of table.data.flatMap((v) => v.hargaMuliaDetails)) {
      expect(Number.isSafeInteger(d.hargaJual)).toBe(true);
      expect(d.hargaJual).toBeGreaterThanOrEqual(0);
    }
  });

  it('nilai 1 g sama dengan tabel di halaman', () => {
    const oneGram = (code: string) =>
      table.data.find((v) => v.idVendor === code)!.hargaMuliaDetails.find((d) => d.berat === 1)!
        .hargaJual;
    expect(oneGram('00005202003010')).toBe(2467000);
    expect(oneGram('00005201808001')).toBe(2579000);
    expect(oneGram('00005201808002')).toBe(2491000);
  });
});
