import { describe, expect, it } from 'vitest';
import type { Highlight, LatestFile } from './data';
import { buildCards } from './today';

function hl(over: Partial<Highlight> & Pick<Highlight, 'file' | 'source' | 'brand'>): Highlight {
  return {
    product: 'gold_bar',
    kind: 'fisik',
    display: 'keping_1g',
    series_key: `${over.file}:1`,
    variant: '',
    w: 1,
    date: '2026-11-17',
    source_updated_at: '2026-11-17T09:00:00+07:00',
    sell: 2_500_000,
    buyback: null,
    prev: null,
    change: { sell: null, buyback: null },
    spread: null,
    spread_pct: null,
    spark: { start: '2026-10-19', end: '2026-11-17', sell: [], buyback: null, spliced_from: null },
    ...over,
  };
}

const latest = {
  as_of: '2026-11-17',
  sources: [],
  series: [],
  spot: null,
  schema_version: '1',
  highlights: [
    hl({
      file: 'pegadaian-pegadaian',
      source: 'pegadaian',
      brand: 'pegadaian',
      product: 'gold_savings',
      kind: 'tabungan',
      w: 1,
      sell: 2_385_000,
      buyback: 2_289_000,
    }),
    hl({ file: 'pegadaian-lotusarchi', source: 'pegadaian', brand: 'lotusarchi', sell: 2_530_000 }),
    hl({ file: 'pegadaian-galeri24', source: 'pegadaian', brand: 'galeri24', sell: 2_545_000 }),
    hl({ file: 'pegadaian-antam', source: 'pegadaian', brand: 'antam', sell: 2_564_000 }),
    hl({
      file: 'galeri24-ubs',
      source: 'galeri24',
      brand: 'ubs',
      sell: 2_550_000,
      buyback: 2_270_000,
    }),
    hl({
      file: 'galeri24-antam',
      source: 'galeri24',
      brand: 'antam',
      sell: 2_560_000,
      buyback: 2_286_000,
    }),
    hl({
      file: 'galeri24-lotusarchi',
      source: 'galeri24',
      brand: 'lotusarchi',
      sell: 2_520_000,
      buyback: 2_240_000,
    }),
    hl({
      file: 'galeri24-galeri24',
      source: 'galeri24',
      brand: 'galeri24',
      sell: 2_540_000,
      buyback: 2_260_000,
    }),
    hl({
      file: 'ubslifestyle-ubs',
      source: 'ubslifestyle',
      brand: 'ubs',
      variant: '2026',
      sell: 2_490_000,
      buyback: 2_290_000,
    }),
    hl({
      file: 'logammulia-antam',
      source: 'logammulia',
      brand: 'antam',
      sell: 2_500_000,
      buyback: 2_350_000,
    }),
  ],
} as unknown as LatestFile;

describe('buildCards', () => {
  const cards = buildCards(latest);

  it('lima kartu urut mockup; Pegadaian batangan dan galeri24-antam/ubs disembunyikan', () => {
    expect(cards.map((c) => c.id)).toEqual([
      'logammulia-antam',
      'ubslifestyle-ubs',
      'galeri24-galeri24',
      'galeri24-lotusarchi',
      'pegadaian-pegadaian',
    ]);
    expect(cards.map((c) => c.title)).toEqual([
      'Antam',
      'UBS',
      'Galeri24',
      'Lotus Archi',
      'Tabungan Emas',
    ]);
    expect(cards.map((c) => c.color)).toEqual(['antam', 'ubs', 'g24', 'lotus', 'tab']);
  });

  it('Galeri24 punya buyback dan catatan "Di Pegadaian"', () => {
    const g = cards.find((c) => c.id === 'galeri24-galeri24')!;
    expect(g.buyback).toBe(2_260_000);
    expect(g.note).toContain('Di Pegadaian: Rp2.545.000');
    expect(g.note).not.toContain('belum tersedia');
  });

  it('Lotus Archi mengutip harga Pegadaian Lotus Archi', () => {
    const l = cards.find((c) => c.id === 'galeri24-lotusarchi')!;
    expect(l.note).toContain('Di Pegadaian: Rp2.530.000');
    expect(l.buyback).toBe(2_240_000);
  });

  it('Lotus Archi menyebut harga lotusarchi.com bila ada, dan tetap aman bila belum ada', () => {
    const l = cards.find((c) => c.id === 'galeri24-lotusarchi')!;
    expect(l.note).not.toContain('lotusarchi.com');
    const withOfficial = buildCards({
      ...latest,
      highlights: [
        ...latest.highlights,
        hl({
          file: 'lotusarchi-lotusarchi',
          source: 'lotusarchi',
          brand: 'lotusarchi',
          sell: 2_591_000,
        }),
      ],
    } as unknown as LatestFile);
    const w = withOfficial.find((c) => c.id === 'galeri24-lotusarchi')!;
    expect(w.note).toContain('Di lotusarchi.com: Rp2.591.000');
    expect(withOfficial.map((c) => c.id)).not.toContain('lotusarchi-lotusarchi');
  });

  it('Antam dan UBS mempertahankan catatan lama; hanya Tabungan Emas berdeskripsi', () => {
    expect(cards[0]!.note).toContain('PPh 0,25%');
    expect(cards[0]!.note).toContain('Di Pegadaian: Rp2.564.000');
    expect(cards[1]!.note).toContain('tahun produksi 2026');
    expect(cards.filter((c) => c.description).map((c) => c.id)).toEqual(['pegadaian-pegadaian']);
  });
});
