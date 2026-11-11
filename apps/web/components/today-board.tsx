'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DOT } from '@/components/price-card';
import { Sparkline } from '@/components/charts/sparkline';
import { SourceStamp } from '@/components/source-stamp';
import type { Change, ColorToken } from '@/lib/data';
import {
  EMPTY,
  changeDirection,
  formatChange,
  formatPct,
  formatRupiah,
  formatWeight,
} from '@/lib/format';
import type { GroupModel, RowModel } from '@/lib/today';
import { cn } from '@/lib/utils';

const TEXT_DIR = { up: 'text-up', down: 'text-down', flat: 'text-muted' } as const;

function changeCell(change: Change | null) {
  return (
    <span role="cell" className={cn('num text-[13.5px]', TEXT_DIR[changeDirection(change?.abs)])}>
      {formatChange(change)}
    </span>
  );
}

const COLS =
  'grid grid-cols-[minmax(80px,.8fr)_minmax(130px,1.3fr)_minmax(120px,1.2fr)_minmax(130px,1.3fr)_minmax(90px,.9fr)_minmax(130px,1.2fr)_130px] items-center px-6';

function Row({ r, color }: { r: RowModel; color: ColorToken }) {
  const has = r.buyback !== null;
  return (
    <div role="row" className={cn(COLS, 'border-t border-line py-[13px] text-[14.5px]')}>
      <span role="cell" className="font-semibold">
        {formatWeight(r.w)}
      </span>
      <span role="cell" className="num font-medium">
        {formatRupiah(r.sell)}
      </span>
      <span role="cell" className="num text-muted">
        {formatRupiah(r.perGram)}
      </span>
      <span role="cell" className={cn('num', has ? 'text-text' : 'text-faint')}>
        {formatRupiah(r.buyback)}
      </span>
      <span role="cell" className={cn('num', has ? 'text-text' : 'text-faint')}>
        {has ? formatPct(r.spreadPct, 2, false) : EMPTY}
      </span>
      {changeCell(r.change)}
      <span role="cell">
        <Sparkline values={r.spark} color={color} width={120} height={30} className="w-[116px]" />
      </span>
    </div>
  );
}

export function TodayBoard({ groups }: { groups: GroupModel[] }) {
  const [tabId, setTabId] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | null>(null);

  const shownGroups = groups;
  const cur =
    shownGroups.find((g) => g.id === tabId) ??
    shownGroups.find((g) => g.id === 'ubslifestyle-ubs') ??
    shownGroups[0];
  const v =
    cur && cur.variants.length > 0
      ? cur.variants.includes(variant ?? '')
        ? (variant as string)
        : (cur.variants[0] as string)
      : '';
  const rows = cur?.rows[v] ?? [];

  return (
    <>
      <section className="wrap pt-12 pb-6">
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex flex-wrap items-end justify-between gap-4 px-6 pt-[26px] pb-[18px] max-sm:px-4">
            <div>
              <h2 className="serif m-0 text-[34px]">Semua gramasi</h2>
              <p className="m-0 mt-1.5 text-sm text-muted">
                Harga per keping hari ini, dengan tren 30 hari.
              </p>
            </div>
            {cur && cur.variants.length > 0 ? (
              <div className="flex items-center gap-2.5">
                <label htmlFor="variant" className="text-[13px] text-muted">
                  Tahun produksi
                </label>
                <select
                  id="variant"
                  value={v}
                  onChange={(e) => setVariant(e.target.value)}
                  className="h-11 w-[120px] rounded-field border border-line bg-surface2 px-3 text-sm text-text"
                >
                  {cur.variants.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div
            role="tablist"
            aria-label="Sumber dan brand"
            className="flex flex-wrap gap-1.5 px-6 pb-[18px] max-sm:px-4"
          >
            {shownGroups.map((g) => {
              const on = g.id === cur?.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTabId(g.id)}
                  className={cn(
                    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-4 text-[13.5px]',
                    on
                      ? 'border-goldline bg-surface2 text-text'
                      : 'border-line bg-transparent text-muted',
                  )}
                >
                  <span className={cn('size-2 rounded-[2px]', DOT[g.color])} />
                  <span className="font-semibold">{g.brand}</span>
                  <span>{g.sourceLabel}</span>
                </button>
              );
            })}
          </div>

          {cur?.note ? (
            <div className="mx-6 mb-4 flex items-start gap-2.5 rounded-control border border-goldline bg-goldsoft px-3.5 py-3 text-[13px] leading-normal max-sm:mx-4">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="mt-0.5 flex-none fill-none stroke-gold stroke-2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7.5v.5" />
              </svg>
              <span>{cur.note}</span>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <div role="table" aria-label="Harga semua gramasi" className="min-w-[880px]">
              <div
                role="row"
                className={cn(
                  COLS,
                  'border-t border-line py-3 text-[11.5px] font-semibold tracking-[0.1em] text-faint uppercase',
                )}
              >
                {[
                  'Gramasi',
                  'Harga jual',
                  'Per gram',
                  'Buyback',
                  'Spread',
                  'Perubahan',
                  '30 hari',
                ].map((h) => (
                  <span key={h} role="columnheader">
                    {h}
                  </span>
                ))}
              </div>
              {rows.map((r) => (
                <Row key={r.w} r={r} color={cur?.color ?? 'gold'} />
              ))}
              {rows.length === 0 ? (
                <div className="border-t border-line px-6 py-6 text-sm text-muted">
                  Belum ada data untuk pilihan ini.
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line px-6 py-4 max-sm:px-4">
            {cur ? (
              <SourceStamp source={cur.source} date={cur.date} at={cur.at}>
                {cur.count} gramasi{v ? ` · tahun produksi ${v}` : ''}
              </SourceStamp>
            ) : (
              <span />
            )}
            <Link
              href="/explorer"
              className="text-[12.5px] font-semibold text-gold no-underline hover:text-text"
            >
              Buka di Riwayat harga →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
