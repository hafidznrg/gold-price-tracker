/**
 * Pembangun opsi ECharts untuk <TimeSeriesChart> — murni (tanpa DOM, tanpa impor runtime
 * echarts) sehingga bisa diuji dengan vitest. Konvensi visual: plan/mockup/README.md.
 */
import type { LineSeriesOption } from 'echarts/charts';
import type {
  DataZoomComponentOption,
  GridComponentOption,
  MarkAreaComponentOption,
  MarkLineComponentOption,
  MarkPointComponentOption,
  TooltipComponentOption,
} from 'echarts/components';
import type { ComposeOption, ImagePatternObject } from 'echarts/core';
import {
  axisLabelStyle,
  type ChartTokens,
  type CssVarLookup,
  DAY_MS,
  formatAxisDate,
  formatDateShort,
  formatTooltipDate,
  isoToTime,
  resolveColor,
  tooltipBoxStyle,
  tooltipHtml,
  type TooltipRow,
  type ValueFormat,
  valueFormatters,
} from './chart-theme';

export type ChartOption = ComposeOption<
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
  | MarkAreaComponentOption
  | MarkLineComponentOption
  | MarkPointComponentOption
>;

/** Satu titik: tanggal ISO "YYYY-MM-DD" dan nilai; `null` = hari tanpa data (garis putus). */
export type SeriesPoint = [isoDate: string, value: number | null];

export interface TimeSeries {
  id: string;
  label: string;
  /** Nama token CSS ("antam", "ubs", "g24", "tab", "gold", "muted"), `var(--x)`, atau warna literal. */
  color: string;
  /** Garis putus-putus — konvensi: buyback (Explorer) / harga di Pegadaian (Bandingkan). */
  dashed?: boolean;
  /** Isi area lembut di bawah garis. */
  area?: boolean;
  /** Tebal garis (default 2,2 solid / 1,8 putus-putus seperti mockup). */
  width?: number;
  /** Tandai titik terendah dengan bulatan + label (mis. "spread tersempit" di Spread). */
  highlightMin?: boolean;
  /** Pita min–maks per titik (agregasi mingguan/bulanan); digambar di bawah garis, tampil di tooltip. */
  envelope?: { min: SeriesPoint[]; max: SeriesPoint[] };
  /** Catatan tooltip per tanggal ISO (mis. "isi dari 2026-03-04" untuk titik forward-fill). */
  notes?: Record<string, string>;
  /** Label tebal di ujung kanan garis (mis. "×86,6" di Kelipatan). */
  endLabel?: string;
  /** Bulatan bertepi pada titik terakhir (mis. titik spot hari ini). */
  endDot?: boolean;
  /** Nama di legenda bila beda dari `label` (label dipakai tooltip). */
  legendLabel?: string;
  /** `false` = tidak masuk legenda (mis. ruas putus-putus yang berpasangan dengan garis utama). */
  legend?: false;
  /** Tooltip hanya untuk titik setelah tanggal ISO ini (menghindari baris ganda di titik sambungan). */
  tooltipAfter?: string;
  points: SeriesPoint[];
}

/** Peristiwa bertanggal: garis vertikal putus-putus + label (`markLine`), mis. dari events.yml. */
export interface ChartEvent {
  date: string;
  label: string;
}

/** Rentang tanpa data (inklusif). Digambar sebagai area berarsir + label, tidak disambung. */
export interface ChartGap {
  from: string;
  to: string;
  label?: string;
}

/** `annotated` = arsir emas + tepi putus-putus + label (Explorer); `subtle` = arsir netral saja. */
export type GapStyle = 'annotated' | 'subtle';

/** Band terisi di antara dua seri (Spread: jual di atas, buyback di bawah). */
export interface ChartBand {
  upper: string;
  lower: string;
  label?: string;
  /** Warna isi; default token `goldsoft`. */
  color?: string;
}

export interface ChartRange {
  from: string;
  to: string;
}

export type Datum = [time: number, value: number | null];

