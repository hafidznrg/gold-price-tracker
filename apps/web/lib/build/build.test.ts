import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  SourcesFile,
  expandCatalog,
  type MacroRow,
  type PriceRow,
  type SpotSnapshot,
} from '@gold/schema';
import type { MacroFile, SeriesFile } from '../data/types';
import { buildSpark, computeChange, computeSpread } from './latest';
import { buildOutputs, type BuildInput } from './outputs';
import { groupByFile, toSeriesFile } from './series';

function price(p: Partial<PriceRow> & Pick<PriceRow, 'date'>): PriceRow {
  return {
    source: 'logammulia',
    brand: 'antam',
    product: 'gold_bar',
    variant: '',
    weight_g: 1,
    location: 'jakarta',
    sell_price: 2_500_000,
    buyback_price: 2_350_000,
    source_updated_at: `${p.date}T08:30:00+07:00`,
    scraped_at: '2026-10-31T02:00:00Z',
    run_id: '1-1',
    origin: 'scrape',
    ...p,
  };
}

function macro(p: Partial<MacroRow> & Pick<MacroRow, 'date' | 'series' | 'value'>): MacroRow {
  return {
    frequency: 'D',
    unit: p.series === 'xau_usd_oz' ? 'USD/ozt' : 'IDR/USD',
    source: p.series === 'xau_usd_oz' ? 'xaus' : 'bi',
    scraped_at: '2026-10-31T02:00:00Z',
    run_id: '1-1',
    origin: 'scrape',
    ...p,
  };
}

const sources = SourcesFile.parse({
  sources: [
    {
      id: 'logammulia',
      kind: 'prices',
      url: 'https://logammulia.com/harga-emas',
      fetch_method: 'browser',
      workflow: 'scrape-retail',
      update_calendar: 'daily',
      parser_version: '1.0.0',
      enabled: true,
    },
    {
      id: 'xaus',
      kind: 'macro',
      url: 'https://xaus.com/api/v1/history',
      fetch_method: 'api',
      workflow: 'scrape-macro',
      update_calendar: 'weekdays',
      parser_version: '0.1.0',
      enabled: false,
    },
  ],
  macro_series: [
    { id: 'xau_usd_oz', concept: 'gold_usd', unit: 'USD/ozt', source: 'xaus', precedence: 1 },
    { id: 'usd_idr_jisdor', concept: 'usd_idr', unit: 'IDR/USD', source: 'bi', precedence: 1 },
    { id: 'usd_idr_annual', concept: 'usd_idr', unit: 'IDR/USD', source: 'wdi', precedence: 3 },
  ],
});

const catalog = expandCatalog({
  items: [
    {
      source: 'logammulia',
      brand: 'antam',
      product: 'gold_bar',
      weights: [1, 0.5],
      active_from: '2010-01-01',
      active_to: null,
    },
    {
      source: 'pegadaian',
      brand: 'pegadaian',
      product: 'gold_savings',
      weights: [0.01],
      active_from: '2010-01-01',
      active_to: null,
    },
    {
      source: 'pegadaian',
      brand: 'galeri24',
      product: 'gold_bar',
      weights: [1, 2],
      active_from: '2010-01-01',
      active_to: '2020-01-01',
    },
  ],
});

