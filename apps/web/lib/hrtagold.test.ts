import { describe, expect, it } from 'vitest';
import {
  ALL_DEFS,
  COMPARE_DEFS,
  compareLine,
  compareOptions,
  compareWeights,
  findOption,
  todayCells,
  todayRows,
} from './bandingkan';
import {
  FILE_ORDER,
  colorToken,
  parseSeriesKey,
  seriesFileId,
  seriesGroupLabel,
  variantLabel,
  type LatestFile,
} from './data';
import {
  decodePick,
  encodePick,
  explorerOptions,
  optionBrandKey,
  optionBrandName,
  resolvePick,
  seriesPoints,
} from './explorer';
import { formatRupiah } from './format';
import { MATRIX_COLS, TREND_DEFS, buildMatrix } from './home-matrix';
import { buyDefs, sellOption, supportsCustomWeight, weightsFor } from './kalkulator';
import { sourceStampText } from './source-stamp';
import {
  barSources,
  buildOptions,
  buybackChoices,
  compareItems,
  hasHrtaEmasku,
  resolveBuyback,
  todayPair,
  weightSpreads,
} from './spread';
import {
  GOLD_WEIGHTS,
  HRTA_FILE,
  PRIME_WEIGHTS,
  goldBuyback,
  goldSell,
  hrtaLatest,
  hrtaMetaSeries,
  hrtaSeriesFile,
  primeSell,
} from './test-support/hrtagold';
import { buildCards } from './today';

const EMPTY_LATEST = { series: [], highlights: [], as_of: null } as unknown as LatestFile;
const WITH = hrtaLatest();
const OPTIONS = explorerOptions({ series: hrtaMetaSeries() });
const SORTED_GOLD = [...GOLD_WEIGHTS].sort((a, b) => a - b);

describe('katalog Hartadinata', () => {
  it('varian prime berlabel "Prime", bukan non-Pegadaian atau produksi', () => {
    expect(variantLabel('prime')).toBe('Prime');
    expect(variantLabel('non_pegadaian')).toBe('non-Pegadaian');
    expect(variantLabel('2026')).toBe('produksi 2026');
    expect(variantLabel('')).toBe('');
  });

  it('warna, kunci seri, nama file, dan urutan', () => {
    expect(colorToken({ brand: 'emasku', product: 'gold_bar' })).toBe('emasku');
    expect(parseSeriesKey('hrtagold:emasku:gold_bar:prime:25')).toMatchObject({
      source: 'hrtagold',
      brand: 'emasku',
      variant: 'prime',
    });
    expect(parseSeriesKey('hrtagold:emasku:gold_bar::0.1')?.w).toBe(0.1);
    expect(seriesFileId({ source: 'hrtagold', brand: 'emasku', product: 'gold_bar' })).toBe(
      HRTA_FILE,
    );
    expect(FILE_ORDER.indexOf(HRTA_FILE)).toBe(FILE_ORDER.indexOf('galeri24-lotusarchi') + 1);
    expect(seriesGroupLabel({ source: 'hrtagold', brand: 'emasku', product: 'gold_bar' })).toBe(
      'Hartadinata · HRTA Gold',
    );
    expect(sourceStampText('hrtagold', '2026-11-21', '2026-11-21T08:12:00+07:00')).toContain(
      'hrtagold.id',
    );
  });
});

describe('Hari ini: kartu Hartadinata (P7-11)', () => {
  const cards = buildCards(WITH);
  const card = cards.find((c) => c.id === HRTA_FILE)!;

  it('satu kartu Gold 1 g, jual + buyback per keping, tanpa kartu Prime', () => {
    expect(cards.filter((c) => c.source === 'hrtagold')).toHaveLength(1);
    expect(card).toMatchObject({
      title: 'Hartadinata',
      color: 'emasku',
      kind: 'fisik',
      sell: goldSell(1),
      buyback: goldBuyback(1),
      carryOver: false,
    });
  });

  it('catatan: sudah termasuk pajak; Prime 25 g sebagai baris tambahan, tidak menggeser Gold', () => {
    expect(card.note).toContain('sudah termasuk pajak');
    expect(card.note).not.toContain('Harga dasar');
    expect(card.extra).toBe(`Prime 25 g: ${formatRupiah(primeSell(25))}`);
    expect(card.sell).toBe(goldSell(1));
  });

  it('tanpa seri Prime: tanpa baris tambahan; tanpa data: tanpa kartu', () => {
    const noPrime: LatestFile = {
      ...WITH,
      series: WITH.series.filter((s) => s.variant !== 'prime'),
    };
    expect(buildCards(noPrime)[0]!.extra).toBeNull();
    expect(buildCards(EMPTY_LATEST).some((c) => c.id === HRTA_FILE)).toBe(false);
  });
});