export interface BuildInput {
  series: TimeSeries[];
  tokens: ChartTokens;
  lookup: CssVarLookup;
  valueFormat?: ValueFormat;
  gaps?: ChartGap[];
  band?: ChartBand;
  yLog?: boolean;
  showZoom?: boolean;
  /** Lebar sempit (< 520 px): label sumbu lebih sedikit, navigator lebih pendek. */
  compact?: boolean;
  /** Jendela zoom saat ini (timestamp). `null` = seluruh data. */
  zoom?: { start: number; end: number } | null;
  /** Isi arsir celah: pola kanvas dari komponen, atau warna (uji / cadangan). */
  hatch?: string | ImagePatternObject;
  /** Gaya penanda celah; default `annotated`. */
  gapStyle?: GapStyle;
  /** Lebar kolom label sumbu Y (px). */
  yAxisWidth?: number;
  /** Anotasi peristiwa (hanya yang jatuh di rentang data). Dipasang pada seri pertama. */
  events?: ChartEvent[];
  /** Garis acuan horizontal tipis (mis. ×1 di Kelipatan). */
  baseline?: number;
  /** Nilai tick sumbu Y yang dipaksakan (skala log: 1, 2, 5, 10 …) beserta batas sumbunya. */
  yTicks?: number[];
  yMin?: number;
  yMax?: number;
  /** Ruang kanan grid untuk label ujung garis (px). */
  gridRight?: number;
}

export const BAND_LOWER_ID = '__band_lower';
export const BAND_FILL_ID = '__band_fill';
const HALF_DAY = DAY_MS / 2;

export function isHelperSeries(id: string | undefined): boolean {
  return !!id && id.startsWith('__band_');
}

/**
 * Titik ISO → data ECharts terurut. Titik di dalam celah dijadikan `null`, dan bila seri
 * melintasi celah tanpa titik di dalamnya, disisipkan satu `null` agar garis tidak tersambung.
 */
export function toSeriesData(points: SeriesPoint[], gaps: ChartGap[] = []): Datum[] {
  const data: Datum[] = [];
  for (const [iso, v] of points) {
    const t = isoToTime(iso);
    if (Number.isNaN(t)) continue;
    data.push([t, v === null || v === undefined || !Number.isFinite(v) ? null : v]);
  }
  data.sort((a, b) => a[0] - b[0]);
  if (!gaps.length || !data.length) return data;

  const first = data[0]![0];
  const last = data.at(-1)![0];
  for (const g of gaps) {
    const from = isoToTime(g.from);
    const to = isoToTime(g.to);
    if (Number.isNaN(from) || Number.isNaN(to)) continue;
    let inside = false;
    for (const d of data) {
      if (d[0] >= from && d[0] <= to) {
        d[1] = null;
        inside = true;
      }
    }
    if (!inside && from > first && to < last) data.push([from, null]);
  }
  data.sort((a, b) => a[0] - b[0]);
  return data;
}

/** Rentang waktu gabungan semua seri; `null` bila tidak ada data. */
export function dataExtent(all: Datum[][]): [number, number] | null {
  let mn = Infinity;
  let mx = -Infinity;
  for (const d of all) {
    const a = d[0];
    const b = d.at(-1);
    if (!a || !b) continue;
    if (a[0] < mn) mn = a[0];
    if (b[0] > mx) mx = b[0];
  }
  return mn === Infinity ? null : [mn, mx];
}

/**
 * Selaraskan dua seri pada gabungan tanggal → seri dasar (lower) dan selisih (upper − lower)
 * untuk ditumpuk. Tanggal yang salah satunya kosong → `null` (band ikut terputus).
 */
export function alignBand(upper: Datum[], lower: Datum[]): { base: Datum[]; diff: Datum[] } {
  const up = new Map(upper.map((d) => [d[0], d[1]]));
  const lo = new Map(lower.map((d) => [d[0], d[1]]));
  const times = [...new Set([...up.keys(), ...lo.keys()])].sort((a, b) => a - b);
  const base: Datum[] = [];
  const diff: Datum[] = [];
  for (const t of times) {
    const u = up.get(t);
    const l = lo.get(t);
    const ok = u !== null && u !== undefined && l !== null && l !== undefined;
    base.push([t, ok ? l : null]);
    diff.push([t, ok ? u - l : null]);
  }
  return { base, diff };
}

/**
 * markArea untuk celah.
 * - `annotated` (mockup Explorer): arsir + garis tepi putus-putus --goldline + label pil --gold.
 *   Label di kiri celah bila celah di paruh kanan grafik, selain itu di kanan.
 * - `subtle` (beranda): arsir netral tipis tanpa garis tepi dan tanpa label, agar celah tidak
 *   menyaingi garis harga; tooltip tetap menampilkan "—" untuk hari tanpa data.
 */