const prices: PriceRow[] = [
  price({ date: '2026-10-30', sell_price: 2_546_000, buyback_price: 2_341_000 }),
  price({ date: '2026-10-31', sell_price: 2_526_000, buyback_price: 2_276_000 }),
  price({ date: '2026-10-31', weight_g: 0.5, sell_price: 1_323_000, buyback_price: null }),
  ...['2026-10-30', '2026-10-31'].map((date, i) =>
    price({
      date,
      source: 'pegadaian',
      brand: 'pegadaian',
      product: 'gold_savings',
      weight_g: 0.01,
      location: '',
      sell_price: [24_090, 23_600][i]!,
      buyback_price: [23_240, 22_770][i]!,
    }),
  ),
  price({
    date: '2026-10-31',
    source: 'pegadaian',
    brand: 'galeri24',
    location: '',
    sell_price: 2_443_000,
    buyback_price: null,
  }),
  // UBS: seri backfill `variant=''` (buyback saja) lalu seri tahun produksi (D-28).
  ...['2026-10-23', '2026-10-24'].map((date, i) =>
    price({
      date,
      source: 'ubslifestyle',
      brand: 'ubs',
      location: '',
      sell_price: null,
      buyback_price: [2_291_000, 2_288_000][i]!,
      source_updated_at: null,
    }),
  ),
  ...['2026-10-26', '2026-10-27'].map((date, i) =>
    price({
      date,
      source: 'ubslifestyle',
      brand: 'ubs',
      variant: '2026',
      location: '',
      sell_price: [2_483_400, 2_490_900][i]!,
      buyback_price: [2_285_000, 2_288_000][i]!,
      source_updated_at: null,
    }),
  ),
];

function input(over: Partial<BuildInput> = {}): BuildInput {
  return {
    builtAt: new Date('2026-11-01T03:00:00Z'),
    prices,
    macro: [],
    spot: null,
    sources,
    status: {},
    catalog,
    events: [{ date: '2008-09-15', label: 'Krisis keuangan global', kind: 'crisis' }],
    ...over,
  };
}

function parseOut<T>(files: { path: string; content: string }[], path: string): T {
  const f = files.find((x) => x.path === path);
  if (!f) throw new Error(`tidak ada ${path}`);
  return JSON.parse(f.content) as T;
}

describe('series ringkas', () => {
  it('menulis fields + rows per source × brand, terurut date/variant/w', () => {
    const { files } = buildOutputs(input());
    const lm = parseOut<SeriesFile>(files, 'series/logammulia-antam.json');
    expect(lm.fields).toEqual(['date', 'variant', 'w', 'sell', 'buyback']);
    expect(lm.location).toBe('jakarta');
    expect(lm.rows).toEqual([
      ['2026-10-30', '', 1, 2546000, 2341000],
      ['2026-10-31', '', 0.5, 1323000, null],
      ['2026-10-31', '', 1, 2526000, 2276000],
    ]);
  });

  it('Tabungan Emas ke file sendiri dengan harga per 0,01 g apa adanya', () => {
    const { files } = buildOutputs(input());
    const tab = parseOut<SeriesFile>(files, 'series/pegadaian-pegadaian.json');
    expect(tab.product).toBe('gold_savings');
    expect(tab.rows.at(-1)).toEqual(['2026-10-31', '', 0.01, 23600, 22770]);
  });

  it('daftar file dan CSV unduhan', () => {
    const { files } = buildOutputs(input());
    expect(files.map((f) => f.path)).toEqual([
      'csv/logammulia-antam.csv',
      'csv/pegadaian-galeri24.csv',
      'csv/pegadaian-pegadaian.csv',
      'csv/ubslifestyle-ubs.csv',
      'latest.json',
      'meta.json',
      'series/logammulia-antam.json',
      'series/pegadaian-galeri24.json',
      'series/pegadaian-pegadaian.json',
      'series/ubslifestyle-ubs.json',
    ]);
    const csv = files.find((f) => f.path === 'csv/logammulia-antam.csv')!.content;
    expect(csv.split('\n')[0]).toBe(
      'date,source,brand,product,variant,weight_g,location,sell_price,buyback_price,source_updated_at,scraped_at,run_id,origin',
    );
    expect(csv.trim().split('\n')).toHaveLength(4);
  });

  it('menolak dua lokasi dalam satu file', () => {
    expect(() => groupByFile([price({ date: '2026-10-30' }), price({ date: '2026-10-31', location: 'surabaya' })])).toThrow(/lokasi/);
  });

  it('toSeriesFile tidak mengubah nilai', () => {
    const [g] = groupByFile([price({ date: '2026-10-31', sell_price: null })]);
    expect(toSeriesFile(g!).rows).toEqual([['2026-10-31', '', 1, null, 2350000]]);
  });

  it('output deterministik', () => {
    const a = buildOutputs(input());
    const b = buildOutputs(input({ prices: [...prices].reverse() }));
    expect(b.files).toEqual(a.files);
  });
});

