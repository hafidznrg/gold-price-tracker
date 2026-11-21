'use client';

import { Segmented } from '@/components/segmented';
import { RANGE_PRESETS, rangeToDates, type RangeValue } from '@/lib/range';
import { cn } from '@/lib/utils';

export type { RangePreset, RangeValue } from '@/lib/range';

const FIELD = 'rounded-field border border-line bg-surface2 px-3 text-sm text-text';
const FIELD_SIZE = { md: 'h-11 w-[150px]', sm: 'h-9 w-[138px] max-sm:h-10' } as const;

/**
 * Pemilih rentang (mockup Explorer): 7H · 1B · 3B · 6B · YTD · 1T · Semua + Kustom (dua input
 * tanggal). Terkontrol; tanpa state URL. `lastDate` = tanggal data terakhir (patokan preset dan
 * batas atas), `minDate` = tanggal data paling awal (isi "dari" untuk preset Semua). Mengubah
 * input tanggal memanggil `onChange({from, to})` bila keduanya terisi dan from ≤ to.
 */
export function RangeControl({
  value,
  onChange,
  lastDate,
  minDate,
  size = 'md',
  parts = 'all',
  fill = false,
  className,
}: {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  lastDate: string;
  minDate?: string;
  /** `sm` = toolbar padat; diteruskan ke Segmented dan input tanggal. */
  size?: 'md' | 'sm';
  /** `presets` = hanya segmen 7H…Semua (toolbar), `dates` = hanya dua input tanggal (pop-up Lanjutan). */
  parts?: 'all' | 'presets' | 'dates';
  /** HP: tombol preset dibagi rata selebar baris (tanpa geser samping). */
  fill?: boolean;
  className?: string;
}) {
  const { from, to } = rangeToDates(value, lastDate);
  const fromValue = from ?? minDate ?? '';

  function setCustom(next: { from?: string; to?: string }) {
    const f = next.from ?? fromValue;
    const t = next.to ?? to;
    if (f && t && f <= t) onChange({ from: f, to: t });
  }

  return (
    <div
      className={cn(
        'flex max-w-full min-w-0 flex-wrap items-center justify-between gap-2',
        className,
      )}
    >
      {parts !== 'dates' ? (
        <Segmented
          label="Rentang waktu"
          options={RANGE_PRESETS.map((p) => ({ value: p, label: p }))}
          value={typeof value === 'string' ? value : null}
          onChange={onChange}
          size={size}
          scroll={!fill}
          fill={fill}
        />
      ) : null}
      {parts !== 'presets' ? (
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:min-w-0 max-sm:flex-nowrap">
          <label
            htmlFor="range-from"
            className={cn('text-xs text-muted max-sm:sr-only', parts === 'dates' && 'sr-only')}
          >
            Kustom
          </label>
          <input
            id="range-from"
            type="date"
            aria-label="Tanggal awal"
            className={cn(FIELD, FIELD_SIZE[size], 'max-sm:w-auto max-sm:min-w-0 max-sm:flex-1')}
            value={fromValue}
            min={minDate}
            max={to}
            onChange={(e) => setCustom({ from: e.target.value })}
          />
          <span className="text-faint">–</span>
          <input
            id="range-to"
            type="date"
            aria-label="Tanggal akhir"
            className={cn(FIELD, FIELD_SIZE[size], 'max-sm:w-auto max-sm:min-w-0 max-sm:flex-1')}
            value={to}
            min={fromValue || minDate}
            max={lastDate}
            onChange={(e) => setCustom({ to: e.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}
