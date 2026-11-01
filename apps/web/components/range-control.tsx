'use client';

import { Segmented } from '@/components/segmented';
import { RANGE_PRESETS, rangeToDates, type RangeValue } from '@/lib/range';
import { cn } from '@/lib/utils';

export type { RangePreset, RangeValue } from '@/lib/range';

const FIELD = 'h-11 w-[150px] rounded-field border border-line bg-surface2 px-3 text-sm text-text';

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
  className,
}: {
  value: RangeValue;
  onChange: (value: RangeValue) => void;
  lastDate: string;
  minDate?: string;
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
    <div className={cn('flex flex-wrap items-center justify-between gap-2.5', className)}>
      <Segmented
        label="Rentang waktu"
        options={RANGE_PRESETS.map((p) => ({ value: p, label: p }))}
        value={typeof value === 'string' ? value : null}
        onChange={onChange}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="range-from" className="text-xs text-muted">
          Kustom
        </label>
        <input
          id="range-from"
          type="date"
          aria-label="Tanggal awal"
          className={FIELD}
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
          className={FIELD}
          value={to}
          min={fromValue || minDate}
          max={lastDate}
          onChange={(e) => setCustom({ to: e.target.value })}
        />
      </div>
    </div>
  );
}
