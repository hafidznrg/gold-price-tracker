'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
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

const MODES: { value: MatrixMode; label: string }[] = [
  { value: 'jual', label: 'Harga jual' },
  { value: 'buyback', label: 'Buyback' },
  { value: 'spread', label: 'Selisih' },
];
const UNITS: { value: MatrixUnit; label: string }[] = [
  { value: 'keping', label: 'Per keping' },
  { value: 'gram', label: 'Per gram' },
];

const GRID = 'grid grid-cols-[110px_repeat(4,minmax(0,1fr))] items-center px-6';

export function HomeMatrix({ cells }: { cells: TodayCells }) {
  const [mode, setMode] = useState<MatrixMode>('jual');
  const [unit, setUnit] = useState<MatrixUnit>('keping');
  const rows = useMemo(() => buildMatrix(cells, mode, unit), [cells, mode, unit]);

  return (
    <section className="wrap pt-12 pb-6">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-3.5 px-6 pt-[22px] pb-4 max-sm:px-4">
          <div>
            <h2 className="serif m-0 text-[32px]">Bandingkan per gramasi</h2>
            <p className="m-0 mt-1.5 text-sm text-muted">{MATRIX_HINT[mode]}</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Segmented
              label="Nilai yang dibandingkan"
              options={MODES}
              value={mode}
              onChange={setMode}
            />
            <Segmented label="Satuan" options={UNITS} value={unit} onChange={setUnit} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <div role="table" aria-label="Perbandingan harga per gramasi" className="min-w-[720px]">
            <div
              role="row"
              className={cn(GRID, 'border-t border-line py-2.5 text-xs font-semibold text-faint')}
            >
              <span role="columnheader" className="tracking-[0.08em] uppercase">
                Gramasi
              </span>
              {MATRIX_COLS.map((d) => (
                <span
                  key={d.id}
                  role="columnheader"
                  className="flex items-center gap-2 text-[13.5px] text-text"
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
                <span role="rowheader" className="text-[14.5px] font-semibold">
                  {formatWeight(r.w)}
                </span>
                {r.cells.map((x, i) => (
                  <span
                    key={MATRIX_COLS[i]?.id}
                    role="cell"
                    className={cn(
                      'num mr-2 flex items-center gap-2 rounded-[9px] px-2.5 py-[9px] text-[14.5px]',
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
                      <span
                        data-testid="matrix-best"
                        className="rounded-full border border-up px-[7px] py-px text-[11px] font-semibold text-up"
                      >
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
        <div className="flex flex-wrap justify-between gap-2.5 border-t border-line px-6 py-3.5 text-[12.5px] text-muted max-sm:px-4">
          <span>
            {EMPTY} = tidak ditampilkan sumber. Buyback Antam hanya untuk 1 g; Pegadaian tidak
            menampilkan buyback batangan (D-07).
          </span>
          <Link href="/bandingkan" className="font-semibold text-gold no-underline hover:text-text">
            Semua gramasi &amp; sumber →
          </Link>
        </div>
      </div>
    </section>
  );
}