export function buildGapMarkArea(
  gaps: ChartGap[],
  extent: [number, number] | null,
  tokens: ChartTokens,
  hatch: string | ImagePatternObject = tokens.goldsoft,
  style: GapStyle = 'annotated',
): MarkAreaComponentOption | undefined {
  const items = gaps
    .map((g) => ({ g, from: isoToTime(g.from), to: isoToTime(g.to) }))
    .filter((x) => !Number.isNaN(x.from) && !Number.isNaN(x.to) && x.to >= x.from);
  if (!items.length) return undefined;
  const subtle = style === 'subtle';
  const mid = extent ? (extent[0] + extent[1]) / 2 : 0;
  return {
    silent: true,
    itemStyle: subtle
      ? { color: hatch, borderWidth: 0, opacity: 0.55 }
      : { color: hatch, borderColor: tokens.goldline, borderWidth: 1, borderType: 'dashed' },
    emphasis: { disabled: true },
    data: items.map(({ g, from, to }) => {
      const leftSide = (from + to) / 2 >= mid;
      return [
        {
          xAxis: from - HALF_DAY,
          label:
            g.label && !subtle
              ? {
                  show: true,
                  formatter: g.label,
                  position: leftSide ? [0, 8] : ['100%', 8],
                  align: leftSide ? 'right' : 'left',
                  verticalAlign: 'top',
                  offset: [leftSide ? -10 : 10, 0],
                  color: tokens.gold,
                  fontSize: 11.5,
                  fontFamily: tokens.fontFamily,
                  backgroundColor: tokens.surface,
                  borderColor: tokens.goldline,
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: [4, 8],
                }
              : { show: false },
        },
        { xAxis: to + HALF_DAY },
      ];
    }),
  } as MarkAreaComponentOption;
}

const EVENT_NEAR_MS = 365 * DAY_MS;

type EventPosition = 'insideEndTop' | 'insideStartTop';

/**
 * Posisi label peristiwa (label vertikal di sepanjang garis). Peristiwa yang berdekatan (< 1 tahun
 * dari sebelumnya) digeser bergantian ke ujung bawah garis supaya label tidak bertumpuk.
 */
export function eventPlacements(
  events: readonly ChartEvent[],
  extent: [number, number] | null,
): { time: number; label: string; position: EventPosition }[] {
  const items = events
    .map((e) => ({ time: isoToTime(e.date), label: e.label }))
    .filter(
      (e) => !Number.isNaN(e.time) && (!extent || (e.time >= extent[0] && e.time <= extent[1])),
    )
    .sort((a, b) => a.time - b.time);
  let prev: { time: number; position: EventPosition } | null = null;
  return items.map((e) => {
    const position: EventPosition =
      prev && e.time - prev.time < EVENT_NEAR_MS
        ? prev.position === 'insideEndTop'
          ? 'insideStartTop'
          : 'insideEndTop'
        : 'insideEndTop';
    prev = { time: e.time, position };
    return { ...e, position };
  });
}

/** markLine: garis peristiwa vertikal putus-putus + garis acuan horizontal tipis. */
export function buildEventMarkLine(
  events: readonly ChartEvent[],
  baseline: number | undefined,
  extent: [number, number] | null,
  tokens: ChartTokens,
): MarkLineComponentOption | undefined {
  const placed = eventPlacements(events, extent);
  if (!placed.length && baseline === undefined) return undefined;
  const data: unknown[] = placed.map((e) => ({
    xAxis: e.time,
    name: e.label,
    label: {
      show: true,
      formatter: e.label,
      position: e.position,
      rotate: 90,
      distance: 6,
      color: tokens.muted,
      fontSize: 11,
      fontFamily: tokens.fontFamily,
    },
  }));
  if (baseline !== undefined) {
    data.push({
      yAxis: baseline,
      lineStyle: { color: tokens.muted, type: 'solid', width: 1, opacity: 0.6 },
      label: { show: false },
    });
  }
  return {
    silent: true,
    symbol: 'none',
    animation: false,
    lineStyle: { color: tokens.faint, type: 'dashed', width: 1, opacity: 0.7 },
    emphasis: { disabled: true },
    data,
  } as MarkLineComponentOption;
}