describe('Spread (P7-12)', () => {
  it('opsi Hartadinata tersembunyi tanpa file series, muncul bila ada', () => {
    expect(hasHrtaEmasku(EMPTY_LATEST)).toBe(false);
    const none = buildOptions(EMPTY_LATEST);
    expect(none.sell.map((o) => o.id)).not.toContain('hr-emasku');
    expect(none.buyback.map((o) => o.id)).not.toContain('hr-emasku');
    expect(barSources(EMPTY_LATEST).map((b) => b.id)).not.toContain('hr-emasku');
    expect(compareItems(EMPTY_LATEST).map((c) => c.name)).not.toContain('Hartadinata 1 g');

    expect(hasHrtaEmasku(WITH)).toBe(true);
    const { sell, buyback } = buildOptions(WITH);
    const hr = sell.find((o) => o.id === 'hr-emasku')!;
    expect(hr).toMatchObject({
      file: HRTA_FILE,
      source: 'hrtagold',
      color: 'emasku',
      variants: [''],
    });
    expect(buyback.map((o) => o.id)).toContain('hr-emasku');
    expect(buybackChoices(hr, buyback).map((o) => o.id)).toEqual(['hr-emasku']);
    expect(resolveBuyback(hr, buyback, null)?.id).toBe('hr-emasku');
    expect(compareItems(WITH).map((c) => c.name)).toContain('Hartadinata 1 g');
  });

  it('todayPair: jual dan buyback Gold 1 g, bukan Prime', () => {
    const { sell, buyback } = buildOptions(WITH);
    const t = todayPair(
      WITH,
      sell.find((o) => o.id === 'hr-emasku')!,
      buyback.find((o) => o.id === 'hr-emasku')!,
    );
    expect(t.sell).toBe(goldSell(1));
    expect(t.buyback).toBe(goldBuyback(1));
  });

  it('batang per gramasi: 17 gramasi, buyback per keping (bukan 1 g × berat)', () => {
    const bar = barSources(WITH).find((b) => b.id === 'hr-emasku')!;
    expect(bar).toMatchObject({
      label: 'HRTA Gold · Hartadinata',
      source: 'hrtagold',
      color: 'emasku',
    });
    expect(bar.rows).toHaveLength(GOLD_WEIGHTS.length);
    const r1000 = bar.rows.find((r) => r.w === 1000)!;
    expect(r1000.value).toBeCloseTo(
      ((goldSell(1000) - goldBuyback(1000)) / goldSell(1000)) * 100,
      6,
    );
    expect(weightSpreads(WITH, HRTA_FILE, '').map((r) => r.w)).toEqual(SORTED_GOLD);
  });
});

describe('Bandingkan dan beranda (P7-12)', () => {
  it('seri hr-emasku solid warna emasku, sesudah Lotus Archi', () => {
    const d = COMPARE_DEFS.find((x) => x.id === 'hr-emasku')!;
    expect(d).toMatchObject({ file: HRTA_FILE, color: 'emasku', dashed: false, linear: false });
    const ids = COMPARE_DEFS.map((x) => x.id);
    expect(ids.indexOf('hr-emasku')).toBe(ids.indexOf('g24-lotus') + 1);
    expect(MATRIX_COLS.map((x) => x.id)).toContain('hr-emasku');
    expect(TREND_DEFS.map((x) => x.id)).toContain('hr-emasku');
    expect(ALL_DEFS.some((x) => x.id === 'hr-emasku')).toBe(true);
  });

  it('todayCells: 17 gramasi Gold; Prime tidak menimpa Gold di 25/50/100 g', () => {
    const cells = todayCells(WITH)['hr-emasku']!;
    expect(Object.keys(cells)).toHaveLength(GOLD_WEIGHTS.length);
    for (const w of PRIME_WEIGHTS) {
      expect(cells[String(w)]).toMatchObject({ sell: goldSell(w), buyback: goldBuyback(w) });
      expect(cells[String(w)]!.buybackDerived).toBeUndefined();
    }
    const rows = todayRows({ 'hr-emasku': cells }, 1);
    expect(rows[0]).toMatchObject({ sell: goldSell(1), buyback: goldBuyback(1) });
  });

  it('matriks: kolom Hartadinata terisi', () => {
    const cells = todayCells(WITH);
    const col = MATRIX_COLS.findIndex((d) => d.id === 'hr-emasku');
    const r = buildMatrix(cells, 'jual', 'keping').find((x) => x.w === 1)!;
    expect(r.cells[col]!.value).toBe(goldSell(1));
  });

  it('opsi dan garis: Prime tidak ikut Bandingkan; garis dari seri Gold', () => {
    const opts = compareOptions(OPTIONS);
    expect(opts.every((o) => !o.variant)).toBe(true);
    expect(opts).toHaveLength(GOLD_WEIGHTS.length);
    const d = COMPARE_DEFS.find((x) => x.id === 'hr-emasku')!;
    const o25 = findOption(d, 25, OPTIONS)!;
    expect(o25.variants).toEqual(['']);
    const line = compareLine(o25, hrtaSeriesFile(), 'gram', null, '2026-11-21');
    expect(line.first).toBe('2026-11-20');
    expect(line.points.at(-1)![1]).toBeCloseTo(goldSell(25) / 25, 4);
    // Satu seri saja: tidak ada yang dibandingkan.
    expect(compareWeights(OPTIONS)).toEqual([]);
  });
});

