import { describe, expect, it } from 'vitest';
import type { LatestFile, MetaCatalogGroup } from '@/lib/data';
import { buildGroups } from '@/lib/today';

const SPARK = { start: '2026-11-06', end: '2026-11-07', sell: [1, 2], buyback: [1, 2] };

function series(variant: string, w: number) {
  return {
    source: 'ubslifestyle',
    brand: 'ubs',
    product: 'gold_bar',
    variant,
    w,
    key: `ubslifestyle:ubs:gold_bar:${variant}:${w}`,
    file: 'ubslifestyle-ubs',
    date: '2026-11-07',
    sell: 2_500_000 * w,
    buyback: 2_300_000 * w,
    source_updated_at: null,
    prev: null,
    change: { sell: null, buyback: null },
    spread: 200_000 * w,
    spread_pct: 8,
    current: true,
    spark: SPARK,
  };
}

function latest(variants: string[]): LatestFile {
  return {
    schema_version: 1,
    as_of: '2026-11-07',
    sources: [],
    spot: null,
    series: variants.flatMap((v) => [series(v, 1), series(v, 5)]),
    highlights: [
      {
        ...series(variants[0] ?? '', 1),
        kind: 'fisik',
        display: 'keping_1g',
        series_key: 'x',
      },
    ],
  } as unknown as LatestFile;
}

const CATALOG = [
  { source: 'ubslifestyle', brand: 'ubs', product: 'gold_bar', kind: 'fisik', weights: [1, 5] },
] as unknown as MetaCatalogGroup[];

describe('buildGroups', () => {
  it('varian tunggal: tanpa pemilih dan baris berkunci kosong', () => {
    const [g] = buildGroups(latest(['2026']), CATALOG);
    expect(g?.variants).toEqual([]);
    expect(g?.rows['']?.map((r) => r.w)).toEqual([1, 5]);
    expect(g?.count).toBe(2);
  });

  it('banyak varian: pemilih terurut terbaru dan baris per varian', () => {
    const [g] = buildGroups(latest(['2025', '2026']), CATALOG);
    expect(g?.variants).toEqual(['2026', '2025']);
    expect(g?.rows['2026']).toHaveLength(2);
    expect(g?.rows['2025']).toHaveLength(2);
    expect(g?.count).toBe(2);
  });
});
