'use client';

import { useMemo } from 'react';
import { TimeSeriesChart, type TimeSeriesChartProps } from './time-series-chart';
import type { TimeSeries } from './time-series-option';

export interface SpreadBandChartProps extends Omit<
  TimeSeriesChartProps,
  'series' | 'band' | 'yLog'
> {
  /** Harga jual (batas atas band). */
  sell: TimeSeries;
  /** Harga buyback (batas bawah band). */
  buyback: TimeSeries;
  /** Seri tambahan opsional (digambar di atas band). */
  extra?: TimeSeries[];
  /** Label legenda band. Default "Spread". */
  bandLabel?: string;
  /** Warna isi band (token/warna). Default `goldsoft`. */
  bandColor?: string;
}

/** Spread: area band jual–buyback (--goldsoft) dengan dua garis batasnya (mockup Spread). */
export function SpreadBandChart({
  sell,
  buyback,
  extra,
  bandLabel = 'Spread',
  bandColor,
  height = 330,
  ...rest
}: SpreadBandChartProps) {
  const series = useMemo(() => [sell, buyback, ...(extra ?? [])], [sell, buyback, extra]);
  const band = useMemo(
    () => ({ upper: sell.id, lower: buyback.id, label: bandLabel, color: bandColor }),
    [sell.id, buyback.id, bandLabel, bandColor],
  );
  return <TimeSeriesChart {...rest} height={height} series={series} band={band} />;
}
