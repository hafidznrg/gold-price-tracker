'use client';

import { useEffect, useState } from 'react';
import { formatDataAge, jakartaDateOf } from '@/lib/format';
import { cn } from '@/lib/utils';

const DAY_MS = 86_400_000;

/**
 * Umur data dengan titik status ("3 jam lalu"). Situs statis, jadi umur dihitung di klien:
 * render awal memakai `builtAt` (deterministik, sama dengan HTML build), lalu diperbarui ke
 * waktu sebenarnya setelah hidrasi. Titik hijau = data ≤ 2 hari; abu-abu = lebih lama / statis.
 */
export function DataAge({
  at,
  date,
  isStatic = false,
  builtAt,
  className,
}: {
  at?: string | null;
  date?: string | null;
  isStatic?: boolean;
  builtAt: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => new Date(builtAt));
  useEffect(() => setNow(new Date()), []);

  const label = formatDataAge({ at, date, isStatic }, now);
  const ageDays = date
    ? Math.round(
        (Date.parse(`${jakartaDateOf(now)}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS,
      )
    : null;
  const fresh = !isStatic && ageDays !== null && ageDays <= 2;

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted', className)}>
      <span
        aria-hidden="true"
        className={cn('size-[7px] rounded-full', fresh ? 'bg-up' : 'bg-faint')}
      />
      {label}
    </span>
  );
}
