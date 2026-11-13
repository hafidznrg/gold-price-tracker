import { describe, expect, it } from 'vitest';
import { FALLBACK_TOKENS, isoToTime } from './chart-theme';
import {
  alignBand,
  BAND_FILL_ID,
  BAND_LOWER_ID,
  buildGapMarkArea,
  buildTimeSeriesOption,
  dataExtent,
  percentToTime,
  toSeriesData,
  tooltipRows,
  visibleSpanDays,
  type TimeSeries,
} from './time-series-option';

const T = isoToTime;
const lookup = (n: string) => ({ antam: '#ddb563', ubs: '#7ea8ff' })[n] ?? '';

const sell: TimeSeries = {
  id: 'sell',
  label: 'Antam jual',
  color: 'antam',
  points: [
    ['2026-10-22', 100],
    ['2026-10-23', 101],
    ['2026-10-24', 102],
    ['2026-10-26', 103],
    ['2026-10-27', null],
    ['2026-10-28', 105],
  ],
};
const buy: TimeSeries = {
  id: 'buy',
  label: 'Antam buyback',
  color: 'antam',
  dashed: true,
  points: [
    ['2026-10-23', 90],
    ['2026-10-26', 92],
    ['2026-10-28', 93],
  ],
};

describe('toSeriesData', () => {
  it('mengurutkan, membuang tanggal tak valid, dan mempertahankan null', () => {
    const d = toSeriesData([
      ['2026-10-02', 2],
      ['x', 9],
      ['2026-10-01', 1],
      ['2026-10-03', null],
    ]);
    expect(d).toEqual([
      [T('2026-10-01'), 1],
      [T('2026-10-02'), 2],
      [T('2026-10-03'), null],
    ]);
  });
  it('menolkan titik di dalam celah', () => {
    const d = toSeriesData(sell.points, [{ from: '2026-10-24', to: '2026-10-25' }]);
    expect(d.find((x) => x[0] === T('2026-10-24'))?.[1]).toBeNull();
  });
  it('menyisipkan null bila seri melintasi celah tanpa titik di dalamnya', () => {
    const d = toSeriesData(buy.points, [{ from: '2026-10-24', to: '2026-10-25' }]);
    expect(d).toContainEqual([T('2026-10-24'), null]);
    expect(d.map((x) => x[0])).toEqual([...d.map((x) => x[0])].sort((a, b) => a - b));
  });
  it('tidak menyisipkan null bila celah di luar rentang seri (seri pendek mulai dari tanggal pertamanya)', () => {
    const d = toSeriesData(buy.points, [{ from: '2026-10-01', to: '2026-10-02' }]);
    expect(d).toHaveLength(3);
  });
});

describe('band, extent, zoom', () => {
  it('alignBand menghasilkan dasar + selisih pada gabungan tanggal', () => {
    const { base, diff } = alignBand(toSeriesData(sell.points), toSeriesData(buy.points));
    expect(base).toHaveLength(6);
    const at = (arr: typeof base, iso: string) => arr.find((x) => x[0] === T(iso))?.[1];
    expect(at(base, '2026-10-23')).toBe(90);
    expect(at(diff, '2026-10-23')).toBe(11);
    expect(at(diff, '2026-10-22')).toBeNull(); // buyback belum ada
    expect(at(diff, '2026-10-27')).toBeNull(); // jual kosong
  });
  it('dataExtent dan konversi persen → waktu', () => {
    const ext = dataExtent([toSeriesData(sell.points), toSeriesData(buy.points), []]);
    expect(ext).toEqual([T('2026-10-22'), T('2026-10-28')]);
    expect(dataExtent([[]])).toBeNull();
    expect(percentToTime(ext!, 50)).toBe(T('2026-10-25'));
    expect(percentToTime(ext!, 150)).toBe(T('2026-10-28'));
    expect(visibleSpanDays(ext, null)).toBe(6);
    expect(visibleSpanDays(ext, { start: T('2026-10-22'), end: T('2026-10-24') })).toBe(2);
  });
});

