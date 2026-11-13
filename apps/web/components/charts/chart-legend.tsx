import { cn } from '@/lib/utils';
import { cssColor } from './chart-theme';

export interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
  /** Kotak isi (band spread) alih-alih garis. */
  swatch?: 'line' | 'box';
}

/** Legenda HTML seperti mockup: garis 20×8 (putus-putus untuk buyback) + nama, membungkus di layar sempit. */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul
      className={cn(
        'm-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-xs text-muted',
        className,
      )}
    >
      {items.map((it) => (
        <li key={it.label} className="flex min-w-0 items-center gap-[7px]">
          {it.swatch === 'box' ? (
            <span
              aria-hidden="true"
              className="h-[10px] w-[14px] flex-none rounded-[3px] border"
              style={{ background: cssColor(it.color), borderColor: 'var(--goldline)' }}
            />
          ) : (
            <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true" className="flex-none">
              <path
                d="M1 4H19"
                fill="none"
                stroke={cssColor(it.color)}
                strokeWidth={2.4}
                strokeDasharray={it.dashed ? '4 3' : undefined}
                strokeLinecap="round"
              />
            </svg>
          )}
          <span className="truncate">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}