/** Lebar jendela terlihat dalam hari (untuk format label sumbu X). */
export function visibleSpanDays(
  extent: [number, number] | null,
  zoom?: { start: number; end: number } | null,
): number {
  if (zoom) return Math.max(1, (zoom.end - zoom.start) / DAY_MS);
  if (extent) return Math.max(1, (extent[1] - extent[0]) / DAY_MS);
  return 30;
}

/** Ubah persen dataZoom (0–100) → timestamp pada rentang data. */
export function percentToTime(extent: [number, number], pct: number): number {
  return Math.round(extent[0] + ((extent[1] - extent[0]) * Math.min(100, Math.max(0, pct))) / 100);
}

/** Baris tooltip untuk satu tanggal: seri di luar rentangnya disembunyikan, celah = "—". */
export function tooltipRows(
  at: number,
  series: {
    label: string;
    color: string;
    dashed?: boolean;
    data: Datum[];
    /** Rentang min–maks (waktu → [min, maks]) dan catatan (waktu → teks), ditambahkan ke nilai. */
    envelope?: Map<number, [number, number]>;
    notes?: Map<number, string>;
  }[],
  fmt: (v: number | null) => string,
): TooltipRow[] {
  const rows: TooltipRow[] = [];
  for (const s of series) {
    const a = s.data[0];
    const b = s.data.at(-1);
    if (!a || !b || at < a[0] || at > b[0]) continue;
    const hit = s.data.find((d) => d[0] === at);
    const v = hit ? hit[1] : null;
    const env = v === null ? undefined : s.envelope?.get(at);
    const note = v === null ? undefined : s.notes?.get(at);
    const value =
      fmt(v) +
      (env ? ` · min–maks ${fmt(env[0])} – ${fmt(env[1])}` : '') +
      (note ? ` · ${note}` : '');
    rows.push({ label: s.label, color: s.color, dashed: s.dashed, value, muted: v === null });
  }
  return rows;
}

export const SLIDER_HEIGHT = 44;
export const SLIDER_HEIGHT_COMPACT = 34;