describe('buildGapMarkArea', () => {
  const ext: [number, number] = [T('2026-01-01'), T('2026-12-31')];
  it('melebarkan celah setengah hari di tiap sisi dan memasang arsir', () => {
    const ma = buildGapMarkArea(
      [{ from: '2026-10-24', to: '2026-10-25', label: 'Tanpa data' }],
      ext,
      FALLBACK_TOKENS,
      'H',
    );
    type Edge = { xAxis: number; label: { align: string } };
    const [[a, b]] = ma!.data as [Edge, Edge][] as [[Edge, Edge]];
    expect(a.xAxis).toBe(T('2026-10-24') - 43_200_000);
    expect(b.xAxis).toBe(T('2026-10-25') + 43_200_000);
    expect(ma!.itemStyle).toMatchObject({
      color: 'H',
      borderType: 'dashed',
      borderColor: FALLBACK_TOKENS.goldline,
    });
    expect(a.label.align).toBe('right'); // celah di paruh kanan → label di kiri
  });
  it('label di kanan untuk celah di paruh kiri; abaikan celah tak valid', () => {
    const ma = buildGapMarkArea(
      [
        { from: '2026-02-01', to: '2026-02-03', label: 'x' },
        { from: '2026-03-05', to: '2026-03-01' },
      ],
      ext,
      FALLBACK_TOKENS,
    );
    expect(ma!.data).toHaveLength(1);
    type Edge = { label: { align: string } };
    const [[a]] = ma!.data as [Edge, Edge][] as [[Edge, Edge]];
    expect(a.label.align).toBe('left');
    expect(buildGapMarkArea([], ext, FALLBACK_TOKENS)).toBeUndefined();
  });
  it('gaya subtle: arsir tanpa garis tepi dan tanpa label', () => {
    const ma = buildGapMarkArea(
      [{ from: '2026-10-24', to: '2026-10-25', label: 'Tidak ada data' }],
      ext,
      FALLBACK_TOKENS,
      'H',
      'subtle',
    );
    expect(ma!.itemStyle).toMatchObject({ color: 'H', borderWidth: 0 });
    type Edge = { label: { show: boolean } };
    const [[a]] = ma!.data as [Edge, Edge][] as [[Edge, Edge]];
    expect(a.label.show).toBe(false);
  });
});

describe('tooltipRows', () => {
  const s = [
    { label: 'A', color: '#a', data: toSeriesData(sell.points) },
    { label: 'B', color: '#b', data: toSeriesData(buy.points) },
  ];
  const fmt = (v: number | null) => (v === null ? '—' : String(v));
  it('menyembunyikan seri sebelum tanggal pertamanya', () => {
    expect(tooltipRows(T('2026-10-22'), s, fmt).map((r) => r.label)).toEqual(['A']);
  });
  it('menampilkan "—" untuk hari tanpa data di dalam rentang seri', () => {
    expect(tooltipRows(T('2026-10-27'), s, fmt)).toEqual([
      { label: 'A', color: '#a', value: '—', muted: true },
      { label: 'B', color: '#b', value: '—', muted: true },
    ]);
  });
});

