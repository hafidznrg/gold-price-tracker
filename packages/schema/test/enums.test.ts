import { describe, expect, it } from 'vitest';
import { Brand, PriceSource, QuarantineReason, SCHEMA_VERSION, ScraperId } from '../src';

// P6-02 — enum baru Fase 6; nilai enum bukan perubahan kolom, jadi SCHEMA_VERSION tetap.
describe('enum Fase 6', () => {
  it('galeri24 adalah modul scraper dan sumber harga', () => {
    expect(ScraperId.safeParse('galeri24').success).toBe(true);
    expect(PriceSource.safeParse('galeri24').success).toBe(true);
  });

  it('lotusarchi adalah brand, sumber harga, dan modul scraper (P6-09)', () => {
    expect(Brand.safeParse('lotusarchi').success).toBe(true);
    expect(PriceSource.safeParse('lotusarchi').success).toBe(true);
    expect(ScraperId.safeParse('lotusarchi').success).toBe(true);
  });

  it('PRICE_FORMULA adalah alasan karantina (V-12)', () => {
    expect(QuarantineReason.safeParse('PRICE_FORMULA').success).toBe(true);
    expect(QuarantineReason.safeParse('LAINNYA').success).toBe(false);
  });

  it('SCHEMA_VERSION tidak berubah', () => {
    expect(SCHEMA_VERSION).toBe('1.0.0');
  });
});
