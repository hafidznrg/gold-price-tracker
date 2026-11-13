'use client';

import { useId, useState } from 'react';
import { SourceStamp } from '@/components/source-stamp';
import type { ColorToken } from '@/lib/data';
import { EMPTY, changeDirection, formatChangeRupiah, formatPct, formatRupiah } from '@/lib/format';
import type { CardModel } from '@/lib/today';
import { cn } from '@/lib/utils';

export const DOT: Record<ColorToken, string> = {
  antam: 'bg-antam',
  ubs: 'bg-ubs',
  g24: 'bg-g24',
  tab: 'bg-tab',
  gold: 'bg-gold',
  muted: 'bg-muted',
};

const TEXT_DIR = { up: 'text-up', down: 'text-down', flat: 'text-muted' } as const;

/** Kartu harga ringkas di hero. Panel ⓘ memuat catatan dan atribusi sumber. */
export function PriceCard({ c }: { c: CardModel }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasBuy = c.buyback !== null && c.sell !== null;
  const meter = hasBuy ? ((c.buyback as number) / (c.sell as number)) * 100 : 0;
  return (
    <article className="flex min-w-0 flex-col gap-3.5 rounded-card-sm border border-line bg-surface px-5 py-[18px]">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-[9px]">
          <span className={cn('size-2.5 flex-none rounded-[3px]', DOT[c.color])} />
          <h2 className="m-0 text-base font-semibold">{c.title}</h2>
          <span className="text-xs whitespace-nowrap text-faint">{c.unit}</span>
        </div>
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
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex justify-between gap-3 text-sm">
          <span className="text-muted">Buyback</span>
          {hasBuy ? (
            <span className="num font-semibold">{formatRupiah(c.buyback)}</span>
          ) : (
            <span className="text-muted">tidak ditampilkan</span>
          )}
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <span className="text-muted">Selisih jual-beli</span>
          {hasBuy ? (
            <span className="num font-semibold">
              {formatPct(c.spreadPct, 2, false)} · {formatRupiah(c.spread)}
            </span>
          ) : (
            <span className="text-muted">{EMPTY}</span>
          )}
        </div>
        <div aria-hidden="true" className="h-[5px] overflow-hidden rounded-full bg-surface2">
          <div
            className={cn('h-full rounded-full', DOT[c.color])}
            style={{ width: `${meter.toFixed(1)}%` }}
          />
        </div>
      </div>
      {open ? (
        <div
          id={panelId}
          className="rounded-field bg-surface2 px-3 py-2.5 text-xs leading-normal text-muted"
        >
          {c.note}
          <SourceStamp source={c.source} date={c.date} at={c.at} className="mt-1.5" bare />
        </div>
      ) : null}
    </article>
  );
}