describe('perhitungan', () => {
  it('perubahan abs + persen', () => {
    expect(computeChange(2_526_000, 2_546_000)).toEqual({ abs: -20000, pct: -0.7855 });
    expect(computeChange(null, 2_546_000)).toBeNull();
    expect(computeChange(1, null)).toBeNull();
  });

  it('spread hanya bila buyback ada', () => {
    expect(computeSpread(2_526_000, 2_276_000)).toEqual({ spread: 250000, spread_pct: 9.8971 });
    expect(computeSpread(2_443_000, null)).toEqual({ spread: null, spread_pct: null });
  });

  it('spark 30 hari kalender dengan celah null', () => {
    const s = buildSpark(
      [
        { date: '2026-10-02', sell_price: 1, buyback_price: null },
        { date: '2026-10-31', sell_price: 3, buyback_price: null },
      ],
      '2026-10-31',
    );
    expect(s.start).toBe('2026-10-02');
    expect(s.sell).toHaveLength(30);
    expect(s.sell[0]).toBe(1);
    expect(s.sell[1]).toBeNull();
    expect(s.sell[29]).toBe(3);
    expect(s.buyback).toBeNull();
  });
});

describe('latest.json', () => {
  const { latest } = buildOutputs(input());

  it('series terbaru dengan prev, perubahan, spread', () => {
    const lm = latest.series.find((s) => s.key === 'logammulia:antam:gold_bar::1')!;
    expect(lm).toMatchObject({
      date: '2026-10-31',
      sell: 2526000,
      buyback: 2276000,
      prev: { date: '2026-10-30', sell: 2546000, buyback: 2341000 },
      change: { sell: { abs: -20000, pct: -0.7855 }, buyback: { abs: -65000, pct: -2.7766 } },
      spread_pct: 9.8971,
      current: true,
      source_updated_at: '2026-10-31T08:30:00+07:00',
    });
    const half = latest.series.find((s) => s.key === 'logammulia:antam:gold_bar::0.5')!;
    expect(half.prev).toBeNull();
    expect(half.change).toEqual({ sell: null, buyback: null });
    expect(half.spread_pct).toBeNull();
  });

  it('seri UBS backfill tidak current', () => {
    const old = latest.series.find((s) => s.key === 'ubslifestyle:ubs:gold_bar::1')!;
    expect(old.current).toBe(false);
  });

  it('kartu Tabungan Emas per gram (harga ÷ 0,01)', () => {
    const tab = latest.highlights.find((h) => h.file === 'pegadaian-pegadaian')!;
    expect(tab).toMatchObject({
      kind: 'tabungan',
      display: 'per_gram',
      w: 0.01,
      sell: 2360000,
      buyback: 2277000,
      prev: { date: '2026-10-30', sell: 2409000, buyback: 2324000 },
      change: { sell: { abs: -49000, pct: -2.034 } },
      spread: 83000,
    });
    expect(tab.spark.sell.at(-1)).toBe(2360000);
    // Series mentah tetap per 0,01 g.
    const raw = latest.series.find((s) => s.key === tab.series_key)!;
    expect(raw.sell).toBe(23600);
  });

  it('kartu UBS: tahun produksi terbaru, buyback spark disambung dari variant kosong', () => {
    const ubs = latest.highlights.find((h) => h.file === 'ubslifestyle-ubs')!;
    expect(ubs).toMatchObject({ variant: '2026', display: 'keping_1g', sell: 2490900 });
    expect(ubs.spark.end).toBe('2026-10-27');
    expect(ubs.spark.spliced_from).toBe('');
    const bb = ubs.spark.buyback!;
    expect(bb.slice(-5)).toEqual([2291000, 2288000, null, 2285000, 2288000]);
  });

  it('urutan kartu mengikuti mockup dan sumber per tanggal', () => {
    expect(latest.highlights.map((h) => h.file)).toEqual([
      'logammulia-antam',
      'ubslifestyle-ubs',
      'pegadaian-galeri24',
      'pegadaian-pegadaian',
    ]);
    expect(latest.as_of).toBe('2026-10-31');
    expect(latest.sources.find((s) => s.source === 'ubslifestyle')).toEqual({
      source: 'ubslifestyle',
      last_data_date: '2026-10-27',
      source_updated_at: null,
    });
  });
});

