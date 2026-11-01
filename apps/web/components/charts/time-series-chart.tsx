'use client';

import type { EChartsType, ImagePatternObject } from 'echarts/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChartLegend, type LegendItem } from './chart-legend';
import {
  type ChartTokens,
  cssVarLookup,
  formatAxisDate,
  isoToTime,
  readTokens,
  spanBucket,
  timeToIso,
  type ValueFormat,
} from './chart-theme';
import {
  buildTimeSeriesOption,
  type ChartBand,
  type ChartGap,
  type ChartRange,
  percentToTime,
  type TimeSeries,
  visibleSpanDays,
} from './time-series-option';
import { useThemeAttribute } from './use-theme-attribute';

export type {
  ChartBand,
  ChartGap,
  ChartRange,
  SeriesPoint,
  TimeSeries,
} from './time-series-option';

export interface TimeSeriesChartProps {
  series: TimeSeries[];
  /** Format nilai: 'rupiah' (default; sumbu "Rp2,35 jt", tooltip "Rp2.345.000"), 'percent', 'number', atau fungsi. */
  valueFormat?: ValueFormat;
  /** Tinggi area grafik (px), termasuk navigator bila `showZoom`. Default 380. */
  height?: number;
  /** Navigator rentang (slider) + zoom gulir/geser di dalam grafik. */
  showZoom?: boolean;
  /** Rentang tanpa data → area berarsir + label. */
  gaps?: ChartGap[];
  /** Band terisi antara dua seri (lihat <SpreadBandChart>). */
  band?: ChartBand;
  /** Sumbu Y logaritmik (Kelipatan). Band diabaikan pada skala log. */
  yLog?: boolean;
  /** Jendela zoom terkendali (tanggal ISO). Diterapkan saat nilainya berubah. */
  range?: ChartRange;
  /** Dipanggil saat pengguna zoom/geser (tanggal ISO, dibulatkan ke hari). */
  onRangeChange?: (range: ChartRange) => void;
  /** Posisi legenda HTML; `false` = tanpa legenda. Default 'top'. */
  legend?: 'top' | 'bottom' | false;
  /** Label aksesibel untuk grafik (role="img"). */
  ariaLabel?: string;
  /** Teks saat tidak ada data sama sekali. */
  emptyText?: string;
  className?: string;
}

const COMPACT_WIDTH = 520;

/** Pola arsir 135° (setara repeating-linear-gradient mockup) untuk markArea celah. */
function makeHatch(color: string): ImagePatternObject | string {
  if (typeof document === 'undefined') return color;
  const s = 8;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d');
  if (!ctx) return color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  for (const k of [-s, 0, s]) {
    ctx.moveTo(k, s);
    ctx.lineTo(k + s, 0);
  }
  ctx.stroke();
  return { image: c, repeat: 'repeat' };
}

/**
 * Grafik deret waktu multi-seri berbasis ECharts (tree-shaken, dimuat dinamis).
 * Hari tanpa data (`null`) memutus garis; warna dan gaya mengikuti token tema dan
 * dirender ulang saat `data-theme` berganti.
 */
