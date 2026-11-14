'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LiveDot } from '@/components/live-dot';
import { useViewportClamp } from '@/components/use-viewport-clamp';
import { jakartaDateOf } from '@/lib/format';
import { cn } from '@/lib/utils';

const DAY_MS = 86_400_000;
/** Aturan "terkini" sama dengan titik hijau DataAge: umur data (tanggal WIB) ≤ 2 hari. */
const FRESH_MAX_DAYS = 2;

export interface FreshnessItem {
  id: string;
  name: string;
  /** Teks waktu siap tampil ("30 Okt · 18.32 WIB"). */
  when: string;
  /** Tanggal data terakhir (`YYYY-MM-DD`); null = belum ada data. */
  date: string | null;
}

/**
 * Tombol status pembaruan + panel per sumber. Umur dihitung di klien (situs statis): render awal
 * memakai `builtAt`, lalu waktu sebenarnya setelah hidrasi — sama seperti DataAge.
 */
export function Freshness({
  items,
  latestLabel,
  builtAt,
}: {
  items: FreshnessItem[];
  latestLabel: string;
  builtAt: string;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date(builtAt));
  useEffect(() => setNow(new Date()), []);
  const panelId = useId();
  const panelRef = useRef<HTMLUListElement>(null);
  useViewportClamp(panelRef, open);

  const today = Date.parse(`${jakartaDateOf(now)}T00:00:00Z`);
  const isFresh = (date: string | null) =>
    date !== null && (today - Date.parse(`${date}T00:00:00Z`)) / DAY_MS <= FRESH_MAX_DAYS;
  const freshCount = items.filter((i) => isFresh(i.date)).length;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start rounded-full border border-line bg-surface px-4 text-left text-sm text-text max-sm:min-h-10 max-sm:gap-2 max-sm:px-3 max-sm:text-xs"
      >
        <LiveDot live={freshCount === items.length} />
        <span>
          <b className="font-semibold">Diperbarui {latestLabel}</b>{' '}
          <span className="text-muted max-sm:hidden">
            · {freshCount} dari {items.length} sumber terkini
          </span>
          <span className="text-muted sm:hidden">
            · {freshCount}/{items.length} terkini
          </span>
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={cn(
            'flex-none fill-none stroke-current stroke-[2.2] transition-transform',
            open && 'rotate-180',
          )}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <ul
          ref={panelRef}
          id={panelId}
          aria-label="Pembaruan tiap sumber"
          className="absolute top-full z-10 m-0 mt-2 grid left-0 w-[min(760px,calc(100vw-32px))] list-none grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-px overflow-hidden rounded-[14px] border border-line bg-line p-0 shadow-lg sm:w-[min(760px,calc(100vw-48px))]"
        >
          {items.map((i) => (
            <li key={i.id} className="flex flex-col gap-1 bg-surface px-3.5 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span
                  aria-hidden="true"
                  className={cn('size-[7px] rounded-full', isFresh(i.date) ? 'bg-up' : 'bg-faint')}
                />
                {i.name}
              </span>
              <span className="text-xs text-muted">{i.when}</span>
              <span className="sr-only">{isFresh(i.date) ? 'terkini' : 'belum terkini'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
