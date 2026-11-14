'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { InfoPopover } from '@/components/info-popover';
import { Segmented } from '@/components/segmented';
import type { TodayCells } from '@/lib/bandingkan';
import { COLOR_CLASSES } from '@/lib/data';
import {
  BEST_LABEL,
  MATRIX_COLS,
  MATRIX_HINT,
  buildMatrix,
  type MatrixMode,
  type MatrixUnit,
} from '@/lib/home-matrix';
import { EMPTY, formatPct, formatRupiah, formatWeight } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Label pendek di HP agar kedua toggle muat satu baris; nama aksesibel tetap label lengkap. */
function short(full: string, mobile: string): ReactNode {
  return (
    <>
      <span aria-hidden="true" className="sm:hidden">
        {mobile}
      </span>
      <span className="max-sm:sr-only">{full}</span>
    </>
  );
}

const MODES: { value: MatrixMode; label: ReactNode }[] = [
  { value: 'jual', label: short('Harga jual', 'Jual') },
  { value: 'buyback', label: 'Buyback' },
  { value: 'spread', label: 'Spread' },
];
const UNITS: { value: MatrixUnit; label: ReactNode }[] = [
  { value: 'keping', label: short('Per keping', 'Keping') },
  { value: 'gram', label: short('Per gram', 'Gram') },
];

/** Padding tombol toggle dirapatkan di HP agar dua grup muat satu baris. */
const TIGHT = 'max-sm:[&>button]:px-2';

const GRID = 'grid grid-cols-[110px_repeat(4,minmax(0,1fr))] items-center px-6';
/** Kolom gramasi menempel di kiri saat tabel digeser di HP (D-54); latar menutup padding baris. */
const STICKY = 'sticky left-0 z-[1] -ml-6 self-stretch flex items-center bg-surface pl-6';

export function HomeMatrix({ cells }: { cells: TodayCells }) {
  const [mode, setMode] = useState<MatrixMode>('jual');
  const [unit, setUnit] = useState<MatrixUnit>('keping');
  const rows = useMemo(() => buildMatrix(cells, mode, unit), [cells, mode, unit]);

  return (
    <section className="wrap pt-12 pb-6">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-3.5 px-6 pt-[22px] pb-4 max-sm:px-4">
          <div>
            <h2 className="serif m-0 text-[32px] max-sm:text-[26px]">Bandingkan per gramasi</h2>
            <p className="m-0 mt-1.5 text-sm text-muted">{MATRIX_HINT[mode]}</p>
          </div>
          <div className="flex flex-wrap gap-2 max-sm:gap-1.5">
            <Segmented
              label="Nilai yang dibandingkan"
              options={MODES}
              value={mode}
              onChange={setMode}
              size="sm"
              className={TIGHT}
            />
            <Segmented
              label="Satuan"
              options={UNITS}
              value={unit}
              onChange={setUnit}
              size="sm"
              className={TIGHT}
            />
          </div>
        </div>
        {/* `relative`: jadikan blok penampung elemen absolut (mis. sr-only "termurah") agar ikut
            terpotong di dalam scroller, bukan melebarkan halaman dan navbar bawah di HP. */}
        <div className="relative overflow-x-auto">
          <div role="table" aria-label="Perbandingan harga per gramasi" className="min-w-[720px]">
            <div
              role="row"
              className={cn(GRID, 'border-t border-line py-2.5 text-xs font-semibold text-faint')}
            >
              <span role="columnheader" className={cn(STICKY, 'tracking-[0.08em] uppercase')}>
                Gramasi
              </span>
              {MATRIX_COLS.map((d) => (
                <span
                  key={d.id}
                  role="columnheader"
                  className="flex items-center gap-2 text-sm text-text"
                >
                  <span
                    aria-hidden="true"
                    className={cn('size-2 rounded-[2px]', COLOR_CLASSES[d.color].bg)}
                  />
                  <span>
                    {d.brandName}{' '}
                    <span className="text-xs font-normal text-faint">{d.sourceName}</span>
                  </span>
                </span>
              ))}
            </div>
            {rows.map((r) => (
              <div
                key={r.w}
                role="row"
                data-testid="matrix-row"
                className={cn(GRID, 'border-t border-line py-1')}
              >
                <span role="rowheader" className={cn(STICKY, 'text-sm font-semibold')}>
                  {formatWeight(r.w)}
                </span>
                {r.cells.map((x, i) => (
                  <span
                    key={MATRIX_COLS[i]?.id}
                    role="cell"
                    className={cn(
                      'num mr-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-[9px] px-2.5 py-[9px] text-sm',
                      x.value === null ? 'text-faint' : 'text-text',
                      x.best ? 'bg-up/10 font-semibold' : 'font-normal',
                    )}
                  >
                    {x.value === null
                      ? EMPTY
                      : mode === 'spread'
                        ? formatPct(x.value, 2, false)
                        : formatRupiah(x.value)}
                    {x.best ? (
                      <span data-testid="matrix-best" className="sr-only">
                        {BEST_LABEL[mode]}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            ))}
            {rows.length === 0 ? (
              <div role="row" className="border-t border-line px-6 py-6 text-sm text-muted">
                <span role="cell">Belum ada data.</span>
              </div>
            ) : null}
          </div>
        </div>
        {rows.length > 0 ? (
          <div
            data-testid="matrix-legend"
            className="flex items-center gap-2 border-t border-line px-6 py-2.5 text-xs text-muted max-sm:px-4"
          >
            <span aria-hidden="true" className="h-3.5 w-5 flex-none rounded-[4px] bg-up/10" />
            <span>
              <b className="font-semibold text-up">{BEST_LABEL[mode]}</b> di tiap gramasi
            </span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 border-t border-line px-6 py-3.5 text-sm max-sm:px-4">
          <InfoPopover label="Catatan" ariaLabel="Catatan tabel" side="top">
            <p className="m-0 text-xs text-muted">
              {EMPTY} = tidak ditampilkan sumber. Buyback Antam hanya untuk 1 g; Pegadaian tidak
              menampilkan buyback batangan (D-07).
            </p>
          </InfoPopover>
          <Link
            href="/bandingkan"
            className="text-sm font-semibold whitespace-nowrap text-gold no-underline hover:text-text"
          >
            Semua gramasi &amp; sumber →
          </Link>
        </div>
      </div>
    </section>
  );
}