export function TimeSeriesChart({
  series,
  valueFormat = 'rupiah',
  height = 380,
  showZoom = false,
  gaps,
  band,
  yLog = false,
  range,
  onRangeChange,
  legend = 'top',
  ariaLabel,
  emptyText = 'Belum ada data untuk ditampilkan.',
  className,
}: TimeSeriesChartProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const extentRef = useRef<[number, number] | null>(null);
  const zoomRef = useRef<{ start: number; end: number } | null>(null);
  const bucketRef = useRef<number>(-1);
  const onRangeRef = useRef(onRangeChange);
  const [ready, setReady] = useState(false);
  const [compact, setCompact] = useState(false);
  const theme = useThemeAttribute();

  useEffect(() => {
    onRangeRef.current = onRangeChange;
  }, [onRangeChange]);

  const hasData = series.some((s) => s.points.some((p) => p[1] !== null));

  // Inisialisasi sekali: muat echarts secara dinamis, pasang ResizeObserver, buang saat unmount.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let disposed = false;
    let chart: EChartsType | null = null;

    let initFn: typeof import('./echarts-setup').init | null = null;

    // Init ditunda sampai wadah punya ukuran (mis. tab tersembunyi / flex 0 px).
    const tryInit = () => {
      if (chart || disposed || !initFn || el.clientWidth === 0 || el.clientHeight === 0) return;
      const c = initFn(el, undefined, { renderer: 'canvas' });
      chart = c;
      chartRef.current = c;
      c.on('datazoom', (evt: unknown) => {
        const ext = extentRef.current;
        if (!ext) return;
        const e = evt as {
          start?: number;
          end?: number;
          startValue?: number;
          endValue?: number;
          batch?: { start?: number; end?: number; startValue?: number; endValue?: number }[];
        };
        const p = e.batch?.[0] ?? e;
        const start =
          p.startValue ?? (p.start !== undefined ? percentToTime(ext, p.start) : ext[0]);
        const end = p.endValue ?? (p.end !== undefined ? percentToTime(ext, p.end) : ext[1]);
        zoomRef.current = { start, end };
        const span = visibleSpanDays(ext, zoomRef.current);
        const b = spanBucket(span);
        if (b !== bucketRef.current) {
          bucketRef.current = b;
          c.setOption({
            xAxis: { axisLabel: { formatter: (v: number) => formatAxisDate(v, span) } },
          });
        }
        onRangeRef.current?.({ from: timeToIso(start), to: timeToIso(end) });
      });
      setReady(true);
    };

    const ro = new ResizeObserver(() => {
      setCompact(el.clientWidth < COMPACT_WIDTH);
      if (chart) chart.resize();
      else tryInit();
    });
    ro.observe(el);
    setCompact(el.clientWidth < COMPACT_WIDTH);

    import('./echarts-setup').then(({ init }) => {
      initFn = init;
      tryInit();
    });

    return () => {
      disposed = true;
      ro.disconnect();
      chart?.dispose();
      chartRef.current = null;
    };
  }, []);

  const rangeFrom = range?.from;
  const rangeTo = range?.to;

  // Bangun ulang opsi saat data, tema, atau lebar (compact) berubah. Jendela zoom dipertahankan.
  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    const lookup = cssVarLookup();
    const tokens: ChartTokens = readTokens(lookup);
    const { option, extent } = buildTimeSeriesOption({
      series,
      tokens,
      lookup,
      valueFormat,
      gaps,
      band,
      yLog,
      showZoom,
      compact,
      zoom: zoomRef.current,
      hatch: makeHatch(tokens.goldsoft),
    });
    extentRef.current = extent;
    bucketRef.current = spanBucket(visibleSpanDays(extent, zoomRef.current));
    chart.setOption(option, { notMerge: true });
  }, [ready, series, valueFormat, gaps, band, yLog, showZoom, compact, theme]);

  // Rentang terkendali dari luar (mis. tombol 7H–Semua / URL).
  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart || !rangeFrom || !rangeTo) return;
    const start = isoToTime(rangeFrom);
    const end = isoToTime(rangeTo);
    if (Number.isNaN(start) || Number.isNaN(end)) return;
    const cur = zoomRef.current;
    if (cur && timeToIso(cur.start) === rangeFrom && timeToIso(cur.end) === rangeTo) return;
    zoomRef.current = { start, end };
    if (showZoom) {
      chart.dispatchAction({ type: 'dataZoom', startValue: start, endValue: end });
    }
  }, [ready, rangeFrom, rangeTo, showZoom]);

  const legendItems = useMemo<LegendItem[]>(() => {
    const items: LegendItem[] = series.map((s) => ({
      label: s.label,
      color: s.color,
      dashed: s.dashed,
    }));
    if (band && !yLog)
      items.push({ label: band.label ?? 'Spread', color: band.color ?? 'goldsoft', swatch: 'box' });
    return items;
  }, [series, band, yLog]);

  const legendEl = legend ? (
    <ChartLegend items={legendItems} className={legend === 'top' ? 'mb-4' : 'mt-4'} />
  ) : null;

  return (
    <div className={cn('min-w-0', className)}>
      {legend === 'top' && legendEl}
      <div className="relative w-full" style={{ height }}>
        <div
          ref={elRef}
          role="img"
          aria-label={ariaLabel ?? `Grafik ${series.map((s) => s.label).join(', ')}`}
          className="absolute inset-0"
        />
        {!hasData && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-faint">
            {emptyText}
          </div>
        )}
      </div>
      {legend === 'bottom' && legendEl}
    </div>
  );
}