/** Opsi lengkap ECharts untuk grafik deret waktu. */
export function buildTimeSeriesOption(input: BuildInput): {
  option: ChartOption;
  extent: [number, number] | null;
} {
  const { tokens: t, lookup, compact = false, showZoom = false, yLog = false } = input;
  const gaps = input.gaps ?? [];
  const fmt = valueFormatters(input.valueFormat);
  const resolved = input.series.map((s) => ({
    ...s,
    rgb: resolveColor(s.color, lookup, t.muted),
    data: toSeriesData(s.points, gaps),
  }));
  const extent = dataExtent(resolved.map((s) => s.data));
  const zoom =
    input.zoom && extent
      ? {
          start: Math.max(extent[0], Math.min(input.zoom.start, extent[1])),
          end: Math.min(extent[1], Math.max(input.zoom.end, extent[0])),
        }
      : null;
  const span = visibleSpanDays(extent, zoom);

  const sliderH = compact ? SLIDER_HEIGHT_COMPACT : SLIDER_HEIGHT;
  // Navigator (slider) disembunyikan di grafik sempit/HP (D-54); rentang lewat chip, zoom tetap
  // lewat cubit/geser di dalam grafik.
  const showSlider = showZoom && !compact;
  const yw = input.yAxisWidth ?? (compact ? 58 : 72);
  const grid: GridComponentOption = {
    left: yw,
    right: input.gridRight ?? (compact ? 10 : 14),
    top: 14,
    bottom: showSlider ? sliderH + 46 : 30,
    outerBoundsMode: 'none',
  };

  const totalPoints = resolved.reduce((n, s) => n + s.data.length, 0);
  const markArea = buildGapMarkArea(gaps, extent, t, input.hatch, input.gapStyle);
  const markLine = buildEventMarkLine(input.events ?? [], input.baseline, extent, t);

  const lines: LineSeriesOption[] = resolved.map((s, i) => {
    const width = s.width ?? (s.dashed ? 1.8 : 2.2);
    const line: LineSeriesOption = {
      id: s.id,
      name: s.label,
      type: 'line',
      data: s.data,
      showSymbol: !!s.endDot,
      symbol: 'none',
      symbolSize: 10,
      connectNulls: false,
      z: 3,
      lineStyle: {
        color: s.rgb,
        width,
        type: s.dashed ? [5, 4] : 'solid',
        cap: 'round',
        join: 'round',
      },
      itemStyle: { color: s.rgb, borderColor: t.surface, borderWidth: 3 },
      emphasis: { scale: false, lineStyle: { width } },
    };
    if (s.area) line.areaStyle = { color: s.rgb, opacity: 0.12 };
    if (s.endDot && s.data.length > 0) {
      // Hanya titik terakhir yang diberi bulatan; titik lain tetap tanpa simbol.
      const lastIdx = s.data.length - 1;
      line.data = s.data.map((d, k) =>
        k === lastIdx
          ? {
              value: d,
              symbol: 'circle',
              symbolSize: 12,
              itemStyle: { color: t.surface, borderColor: s.rgb, borderWidth: 2.5 },
            }
          : d,
      ) as LineSeriesOption['data'];
    }
    if (s.endLabel) {
      line.endLabel = {
        show: true,
        formatter: s.endLabel,
        color: s.rgb,
        fontWeight: 700,
        fontSize: 13,
        fontFamily: t.fontFamily,
        distance: 8,
      };
    }
    if (i === 0 && markArea) line.markArea = markArea;
    if (i === 0 && markLine) line.markLine = markLine;
    if (s.highlightMin) {
      line.markPoint = {
        symbol: 'circle',
        symbolSize: 11,
        silent: true,
        itemStyle: { color: t.goldGlint, borderColor: t.surface, borderWidth: 3 },
        label: {
          show: true,
          position: 'bottom',
          distance: 8,
          color: s.rgb,
          fontSize: 11.5,
          fontFamily: t.fontFamily,
          formatter: (p: { value?: unknown }) =>
            fmt.tooltip(typeof p.value === 'number' ? p.value : null),
        },
        data: [{ type: 'min', name: 'min' }],
      } as MarkPointComponentOption;
    }
    return line;
  });

  // Band: seri dasar transparan + selisih bertumpuk berisi warna. Tidak untuk skala log.
  const helpers: LineSeriesOption[] = [];
  if (input.band && !yLog) {
    const up = resolved.find((s) => s.id === input.band!.upper);
    const lo = resolved.find((s) => s.id === input.band!.lower);
    if (up && lo) {
      const { base, diff } = alignBand(up.data, lo.data);
      const fill = input.band.color
        ? resolveColor(input.band.color, lookup, t.goldsoft)
        : t.goldsoft;
      const common: LineSeriesOption = {
        type: 'line',
        stack: '__band',
        showSymbol: false,
        symbol: 'none',
        silent: true,
        connectNulls: false,
        lineStyle: { opacity: 0, width: 0 },
        emphasis: { disabled: true },
        tooltip: { show: false },
        z: 1,
      };
      helpers.push(
        { ...common, id: BAND_LOWER_ID, name: BAND_LOWER_ID, data: base },
        {
          ...common,
          id: BAND_FILL_ID,
          name: input.band.label ?? 'Spread',
          data: diff,
          areaStyle: { color: fill, opacity: 1 },
        },
      );
    }
  }

  // Pita min–maks per seri: dasar transparan + selisih bertumpuk (tidak untuk skala log).
  const envelopes: LineSeriesOption[] = [];
  const envelopeMaps = new Map<string, Map<number, [number, number]>>();
  for (const s of resolved) {
    if (!s.envelope || yLog) continue;
    const { base, diff } = alignBand(toSeriesData(s.envelope.max), toSeriesData(s.envelope.min));
    envelopeMaps.set(
      s.id,
      new Map(
        base.flatMap((b, i) => {
          const d = diff[i]![1];
          return b[1] === null || d === null
            ? []
            : [[b[0], [b[1], b[1] + d]] as [number, [number, number]]];
        }),
      ),
    );
    const common: LineSeriesOption = {
      type: 'line',
      stack: `__band_env_${s.id}`,
      showSymbol: false,
      symbol: 'none',
      silent: true,
      connectNulls: false,
      lineStyle: { opacity: 0, width: 0 },
      emphasis: { disabled: true },
      tooltip: { show: false },
      z: 1,
    };
    envelopes.push(
      { ...common, id: `__band_env_lo_${s.id}`, name: `__band_env_lo_${s.id}`, data: base },
      {
        ...common,
        id: `__band_env_hi_${s.id}`,
        name: `__band_env_hi_${s.id}`,
        data: diff,
        areaStyle: { color: s.rgb, opacity: 0.16 },
      },
    );
  }

  const tooltipSeries = resolved.map((s) => ({
    label: s.label,
    color: s.rgb,
    dashed: s.dashed,
    data: s.tooltipAfter ? s.data.filter((d) => d[0] > isoToTime(s.tooltipAfter!)) : s.data,
    envelope: envelopeMaps.get(s.id),
    notes: s.notes
      ? new Map(
          Object.entries(s.notes).flatMap(([iso, text]) => {
            const t = isoToTime(iso);
            return Number.isNaN(t) ? [] : [[t, text] as [number, string]];
          }),
        )
      : undefined,
  }));

  const dataZoom: DataZoomComponentOption[] = showZoom
    ? [
        {
          type: 'inside',
          xAxisIndex: 0,
          startValue: zoom?.start,
          endValue: zoom?.end,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          minValueSpan: 3 * DAY_MS,
        },
      ]
    : [];
  if (showSlider)
    dataZoom.push({
      type: 'slider',
      xAxisIndex: 0,
      startValue: zoom?.start,
      endValue: zoom?.end,
      left: yw,
      right: grid.right as number,
      bottom: 6,
      height: sliderH,
      minValueSpan: 3 * DAY_MS,
      backgroundColor: t.surface2,
      borderColor: 'transparent',
      borderRadius: 10,
      fillerColor: t.goldsoft,
      dataBackground: {
        lineStyle: { color: t.faint, width: 1.2, opacity: 0.9 },
        areaStyle: { opacity: 0 },
      },
      selectedDataBackground: {
        lineStyle: { color: t.faint, width: 1.2, opacity: 0.9 },
        areaStyle: { opacity: 0 },
      },
      handleIcon: 'path://M4 0h0a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z',
      handleSize: '56%',
      handleStyle: { color: t.gold, borderColor: t.gold, borderWidth: 0 },
      emphasis: { handleStyle: { color: t.gold, borderColor: t.gold } },
      moveHandleSize: 0,
      brushSelect: false,
      showDetail: !compact,
      textStyle: { color: t.faint, fontSize: 11, fontFamily: t.fontFamily },
      labelFormatter: (v: number) => formatDateShort(v),
    });

  const option: ChartOption = {
    useUTC: true,
    animation: totalPoints <= 3000,
    animationDuration: 300,
    textStyle: { fontFamily: t.fontFamily },
    grid,
    xAxis: {
      type: 'time',
      min: 'dataMin',
      max: 'dataMax',
      splitNumber: compact ? 3 : 6,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        ...axisLabelStyle(t),
        margin: 12,
        hideOverlap: true,
        formatter: (v: number) => formatAxisDate(v, span),
      },
      axisPointer: {
        lineStyle: { color: t.muted, opacity: 0.5, width: 1 },
        label: { show: false },
      },
    },
    yAxis: {
      type: yLog ? 'log' : 'value',
      ...(yLog ? { logBase: 10 } : { scale: true }),
      ...(input.yMin !== undefined ? { min: input.yMin } : {}),
      ...(input.yMax !== undefined ? { max: input.yMax } : {}),
      splitNumber: compact ? 4 : 5,
      axisLine: { show: false },
      axisTick: { show: false, ...(input.yTicks ? { customValues: input.yTicks } : {}) },
      splitLine: { lineStyle: { color: t.grid, width: 1 } },
      axisLabel: {
        ...axisLabelStyle(t),
        margin: 10,
        formatter: (v: number) => fmt.axis(v),
        ...(input.yTicks ? { customValues: input.yTicks } : {}),
      },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      ...tooltipBoxStyle(t),
      axisPointer: { type: 'line', lineStyle: { color: t.muted, opacity: 0.5 } },
      formatter: (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as { axisValue?: number }[];
        const at = Number(list[0]?.axisValue);
        if (!Number.isFinite(at)) return '';
        const rows = tooltipRows(at, tooltipSeries, fmt.tooltip);
        return rows.length ? tooltipHtml(formatTooltipDate(at), rows, t) : '';
      },
    },
    dataZoom,
    series: [...helpers, ...envelopes, ...lines],
  };
  return { option, extent };
}
