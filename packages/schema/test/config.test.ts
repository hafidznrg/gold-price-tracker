import { describe, expect, it } from 'vitest';
import { CatalogFile, expandCatalog, isInCatalog } from '../src';

const catalog = (items: unknown[]) => expandCatalog(CatalogFile.parse({ items }));

describe('katalog', () => {
  const items = catalog([
    {
      source: 'pegadaian',
      brand: 'galeri24',
      product: 'gold_bar',
      weights: [0.5, 1, 1000],
      active_from: '2026-01-01',
    },
    {
      source: 'pegadaian',
      brand: 'antam',
      product: 'gold_bar',
      weights: [3],
      active_from: '2026-01-01',
      active_to: '2026-06-30',
    },
  ]);

  it('memecah grup menjadi item per gramasi', () => {
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ weight_g: 0.5, active_to: null });
  });

  it('isInCatalog memeriksa kunci dan rentang aktif (V-02)', () => {
    const row = { source: 'pegadaian', brand: 'galeri24', product: 'gold_bar' } as const;
    expect(isInCatalog(items, { ...row, weight_g: 1, date: '2026-10-24' })).toBe(true);
    expect(isInCatalog(items, { ...row, weight_g: 2, date: '2026-10-24' })).toBe(false);
    expect(isInCatalog(items, { ...row, weight_g: 1, date: '2025-12-31' })).toBe(false);
    const antam = {
      source: 'pegadaian',
      brand: 'antam',
      product: 'gold_bar',
      weight_g: 3,
    } as const;
    expect(isInCatalog(items, { ...antam, date: '2026-06-30' })).toBe(true);
    expect(isInCatalog(items, { ...antam, date: '2026-07-01' })).toBe(false);
  });

  it('menolak rentang aktif yang tumpang tindih', () => {
    const g = { source: 'ubslifestyle', brand: 'ubs', product: 'gold_bar', weights: [1] };
    expect(() =>
      catalog([
        { ...g, active_from: '2026-01-01' },
        { ...g, active_from: '2026-06-01' },
      ]),
    ).toThrow(/tumpang tindih/);
    expect(() =>
      catalog([
        { ...g, active_from: '2026-01-01', active_to: '2026-05-31' },
        { ...g, active_from: '2026-06-01' },
      ]),
    ).not.toThrow();
  });

  it('menolak active_to sebelum active_from', () => {
    expect(() =>
      CatalogFile.parse({
        items: [
          {
            source: 'ubslifestyle',
            brand: 'ubs',
            product: 'gold_bar',
            weights: [1],
            active_from: '2026-06-01',
            active_to: '2026-01-01',
          },
        ],
      }),
    ).toThrow();
  });
});
