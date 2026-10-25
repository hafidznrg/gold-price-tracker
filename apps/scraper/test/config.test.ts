import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCRAPER_IDS, weekdayIso } from '@gold/schema';
import { describe, expect, it } from 'vitest';
import { loadConfig, loadStatus } from '../src/config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Menguji file config/ yang sebenarnya, sehingga PR yang merusak konfigurasi gagal di CI.
describe('config/ repo', async () => {
  const config = await loadConfig(ROOT);

  it('setiap modul scraper punya entri di sources.yml', () => {
    expect(config.sources.map((s) => s.id).sort()).toEqual([...SCRAPER_IDS].sort());
  });

  it('setiap konsep makro punya seri dengan precedence unik', () => {
    for (const concept of ['gold_usd', 'usd_idr'] as const) {
      const p = config.macroSeries.filter((s) => s.concept === concept).map((s) => s.precedence);
      expect(p.length).toBeGreaterThan(0);
      expect(new Set(p).size).toBe(p.length);
    }
  });

  it('katalog UBS Lifestyle memuat ≥ 13 pecahan (V-04)', () => {
    expect(config.catalog.filter((i) => i.source === 'ubslifestyle').length).toBeGreaterThanOrEqual(
      13,
    );
  });

  it('libur 2026 dan 2027 tersedia, tanpa tanggal ganda', () => {
    for (const year of ['2026', '2027']) {
      expect(config.holidays.some((h) => h.date.startsWith(year))).toBe(true);
    }
    const dates = config.holidays.map((h) => h.date);
    // Isra Mikraj bisa jatuh dua kali setahun (2027), tetapi tanggalnya berbeda.
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('cuti bersama jatuh di hari kerja', () => {
    for (const h of config.holidays.filter((x) => x.kind === 'cuti_bersama')) {
      expect([1, 2, 3, 4, 5], `${h.date} ${h.name}`).toContain(weekdayIso(h.date));
    }
  });
});

describe('status.json repo', () => {
  it('valid', async () => {
    await expect(loadStatus(ROOT)).resolves.toBeTypeOf('object');
  });
});
