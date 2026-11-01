import { cn } from '@/lib/utils';
import { cssColor } from './chart-theme';
import {
  sparkBand,
  sparkExtent,
  sparkLine,
  sparkTrend,
  type SparkValues,
  type Trend,
  TREND_TOKEN,
} from './sparkline-path';

export interface SparklineProps {
  /** Deret utama (mis. harga jual 30 hari); `null` = hari tanpa data (garis terputus). */
  values: SparkValues;
  /** Deret kedua putus-putus (mis. buyback), digambar tipis seperti kartu Hari ini. */
  secondary?: SparkValues;
  /** Isi lembut di antara `values` dan `secondary` (band spread). */
  band?: boolean;
  /** Warna tetap (token "antam"/"tab"/… atau warna). Tanpa ini → warna arah (--up/--down/--muted). */
  color?: string;
  /** Arah untuk pewarnaan; 'auto' (default) = nilai pertama vs terakhir. */
  trend?: 'auto' | Trend;
  /** Ukuran viewBox dan tampilan (px). Default 120×30 (tabel Hari ini). */
  width?: number;
  height?: number;
  /** Lebar mengikuti wadah (100%), tinggi tetap — untuk kartu. */
  fluid?: boolean;
  strokeWidth?: number;
  /** Label aksesibel; tanpa ini sparkline dianggap dekoratif (aria-hidden). */
  ariaLabel?: string;
  className?: string;
}

/** Sparkline SVG ringan tanpa ECharts, untuk kartu dan sel tabel. */
export function Sparkline({
  values,
  secondary,
  band = false,
  color,
  trend = 'auto',
  width = 120,
  height = 30,
  fluid = false,
  strokeWidth = 1.6,
  ariaLabel,
  className,
}: SparklineProps) {
  const ext = sparkExtent(secondary ? [values, secondary] : [values]);
  const dir = trend === 'auto' ? sparkTrend(values) : trend;
  const stroke = cssColor(color ?? TREND_TOKEN[dir]);
  const a11y = ariaLabel
    ? { role: 'img', 'aria-label': ariaLabel }
    : { 'aria-hidden': true as const };
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width={fluid ? '100%' : width}
      height={height}
      className={cn('block', className)}
      data-trend={dir}
      {...a11y}
    >
      {ext && band && secondary && (
        <path
          d={sparkBand(values, secondary, ext, width, height)}
          style={{ fill: `color-mix(in srgb, ${stroke} 15%, transparent)`, stroke: 'none' }}
        />
      )}
      {ext && secondary && (
        <path
          d={sparkLine(secondary, ext, width, height)}
          vectorEffect="non-scaling-stroke"
          fill="none"
          stroke={stroke}
          strokeWidth={Math.max(1, strokeWidth * 0.6)}
          strokeDasharray="3 3"
          opacity={0.75}
        />
      )}
      {ext && (
        <path
          d={sparkLine(values, ext, width, height)}
          vectorEffect="non-scaling-stroke"
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