describe('Explorer (P7-13)', () => {
  it('Gold 17 gramasi + Prime 3 gramasi sebagai opsi terpisah', () => {
    const gold = OPTIONS.filter((o) => !o.variant);
    const prime = OPTIONS.filter((o) => o.variant === 'prime');
    expect(gold.map((o) => o.w).sort((a, b) => a - b)).toEqual(SORTED_GOLD);
    expect(prime.map((o) => o.w).sort((a, b) => a - b)).toEqual([...PRIME_WEIGHTS]);
    expect(new Set(OPTIONS.map((o) => o.id)).size).toBe(20);
    expect(prime[0]).toMatchObject({ variants: ['prime'], brand: 'emasku' });
    expect(prime[0]!.first.sell).not.toBeNull();
    expect(prime[0]!.first.buyback).not.toBeNull();
  });

  it('nama brand dan kunci: "Hartadinata Prime" / emasku_prime', () => {
    const prime = OPTIONS.find((o) => o.variant === 'prime')!;
    const gold = OPTIONS.find((o) => !o.variant)!;
    expect(optionBrandName(prime)).toBe('Hartadinata Prime');
    expect(optionBrandName(gold)).toBe('Hartadinata');
    expect(optionBrandKey(prime)).toBe('emasku_prime');
    expect(optionBrandKey(gold)).toBe('emasku');
  });

  it('kunci URL bolak-balik untuk Gold dan Prime', () => {
    const g = { source: 'hrtagold', brand: 'emasku', w: 25, price: 'sell' } as const;
    const p = { ...g, variant: 'prime' } as const;
    expect(encodePick(g)).toBe('hrtagold-emasku-25-sell');
    expect(encodePick(p)).toBe('hrtagold-emasku_prime-25-sell');
    expect(decodePick('hrtagold-emasku-25-sell')).toEqual(g);
    expect(decodePick('hrtagold-emasku_prime-25-buyback')).toEqual({ ...p, price: 'buyback' });
    expect(decodePick('galeri24-antam_np-1-buyback')?.variant).toBe('non_pegadaian');
  });

  it('resolvePick dan titik: Prime dan Gold 25 g tidak tertukar', () => {
    const base = { source: 'hrtagold', brand: 'emasku', price: 'sell' } as const;
    const g = resolvePick({ ...base, w: 25 }, OPTIONS)!;
    const p = resolvePick({ ...base, w: 25, variant: 'prime' }, OPTIONS)!;
    expect(g.id).not.toBe(p.id);
    const file = hrtaSeriesFile();
    expect(seriesPoints(file, g, 'sell').at(-1)!.value).toBe(goldSell(25));
    expect(seriesPoints(file, p, 'sell').at(-1)!.value).toBe(primeSell(25));
    expect(seriesPoints(file, p, 'buyback')).toHaveLength(2);
    // Prime tidak punya 1 g.
    expect(resolvePick({ ...base, w: 1, variant: 'prime' }, OPTIONS)).toBeNull();
  });
});

describe('Kalkulator (P7-12)', () => {
  it('Hartadinata tempat beli 17 gramasi; buyback per keping, tanpa "Berat lain"', () => {
    const d = ALL_DEFS.find((x) => x.id === 'hr-emasku')!;
    expect(buyDefs(OPTIONS).map((x) => x.id)).toContain('hr-emasku');
    expect(buyDefs([]).map((x) => x.id)).not.toContain('hr-emasku');
    expect(weightsFor(d, OPTIONS)).toEqual(SORTED_GOLD);
    expect(supportsCustomWeight(d)).toBe(false);
    for (const w of [1, 250, 1000]) {
      const s = sellOption(d, w, OPTIONS)!;
      expect(s.perGram).toBe(false);
      expect(s.option.w).toBe(w);
    }
  });
});
