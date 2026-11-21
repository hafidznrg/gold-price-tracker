'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Chevron, DIR_CLASS, Swatch } from '@/components/explorer-parts';
import { Segmented } from '@/components/segmented';
import { colorVar, type ColorToken } from '@/lib/data';
import type { ValueMode } from '@/lib/explorer';
import { changeDirection, EMPTY, formatDate, formatPct, formatRupiah } from '@/lib/format';
import {
  barPosition,
  bestKey,
  bestWord,
  defaultSort,
  formatChange,
  formatEndLabel,
  formatSummaryValue,
  hasRange,
  rangeNotes,
  sortItems,
  sortOptions,
  spreadAboveAverage,
  type SortKey,
  type SummaryItem,
  type SummaryMode,
} from '@/lib/riwayat-summary';
import { cn } from '@/lib/utils';

/**
 * Daftar "Dalam rentang ini" (D-74): pengganti kartu statistik dan tabel Ringkasan rentang,
 * sekaligus legenda grafik. Satu baris = satu seri; ketuk untuk detail. Pakai `key={mode}` di
 * pemanggil agar pilihan urutan kembali ke bawaan saat opsi urutan berganti.
 */
export function ExplorerSummary({
  items,
  mode,
  valueMode,
  to,
  loading,
  footer,
}: {
  items: SummaryItem[];
  mode: SummaryMode;
  valueMode: ValueMode;
  /** Akhir rentang (ISO): seri yang berhenti sebelumnya diberi catatan "terakhir …". */
  to: string;
  loading: boolean;
  /** "ⓘ Sumber" di kaki kartu. */
  footer: ReactNode;
}) {
  const [sort, setSort] = useState<SortKey>(defaultSort(mode));
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const headId = useId();
  const best = useMemo(() => bestKey(items, mode, valueMode), [items, mode, valueMode]);
  const rows = useMemo(() => sortItems(items, mode, sort), [items, mode, sort]);
  const word = bestWord(mode);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <h2 id={headId} className="m-0 text-[15px] font-semibold">
          Dalam rentang ini
        </h2>
        <Segmented
          size="sm"
          label="Urutkan"
          options={sortOptions(mode)}
          value={sort}
          onChange={setSort}
        />
      </div>

      {rows.length === 0 ? (
        <p className="m-0 border-t border-line px-5 py-4 text-sm text-muted">
          {loading ? 'Memuat data…' : 'Belum ada series aktif.'}
        </p>
      ) : (
        <ul
          role="list"
          aria-labelledby={headId}
          className="m-0 list-none p-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:p-3 lg:pt-0"
        >
          {rows.map((it) => (
            <SummaryRow
              key={it.key}
              item={it}
              to={to}
              best={it.key === best ? word : null}
              expanded={open.has(it.key)}
              onToggle={() => toggle(it.key)}
              showSpread={mode === 'spread' || mode === 'both'}
              spreadIsMain={mode === 'spread'}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-xs text-faint">Ketuk baris untuk detail</span>
        {footer}
      </div>
    </div>
  );
}

function SummaryRow({
  item,
  to,
  best,
  expanded,
  onToggle,
  showSpread,
  spreadIsMain,
}: {
  item: SummaryItem;
  to: string;
  /** Kata penanda ("termurah") bila baris ini yang terbaik. */
  best: string | null;
  expanded: boolean;
  onToggle: () => void;
  showSpread: boolean;
  /** Mode Spread: nilai utama sudah spread, tak perlu "spread x%" lagi. */
  spreadIsMain: boolean;
}) {
  const detailId = useId();
  const { stat, kind, spread } = item;
  const range = hasRange(stat);
  const notes = rangeNotes(stat, to, (d) => formatDate(d, false));
  const dir = changeDirection(item.change);
  // Spread: naik/turun bukan baik/buruk menurut warna harga; tampilkan netral.
  const changeClass = kind === 'pct' ? 'text-muted' : DIR_CLASS[dir];

  return (
    <li
      data-best={best ? 'true' : undefined}
      className={cn(
        'border-t border-line lg:overflow-hidden lg:rounded-[14px] lg:border',
        best && 'bg-linear-to-r from-goldsoft to-transparent shadow-[inset_3px_0_0_var(--gold)]',
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
        className="flex w-full min-w-0 cursor-pointer flex-col gap-1.5 border-0 bg-transparent px-4 py-3 text-left text-text"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Swatch color={item.color} dashed={item.dashed} width={20} />
          <span className="min-w-0 flex-1 text-[15px] leading-snug">
            <span className="font-semibold">{item.name}</span>
            {item.source ? <span className="text-[13px] text-muted"> · {item.source}</span> : null}
            {best ? <span className="sr-only"> ({best})</span> : null}
          </span>
          <span
            className={cn(
              'num flex-none text-[15px] font-semibold whitespace-nowrap',
              best && 'text-gold',
            )}
          >
            {stat ? formatSummaryValue(stat.last.value, kind) : EMPTY}
          </span>
          <Chevron open={expanded} className="size-3" />
        </span>

        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-[30px]">
          <span className="min-w-[110px] flex-1">
            {range ? (
              <span className="num flex justify-between text-[11px] leading-none text-muted">
                <span>{formatEndLabel(stat.min.value, kind)}</span>
                <span>{formatEndLabel(stat.max.value, kind)}</span>
              </span>
            ) : null}
            <span aria-hidden="true" className="relative mt-1 block h-[3px] rounded-full bg-line">
              {range ? (
                <span
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                  style={{
                    left: `${barPosition(stat.last.value, stat.min.value, stat.max.value)}%`,
                    background: colorVar(item.color as ColorToken),
                  }}
                />
              ) : null}
            </span>
          </span>
          <span className="num flex flex-none items-center gap-2.5 text-[13px]">
            {showSpread && !spreadIsMain && spread ? (
              <span className="text-muted">
                spread{' '}
                <span
                  className={cn(
                    'font-semibold',
                    spreadAboveAverage(spread) ? 'text-down' : 'text-text',
                  )}
                >
                  {formatPct(spread.last, 2, false)}
                </span>
              </span>
            ) : null}
            {best ? (
              <span aria-hidden="true" className="text-xs font-semibold text-gold">
                {best}
              </span>
            ) : null}
            <span className={cn('min-w-8 text-right font-semibold', changeClass)}>
              {formatChange(item.change, kind)}
            </span>
          </span>
        </span>

        {notes.length > 0 ? (
          <span className="pl-[30px] text-[11.5px] leading-snug text-faint">
            {notes.join(' · ')}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div id={detailId} className="grid grid-cols-3 gap-x-3 gap-y-3.5 pr-4 pb-3.5 pl-[46px]">
          {stat ? (
            <>
              <Cell
                label="Awal"
                value={formatSummaryValue(stat.first.value, kind)}
                date={stat.first.date}
              />
              <Cell
                label="Terendah"
                value={formatSummaryValue(stat.min.value, kind)}
                date={stat.min.date}
              />
              <Cell
                label="Tertinggi"
                value={formatSummaryValue(stat.max.value, kind)}
                date={stat.max.date}
              />
            </>
          ) : (
            <p className="col-span-3 m-0 text-sm text-muted">Tidak ada data di rentang ini.</p>
          )}
          {showSpread && spread ? (
            <>
              <Cell
                label="Spread kini"
                value={formatPct(spread.last, 2, false)}
                valueClass={spreadAboveAverage(spread) ? 'text-down' : undefined}
                sub={spread.gap === null ? undefined : formatRupiah(spread.gap)}
              />
              <Cell
                label="Rata-rata"
                value={formatPct(spread.avg, 2, false)}
                sub={`${spread.count} hari`}
              />
              <Cell
                label="Tersempit"
                value={formatPct(spread.minValue, 2, false)}
                date={spread.minDate}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Cell({
  label,
  value,
  date,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  date?: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="num flex min-w-0 flex-col">
      <span className="mb-0.5 text-2xs font-semibold tracking-[.08em] text-faint uppercase">
        {label}
      </span>
      <span className={cn('text-[13px] font-semibold whitespace-nowrap', valueClass)}>{value}</span>
      {date || sub ? (
        <span className="text-xs text-muted">{date ? formatDate(date, false) : sub}</span>
      ) : null}
    </div>
  );
}
