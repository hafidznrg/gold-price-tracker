'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { SourceStamp } from '@/components/source-stamp';
import { useViewportClamp } from '@/components/use-viewport-clamp';
import type { ColorToken } from '@/lib/data';
import { EMPTY, changeDirection, formatChangeRupiah, formatPct, formatRupiah } from '@/lib/format';
import type { CardModel } from '@/lib/today';
import { cn } from '@/lib/utils';

export const DOT: Record<ColorToken, string> = {
  antam: 'bg-antam',
  ubs: 'bg-ubs',
  g24: 'bg-g24',
  tab: 'bg-tab',
  spot: 'bg-spot',
  gold: 'bg-gold',
  muted: 'bg-muted',
};

const TEXT_DIR = { up: 'text-up', down: 'text-down', flat: 'text-muted' } as const;

/** Kartu harga ringkas di hero. Panel ⓘ memuat catatan dan atribusi sumber. */
export function PriceCard({ c }: { c: CardModel }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useViewportClamp(panelRef, open);
  // Popover menutup saat klik di luar atau Escape, supaya tinggi kartu tidak berubah.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const hasBuy = c.buyback !== null && c.sell !== null;
  const meter = hasBuy ? ((c.buyback as number) / (c.sell as number)) * 100 : 0;
  return (
    <article className="flex min-w-0 flex-col gap-3.5 rounded-card-sm border border-line bg-surface px-5 py-[18px]">
      {/* Judul dan keterangan satuan ditumpuk (bukan satu baris) agar tidak saling patah di kartu
          sempit dan tinggi kepala kartu seragam. */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-[9px]">
            <span className={cn('size-2.5 flex-none rounded-[3px]', DOT[c.color])} />
            <h2 className="m-0 truncate text-base leading-snug font-semibold">{c.title}</h2>
          </div>
          <p className="m-0 mt-0.5 truncate pl-[19px] text-xs text-faint">{c.unit}</p>
        </div>
        <div ref={boxRef} className="relative flex-none">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`Keterangan ${c.title}`}
            onClick={() => setOpen((o) => !o)}
            className="-my-2 -mr-2.5 grid size-11 flex-none cursor-pointer place-items-center rounded-lg border-none bg-transparent text-faint hover:text-text"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="fill-none stroke-current stroke-[1.8]"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v6M12 7.5v.5" />
            </svg>
          </button>
          {open ? (
            <div
              ref={panelRef}
              id={panelId}
              role="note"
              className="absolute top-full right-0 z-20 mt-1 w-[min(280px,calc(100vw-48px))] rounded-field border border-line bg-surface px-3.5 py-3 text-xs leading-normal text-muted shadow-lg"
            >
              {c.note}
              <SourceStamp source={c.source} date={c.date} at={c.at} className="mt-1.5" bare />
            </div>
          ) : null}
        </div>
      </div>
      <div>
        <div className="num text-[30px] leading-tight font-semibold tracking-[-0.02em]">
          {formatRupiah(c.sell)}
        </div>
        <div
          className={cn('num mt-1 text-sm font-medium', TEXT_DIR[changeDirection(c.change?.abs)])}
        >
          {c.change ? `${formatChangeRupiah(c.change.abs)} (${formatPct(c.change.pct)})` : EMPTY}{' '}
          <span className="font-normal text-faint">vs kemarin</span>
        </div>
      </div>
      {/* mt-auto: bagian bawah menempel ke dasar kartu sehingga meter sejajar antarkartu. */}
      <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex justify-between gap-3 text-sm">
          <span className="whitespace-nowrap text-muted">Buyback</span>
          {hasBuy ? (
            <span className="num font-semibold">{formatRupiah(c.buyback)}</span>
          ) : (
            <span className="text-muted">tidak ditampilkan</span>
          )}
        </div>
        {/* Bila tak muat satu baris, nilai turun utuh ke baris berikut (rata kanan), bukan patah
            di tengah label atau angka. */}
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-sm">
          <span className="whitespace-nowrap text-muted">Spread</span>
          {hasBuy ? (
            <span className="num ml-auto font-semibold whitespace-nowrap">
              {formatPct(c.spreadPct, 2, false)} · {formatRupiah(c.spread)}
            </span>
          ) : (
            <span className="ml-auto text-muted">{EMPTY}</span>
          )}
        </div>
        <div aria-hidden="true" className="h-[5px] overflow-hidden rounded-full bg-surface2">
          <div
            className={cn('h-full rounded-full', DOT[c.color])}
            style={{ width: `${meter.toFixed(1)}%` }}
          />
        </div>
      </div>
    </article>
  );
}
