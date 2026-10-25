import { describe, expect, it } from 'vitest';
import { MacroRow, PriceRow, QuarantineBatch, RunRecord, SourceStatusFile } from '../src';
import { priceRow } from './factories';

const runRecord = (over: Partial<RunRecord> = {}): RunRecord => ({
  run_id: '18734512345-1',
  source: 'ubslifestyle',
  workflow: 'scrape-retail',
  trigger: 'schedule',
  slot: 'primary',
  started_at: '2026-10-24T03:30:00Z',
  finished_at: '2026-10-24T03:31:40Z',
  status: 'success',
  error_code: null,
  error_message: null,
  data_date: '2026-10-24',
  rows_parsed: 3,
  rows_inserted: 1,
  rows_updated: 1,
  rows_unchanged: 1,
  rows_held: 0,
  rows_rejected: 0,
  raw_paths: [],
  parser_version: 'ubslifestyle@1.0.0',
  ...over,
});

describe('PriceRow', () => {
  it('menerima baris valid', () => {
    expect(PriceRow.safeParse(priceRow()).success).toBe(true);
  });

  it('menerima baris hanya dengan satu harga (V-01)', () => {
    expect(PriceRow.safeParse(priceRow({ buyback_price: null })).success).toBe(true);
    expect(PriceRow.safeParse(priceRow({ sell_price: null })).success).toBe(true);
  });

  it('menolak baris tanpa harga sama sekali (V-01)', () => {
    expect(PriceRow.safeParse(priceRow({ sell_price: null, buyback_price: null })).success).toBe(
      false,
    );
  });

  it.each<[string, Partial<PriceRow>]>([
    ['enum source', { source: 'tokopedia' as never }],
    ['enum brand', { brand: 'lotus' as never }],
    ['tanggal', { date: '2026-02-30' }],
    ['harga desimal', { sell_price: 1403300.5 }],
    ['harga negatif', { buyback_price: -1 }],
    ['berat nol', { weight_g: 0 }],
    ['source_updated_at tanpa offset', { source_updated_at: '2026-10-24T10:12:08' }],
    ['scraped_at bukan UTC', { scraped_at: '2026-10-24T10:31:40+07:00' }],
    ['run_id', { run_id: 'abc' }],
    ['product', { product: 'Gold Bar' }],
  ])('menolak %s yang tidak valid', (_label, over) => {
    expect(PriceRow.safeParse(priceRow(over)).success).toBe(false);
  });
});

describe('MacroRow', () => {
  const row: MacroRow = {
    date: '2026-10-23',
    series: 'xau_usd_oz',
    frequency: 'D',
    value: 4120.55,
    unit: 'USD/ozt',
    source: 'xaus',
    scraped_at: '2026-10-23T09:41:10Z',
    run_id: '18734512345-1',
    origin: 'scrape',
  };

  it('menerima baris valid', () => {
    expect(MacroRow.safeParse(row).success).toBe(true);
  });

  it('menolak frekuensi dan seri tak dikenal', () => {
    expect(MacroRow.safeParse({ ...row, frequency: 'W' }).success).toBe(false);
    expect(MacroRow.safeParse({ ...row, series: 'eur_idr' }).success).toBe(false);
  });
});

describe('RunRecord', () => {
  it('menerima run sukses', () => {
    expect(RunRecord.safeParse(runRecord()).success).toBe(true);
  });

  it('rows_parsed harus = jumlah hitungan lain', () => {
    expect(RunRecord.safeParse(runRecord({ rows_parsed: 4 })).success).toBe(false);
  });

  it('status failed wajib punya error_code, dan sebaliknya', () => {
    expect(RunRecord.safeParse(runRecord({ status: 'failed' })).success).toBe(false);
    expect(
      RunRecord.safeParse(
        runRecord({
          status: 'failed',
          error_code: 'BLOCKED',
          rows_parsed: 0,
          rows_inserted: 0,
          rows_updated: 0,
          rows_unchanged: 0,
        }),
      ).success,
    ).toBe(true);
    expect(RunRecord.safeParse(runRecord({ error_code: 'BLOCKED' })).success).toBe(false);
  });
});

describe('SourceStatusFile & QuarantineBatch', () => {
  it('status.json kosong valid', () => {
    expect(SourceStatusFile.safeParse({}).success).toBe(true);
  });

  it('status.json menolak sumber tak dikenal', () => {
    expect(SourceStatusFile.safeParse({ tokopedia: {} }).success).toBe(false);
  });

  it('batch karantina memerlukan minimal satu baris', () => {
    const batch = {
      run_id: '18734512345-1',
      source: 'pegadaian',
      reason_code: 'PRICE_JUMP',
      decision: 'pending',
    };
    expect(QuarantineBatch.safeParse({ ...batch, rows: [] }).success).toBe(false);
    expect(
      QuarantineBatch.safeParse({ ...batch, rows: [priceRow({ source: 'pegadaian' })] }).success,
    ).toBe(true);
  });
});