describe('makro kosong', () => {
  it('tidak crash; spot null, tanpa file makro, unduhan ritel saja', () => {
    const { latest, meta, files } = buildOutputs(input());
    expect(latest.spot).toBeNull();
    expect(files.some((f) => f.path.startsWith('macro/'))).toBe(false);
    expect(meta.macro.map((m) => [m.id, m.rows, m.json])).toEqual([
      ['xau_usd_oz', 0, null],
      ['usd_idr_jisdor', 0, null],
      ['usd_idr_annual', 0, null],
    ]);
    expect(meta.downloads.every((d) => d.group === 'retail')).toBe(true);
  });

  it('tanpa data harga sama sekali', () => {
    const { latest, meta } = buildOutputs(input({ prices: [] }));
    expect(latest.as_of).toBeNull();
    expect(latest.series).toEqual([]);
    expect(meta.downloads).toEqual([]);
  });
});

describe('makro ada', () => {
  const spot: SpotSnapshot = {
    fetched_at: '2026-10-31T09:41:10Z',
    xau_usd_oz: 4125.3,
    usd_idr: 18069,
    usd_idr_series: 'usd_idr_jisdor',
    usd_idr_date: '2026-10-30',
    source: 'xaus',
    stale: false,
  };
  const macroRows = [
    macro({ date: '2026-10-30', series: 'xau_usd_oz', value: 4100 }),
    macro({ date: '2026-10-01', series: 'xau_usd_oz', frequency: 'M', value: 4000, source: 'worldbank' }),
    macro({ date: '2026-10-30', series: 'usd_idr_jisdor', value: 18000 }),
    macro({ date: '1998-01-01', series: 'usd_idr_annual', frequency: 'A', value: 10013.62, source: 'wdi' }),
  ];
  const { latest, meta, files } = buildOutputs(input({ macro: macroRows, spot }));

  it('macro/{series}.json + csv', () => {
    const xau = parseOut<MacroFile>(files, 'macro/xau_usd_oz.json');
    expect(xau.fields).toEqual(['date', 'frequency', 'value', 'source']);
    expect(xau.rows).toEqual([
      ['2026-10-01', 'M', 4000, 'worldbank'],
      ['2026-10-30', 'D', 4100, 'xaus'],
    ]);
    expect(files.some((f) => f.path === 'csv/usd_idr_jisdor.csv')).toBe(true);
  });

  it('spot + premi Antam vs penutupan sebelum tanggal harga', () => {
    expect(latest.spot!.idr_gram).toBeCloseTo((4125.3 * 18069) / 31.1034768, 2);
    const gram = (4100 * 18000) / 31.1034768;
    expect(latest.spot!.premium_antam).toEqual({
      date: '2026-10-31',
      sell: 2526000,
      spot_date: '2026-10-30',
      pct: Math.round((2526000 / gram - 1) * 100 * 1e4) / 1e4,
    });
  });

  it('kartu unduhan makro; seri tahunan statis', () => {
    const macroDl = meta.downloads.filter((d) => d.group === 'macro');
    expect(macroDl.map((d) => [d.id, d.static, d.last])).toEqual([
      [
        'xau_usd_oz',
        false,
        { kind: 'macro', series: 'xau_usd_oz', date: '2026-10-30', frequency: 'D', value: 4100, unit: 'USD/ozt' },
      ],
      [
        'usd_idr_jisdor',
        false,
        { kind: 'macro', series: 'usd_idr_jisdor', date: '2026-10-30', frequency: 'D', value: 18000, unit: 'IDR/USD' },
      ],
      [
        'usd_idr_annual',
        true,
        { kind: 'macro', series: 'usd_idr_annual', date: '1998-01-01', frequency: 'A', value: 10013.62, unit: 'IDR/USD' },
      ],
    ]);
    expect(macroDl[0]!.files[0]).toEqual({
      label: 'Emas dunia XAU/USD',
      json: 'macro/xau_usd_oz.json',
      csv: 'csv/xau_usd_oz.csv',
      rows: 2,
    });
  });
});

