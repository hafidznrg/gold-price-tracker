import { cn } from '@/lib/utils';
import { barLayout, type BarItem } from './bar-layout';
import { cssColor, formatPercent, type ValueFormat, valueFormatters } from './chart-theme';

export type { BarItem } from './bar-layout';

export interface BarChartProps {
  items: BarItem[];
  /** Format nilai di ujung batang. Default 'percent' (1 desimal, "4,8%"). */
  valueFormat?: ValueFormat;
  /** Desimal untuk 'percent' (default 1). */
  decimals?: number;
  /** Nilai penuh skala; default nilai terbesar. */
  max?: number;
  /** 'horizontal' (default, seperti mockup Spread) atau 'vertical'. */
  orientation?: 'horizontal' | 'vertical';
  /** Warna default batang (token/warna). Default `ubs`; item `highlight` memakai `gold`. */
  color?: string;
  /** Tinggi area batang untuk orientasi vertikal (px). Default 180. */
  height?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * Bar kecil HTML/CSS (tanpa ECharts) untuk "spread % per gramasi hari ini":
 * label kanan-rata · trek --surface2 · nilai tebal tabular. Nilai kosong → "—".
 */
export function BarChart({
  items,
  valueFormat = 'percent',
  decimals = 1,
  max,
  orientation = 'horizontal',
  color = 'ubs',
  height = 180,
  ariaLabel,
  className,
}: BarChartProps) {
  const pct =
    valueFormat === 'percent'
      ? (v: number | null) => formatPercent(v, decimals)
      : valueFormatters(valueFormat).tooltip;
  const rows = barLayout(items, max);
  const fill = (it: BarItem) => cssColor(it.color ?? (it.highlight ? 'gold' : color));

  if (orientation === 'vertical') {
    return (
      <ul
        aria-label={ariaLabel}
        className={cn('m-0 flex list-none items-end gap-2 p-0 text-[12px]', className)}
      >
        {rows.map((r) => (
          <li key={r.item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="font-semibold tabular-nums">{pct(r.item.value)}</span>
            <div
              className="flex w-full max-w-9 items-end overflow-hidden rounded-[5px] bg-surface2"
              style={{ height }}
            >
              <div
                className="w-full rounded-[5px]"
                style={{ height: `${r.ratio * 100}%`, background: fill(r.item) }}
              />
            </div>
            <span className="truncate text-muted">{r.item.label}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul
      aria-label={ariaLabel}
      className={cn('m-0 flex list-none flex-col gap-[7px] p-0', className)}
    >
      {rows.map((r) => (
        <li
          key={r.item.label}
          className="grid items-center gap-3 text-[13px]"
          style={{ gridTemplateColumns: '62px minmax(0,1fr) 64px' }}
        >
          <span className="truncate text-right text-muted">{r.item.label}</span>
          <div className="h-4 overflow-hidden rounded-[5px] bg-surface2">
            <div
              className="h-full rounded-[5px]"
              style={{ width: `${r.ratio * 100}%`, background: fill(r.item) }}
            />
          </div>
          <span
            className={cn(
              'font-semibold tabular-nums',
              r.item.value === null && 'font-normal text-faint',
            )}
          >
            {pct(r.item.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}
