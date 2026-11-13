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
  type ChartEvent,
  type ChartGap,
  type ChartRange,
  type GapStyle,
  percentToTime,
  type TimeSeries,
  visibleSpanDays,
} from './time-series-option';
import { useThemeAttribute } from './use-theme-attribute';

export type {
  ChartBand,
  ChartEvent,
  ChartGap,
  ChartRange,
  GapStyle,
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
  /** Gaya penanda celah: `annotated` (default, Explorer) atau `subtle` (arsir netral tanpa label). */
  gapStyle?: GapStyle;
  /** Band terisi antara dua seri (lihat <SpreadBandChart>). */
  band?: ChartBand;
  /** Sumbu Y logaritmik (Kelipatan). Band diabaikan pada skala log. */
  yLog?: boolean;
  /** Anotasi peristiwa (`markLine` vertikal) — hanya yang jatuh di rentang data. */
  events?: ChartEvent[];
  /** Garis acuan horizontal (mis. ×1). */
  baseline?: number;
  /** Tick sumbu Y yang dipaksakan + batas sumbu (skala log, mis. 1, 2, 5, 10). */
  yTicks?: number[];
  yMin?: number;
  yMax?: number;
  /** Ruang kanan grid untuk label ujung garis (px). */
  gridRight?: number;
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

/** Jalankan saat utas utama senggang (fallback setTimeout); batas tunggu 1,5 dtk. */
function idle(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1500 });
  else setTimeout(fn, 200);
}

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
  gapStyle = 'annotated',
  band,
  yLog = false,
  events,
  baseline,
  yTicks,
  yMin,
  yMax,
  gridRight,
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

    // ECharts (~150 KB) hanya dimuat saat wadah mendekati viewport dan browser sedang senggang,
    // lalu inisialisasi diberi jeda agar tidak menumpuk jadi satu tugas panjang di utas utama.
    let loadStarted = false;
    const load = () => {
      if (loadStarted || disposed) return;
      loadStarted = true;
      idle(() => {
        import('./echarts-setup').then(({ init }) => {
          if (disposed) return;
          initFn = init;
          setTimeout(tryInit, 0);
        });
      });
    };
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'undefined') load();
    else {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io?.disconnect();
            load();
          }
        },
        { rootMargin: '400px 0px' },
      );
      io.observe(el);
    }

    return () => {
      disposed = true;
      io?.disconnect();
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
      events,
      baseline,
      yTicks,
      yMin,
      yMax,
      gridRight,
      showZoom,
      compact,
      zoom: zoomRef.current,
      hatch: makeHatch(gapStyle === 'subtle' ? tokens.line : tokens.goldsoft),
      gapStyle,
    });
    extentRef.current = extent;
    bucketRef.current = spanBucket(visibleSpanDays(extent, zoomRef.current));
    chart.setOption(option, { notMerge: true });
  }, [
    ready,
    series,
    valueFormat,
    gaps,
    gapStyle,
    band,
    yLog,
    events,
    baseline,
    yTicks,
    yMin,
    yMax,
    gridRight,
    showZoom,
    compact,
    theme,
  ]);

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
    const items: LegendItem[] = series
      .filter((s) => s.legend !== false)
      .map((s) => ({
        label: s.legendLabel ?? s.label,
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
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-faint">
            {emptyText}
          </div>
        )}
      </div>
      {legend === 'bottom' && legendEl}
    </div>
  );
}