describe('meta.json', () => {
  const { meta } = buildOutputs(
    input({
      status: {
        logammulia: {
          last_run_id: '1-1',
          last_status: 'success',
          last_success_at: '2026-10-31T01:48:50Z',
          last_data_date: '2026-10-31',
          consecutive_failures: 0,
          updated_at: '2026-10-31T01:49:11Z',
        },
      },
    }),
  );

  it('versi, waktu build, status sumber dengan umur data', () => {
    expect(meta.schema_version).toBe(SCHEMA_VERSION);
    expect(meta.built_at).toBe('2026-11-01T03:00:00Z');
    expect(meta.sources[0]).toMatchObject({
      id: 'logammulia',
      label: 'Logam Mulia',
      last_data_date: '2026-10-31',
      data_age_days: 1,
      status: { last_status: 'success' },
    });
    expect(meta.sources[1]).toMatchObject({ id: 'xaus', status: null, data_age_days: null });
  });

  it('katalog aktif saja, berat terurut', () => {
    expect(meta.catalog.map((c) => [c.source, c.brand, c.weights])).toEqual([
      ['logammulia', 'antam', [0.5, 1]],
      ['pegadaian', 'pegadaian', [0.01]],
    ]);
  });

  it('series dengan cakupan tanggal', () => {
    const lm1 = meta.series.find((s) => s.key === 'logammulia:antam:gold_bar::1')!;
    expect(lm1).toMatchObject({ rows: 2, first_date: '2026-10-30', first_buyback_date: '2026-10-30' });
    const ubsOld = meta.series.find((s) => s.key === 'ubslifestyle:ubs:gold_bar::1')!;
    expect(ubsOld.first_sell_date).toBeNull();
  });

  it('kartu unduhan ritel per sumber × jenis produk', () => {
    expect(meta.downloads.map((d) => [d.id, d.label, d.color, d.files.length])).toEqual([
      ['logammulia-antam', 'Antam · Logam Mulia', 'antam', 1],
      ['ubslifestyle-ubs', 'UBS · UBS Lifestyle', 'ubs', 1],
      ['pegadaian-galeri24', 'Galeri24 · Pegadaian', 'g24', 1],
      ['pegadaian-pegadaian', 'Tabungan Emas · Pegadaian', 'tab', 1],
    ]);
    const tab = meta.downloads.find((d) => d.id === 'pegadaian-pegadaian')!;
    expect(tab.last).toMatchObject({ w: 0.01, sell: 23600, buyback: 22770 });
    expect(meta.events).toHaveLength(1);
  });

  it('Pegadaian batangan beberapa brand digabung; Galeri24 jadi angka utama', () => {
    const extra = price({
      date: '2026-10-31',
      source: 'pegadaian',
      brand: 'antam',
      location: '',
      sell_price: 2_564_000,
      buyback_price: null,
    });
    const { meta: m } = buildOutputs(input({ prices: [...prices, extra] }));
    const pg = m.downloads.find((d) => d.id === 'pegadaian-fisik')!;
    expect(pg.label).toBe('Emas batangan · Pegadaian');
    expect(pg.color).toBe('g24');
    expect(pg.files.map((f) => f.label)).toEqual(['Galeri24', 'Antam']);
    expect(pg.last).toMatchObject({ brand: 'galeri24', sell: 2443000, buyback: null });
  });
});