describe('buildTimeSeriesOption', () => {
  const base = { tokens: FALLBACK_TOKENS, lookup };
  type Line = {
    id: string;
    connectNulls: boolean;
    stack?: string;
    markArea?: unknown;
    areaStyle?: { color: string };
    lineStyle: { color: string; type: unknown };
  };
  it('garis: warna token, putus-putus untuk buyback, null tidak disambung', () => {
    const { option } = buildTimeSeriesOption({ ...base, series: [sell, buy] });
    const series = option.series as Line[];
    expect(series.map((s) => s.id)).toEqual(['sell', 'buy']);
    expect(series[0]!.lineStyle).toMatchObject({ color: '#ddb563', type: 'solid' });
    expect(series[1]!.lineStyle.type).toEqual([5, 4]);
    expect(series.every((s) => s.connectNulls === false)).toBe(true);
    expect(option.useUTC).toBe(true);
    expect(option.dataZoom).toEqual([]);
  });
  it('gaya grid/sumbu dari token', () => {
    const { option } = buildTimeSeriesOption({ ...base, series: [sell] });
    const y = option.yAxis as {
      splitLine: { lineStyle: { color: string } };
      axisLabel: { color: string; formatter: (v: number) => string };
    };
    expect(y.splitLine.lineStyle.color).toBe(FALLBACK_TOKENS.grid);
    expect(y.axisLabel.color).toBe(FALLBACK_TOKENS.faint);
    expect(y.axisLabel.formatter(2_350_000)).toBe('Rp2,35 jt');
    const x = option.xAxis as { axisLabel: { formatter: (v: number) => string } };
    expect(x.axisLabel.formatter(T('2026-10-26'))).toBe('26 Okt');
  });
  it('band menambah dua seri bantu bertumpuk di bawah garis', () => {
    const { option } = buildTimeSeriesOption({
      ...base,
      series: [sell, buy],
      band: { upper: 'sell', lower: 'buy' },
    });
    const series = option.series as Line[];
    expect(series.slice(0, 2).map((s) => s.id)).toEqual([BAND_LOWER_ID, BAND_FILL_ID]);
    expect(series[1]!.stack).toBe('__band');
    expect(series[1]!.areaStyle?.color).toBe(FALLBACK_TOKENS.goldsoft);
  });
  it('band diabaikan pada sumbu log', () => {
    const { option } = buildTimeSeriesOption({
      ...base,
      series: [sell, buy],
      band: { upper: 'sell', lower: 'buy' },
      yLog: true,
    });
    expect((option.series as unknown[]).length).toBe(2);
    expect((option.yAxis as { type: string }).type).toBe('log');
  });
  it('zoom: inside + slider dengan jendela yang dijepit ke rentang data', () => {
    const { option } = buildTimeSeriesOption({
      ...base,
      series: [sell],
      showZoom: true,
      zoom: { start: T('2026-01-01'), end: T('2026-10-24') },
    });
    const dz = option.dataZoom as {
      type: string;
      startValue?: number;
      endValue?: number;
      fillerColor?: string;
    }[];
    expect(dz.map((d) => d.type)).toEqual(['inside', 'slider']);
    expect(dz[1]!.startValue).toBe(T('2026-10-22'));
    expect(dz[1]!.endValue).toBe(T('2026-10-24'));
    expect(dz[1]!.fillerColor).toBe(FALLBACK_TOKENS.goldsoft);
  });
  it('compact (HP) menyembunyikan navigator slider, zoom di dalam grafik tetap', () => {
    const { option } = buildTimeSeriesOption({
      ...base,
      series: [sell],
      showZoom: true,
      compact: true,
    });
    expect((option.dataZoom as { type: string }[]).map((d) => d.type)).toEqual(['inside']);
  });
  it('compact mengurangi jumlah label', () => {
    const { option } = buildTimeSeriesOption({ ...base, series: [sell], compact: true });
    expect((option.xAxis as { splitNumber: number }).splitNumber).toBe(3);
  });
  it('markArea celah dipasang pada seri pertama; tooltip memakai format Rp', () => {
    const { option } = buildTimeSeriesOption({
      ...base,
      series: [sell, buy],
      gaps: [{ from: '2026-10-25', to: '2026-10-25', label: 'Celah' }],
    });
    const series = option.series as Line[];
    expect(series[0]!.markArea).toBeDefined();
    expect(series[1]!.markArea).toBeUndefined();
    const tip = option.tooltip as { formatter: (p: unknown) => string };
    const html = tip.formatter([{ axisValue: T('2026-10-26') }]);
    expect(html).toContain('Sen, 26 Okt 2026');
    expect(html).toContain('Rp103');
    expect(html).toContain('Rp92');
  });
});
