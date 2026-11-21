'use client';

import type { PriceSource } from '@gold/schema';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import {
  AGG_OPTIONS,
  FIELD,
  FIELD_LABEL,
  MODE_OPTIONS,
  PRICE_LABEL,
  PriceTag,
  seriesLabel,
  seriesMeta,
  seriesTitle,
  Swatch,
  uniq,
  uniqBy,
} from '@/components/explorer-parts';
import { RangeControl, type RangeValue } from '@/components/range-control';
import { Segmented } from '@/components/segmented';
import { PRODUCT_KIND_LABELS, SOURCE_LABELS, type PriceField, type ProductKind } from '@/lib/data';
import {
  encodePick,
  MAX_SERIES,
  optionBrandKey,
  optionBrandName,
  optionColor,
  type ExplorerOption,
  type SeriesPick,
  type ViewOptions,
} from '@/lib/explorer';
import { formatWeight } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Seri yang sedang tampil/terdaftar: pilihan + opsi katalognya (+ warna/gaya mode dasar). */
export interface ListedSeries {
  pick: SeriesPick;
  opt: ExplorerOption;
  id: string;
  color?: string;
  dashed?: boolean;
}

const SECTION = 'flex flex-col gap-3 border-t border-line px-5 py-4 first:border-t-0';
const SECTION_TITLE = 'm-0 text-2xs font-semibold uppercase tracking-[.1em] text-faint';

function Switch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div id={`${id}-l`} className={cn('text-sm', disabled && 'text-muted')}>
          {label}
        </div>
        <div id={`${id}-d`} className="text-xs leading-snug text-muted">
          {hint}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={`${id}-d`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 flex-none cursor-pointer rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-btn' : 'bg-line',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-surface shadow transition-[left]',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}

/** Pembangun seri manual (brand × sumber × gramasi × jenis harga, maks. `MAX_SERIES`). */
function SeriesBuilder({
  options,
  listed,
  perGram,
  onChange,
}: {
  options: ExplorerOption[];
  listed: ListedSeries[];
  perGram: boolean;
  onChange: (picks: SeriesPick[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<ProductKind>('fisik');
  const [brandSel, setBrandSel] = useState('antam');
  const [sourceSel, setSourceSel] = useState<PriceSource>('logammulia');
  const [wSel, setWSel] = useState('1');
  const [priceSel, setPriceSel] = useState<PriceField>('sell');

  const ofKind = options.filter((o) => o.kind === kind);
  // Antam non-Pegadaian (`antam_np`) tampil sebagai brand sendiri dan tidak digabung ke Antam.
  const brandOpts = uniqBy(ofKind, optionBrandKey);
  const brands = brandOpts.map(optionBrandKey);
  const brand = brands.includes(brandSel) ? brandSel : brands[0];
  const sources = uniq(ofKind.filter((o) => optionBrandKey(o) === brand).map((o) => o.source));
  const source = sources.includes(sourceSel) ? sourceSel : sources[0];
  const weights = ofKind
    .filter((o) => optionBrandKey(o) === brand && o.source === source)
    .sort((a, b) => a.w - b.w);
  const opt =
    weights.find((o) => String(o.w) === wSel) ?? weights.find((o) => o.w === 1) ?? weights[0];
  const prices = (['sell', 'buyback'] as const).filter((p) => opt?.first[p] != null);
  const price = prices.includes(priceSel) ? priceSel : prices[0];
  const candidate: SeriesPick | null =
    opt && price
      ? {
          source: opt.source,
          brand: opt.brand,
          w: opt.w,
          price,
          ...(opt.variant ? { variant: opt.variant } : {}),
        }
      : null;
  const duplicate = candidate ? listed.some((a) => a.id === encodePick(candidate)) : false;
  const full = listed.length >= MAX_SERIES;
  const addNote = duplicate
    ? 'Seri ini sudah ada di grafik.'
    : full
      ? `Maksimum ${MAX_SERIES} seri. Hapus salah satu untuk menambah.`
      : opt && !opt.first.buyback
        ? `${SOURCE_LABELS[opt.source]} tidak menampilkan buyback untuk gramasi ini.`
        : null;

  return (
    <div className="flex flex-col gap-2.5">
      {listed.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm leading-relaxed text-muted">
          Belum ada seri. Tambahkan lewat tombol di bawah.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {listed.map((a) => {
            const label = seriesLabel(a.opt, a.pick.price);
            return (
              <li
                key={a.id}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface2 py-2 pl-3 pr-1"
              >
                <Swatch
                  color={a.color ?? optionColor(a.opt)}
                  dashed={a.dashed ?? a.pick.price === 'buyback'}
                  width={20}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="min-w-0 break-words text-sm font-semibold leading-snug">
                      {seriesTitle(a.opt)}
                    </span>
                    <PriceTag price={a.pick.price} />
                  </div>
                  <div className="mt-0.5 break-words text-xs leading-snug text-muted">
                    {SOURCE_LABELS[a.opt.source]} · {seriesMeta(a.opt, a.pick.price, perGram)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Hapus series ${label}`}
                  title="Hapus dari grafik"
                  onClick={() => onChange(listed.filter((x) => x.id !== a.id).map((x) => x.pick))}
                  className="grid size-10 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent text-faint transition-colors hover:bg-surface hover:text-text"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="fill-none stroke-current stroke-2"
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!adding ? (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setAdding(true)}
          className="min-h-11 w-full cursor-pointer rounded-xl border border-dashed border-goldline bg-transparent text-sm font-semibold text-gold-strong hover:bg-goldsoft"
        >
          + Tambah seri
        </button>
      ) : (
        <div
          role="group"
          aria-label="Tambah seri"
          className="flex flex-col gap-3 rounded-xl border border-line p-3"
        >
          <Segmented
            label="Produk"
            size="sm"
            className="grid w-full grid-cols-2"
            options={(['fisik', 'tabungan'] as const).map((k) => ({
              value: k,
              label: PRODUCT_KIND_LABELS[k],
            }))}
            value={kind}
            onChange={setKind}
          />
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
            <label className={FIELD_LABEL}>
              Brand
              <select className={FIELD} value={brand} onChange={(e) => setBrandSel(e.target.value)}>
                {brandOpts.map((o) => (
                  <option key={optionBrandKey(o)} value={optionBrandKey(o)}>
                    {optionBrandName(o)}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD_LABEL}>
              Sumber
              <select
                className={FIELD}
                value={source}
                onChange={(e) => setSourceSel(e.target.value as PriceSource)}
              >
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD_LABEL}>
              Gramasi
              <select
                className={FIELD}
                value={opt ? String(opt.w) : ''}
                onChange={(e) => setWSel(e.target.value)}
              >
                {weights.map((o) => (
                  <option key={o.id} value={String(o.w)}>
                    {o.kind === 'tabungan' ? 'per gram' : formatWeight(o.w)}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD_LABEL}>
              Jenis harga
              <select
                className={FIELD}
                value={price}
                onChange={(e) => setPriceSel(e.target.value as PriceField)}
              >
                {prices.map((p) => (
                  <option key={p} value={p}>
                    {PRICE_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!candidate || duplicate || full}
              onClick={() => candidate && onChange([...listed.map((a) => a.pick), candidate])}
              className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border-0 bg-btn text-sm font-semibold text-btntext disabled:cursor-not-allowed disabled:bg-surface2 disabled:text-faint"
            >
              Tambah ke grafik
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="min-h-11 cursor-pointer rounded-xl border border-line bg-transparent px-4 text-sm font-semibold text-muted hover:text-text"
            >
              Tutup
            </button>
          </div>
          {addNote ? (
            <p role="status" className="m-0 text-xs leading-relaxed text-muted">
              {addNote}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export interface AdvancedDialogProps {
  open: boolean;
  onClose: () => void;
  view: ViewOptions;
  onView: (patch: Partial<ViewOptions>) => void;
  range: RangeValue;
  onRange: (r: RangeValue) => void;
  lastDate: string;
  minDate?: string;
  options: ExplorerOption[];
  listed: ListedSeries[];
  manual: boolean;
  onPicks: (picks: SeriesPick[]) => void;
  onBack: () => void;
}

/**
 * Pop-up Lanjutan (D-71): dialog di tengah layar di desktop, lembar dari bawah di HP (D-54).
 * Perubahan langsung berlaku lewat URL; Escape / latar / Selesai menutup.
 */
export function AdvancedDialog(p: AdvancedDialogProps): ReactNode {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const { open, onClose } = p;
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const bandOn = p.view.band && p.view.agg !== 'd';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 max-sm:items-end max-sm:p-0">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        ref={panelRef}
        id="explorer-advanced"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-32px)] w-[min(480px,100%)] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-xl outline-none max-sm:max-h-[88dvh] max-sm:w-full max-sm:rounded-b-none"
      >
        <div className="flex flex-none items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="m-0 text-lg font-semibold">
            Pengaturan lanjutan
          </h2>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            className="-mr-2 grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted hover:bg-surface2 hover:text-text"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="fill-none stroke-current stroke-2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section aria-label="Nilai" className={SECTION}>
            <h3 className={SECTION_TITLE}>Nilai</h3>
            <Segmented
              label="Mode nilai"
              size="sm"
              className="grid w-full grid-cols-4 [&>button]:min-w-0 [&>button]:px-1"
              options={MODE_OPTIONS}
              value={p.view.mode}
              onChange={(mode) => p.onView({ mode })}
            />
          </section>

          <section aria-label="Agregasi" className={SECTION}>
            <h3 className={SECTION_TITLE}>Agregasi</h3>
            <Segmented
              label="Agregasi"
              size="sm"
              className="grid w-full grid-cols-3"
              options={AGG_OPTIONS}
              value={p.view.agg}
              onChange={(agg) => p.onView({ agg })}
            />
            <Switch
              label="Pita min–maks"
              hint={
                p.view.agg === 'd'
                  ? 'Aktif saat agregasi mingguan/bulanan'
                  : 'Rentang terendah–tertinggi dalam periode'
              }
              checked={bandOn}
              disabled={p.view.agg === 'd'}
              onChange={(band) => p.onView({ band })}
            />
            <Switch
              label="Isi hari tanpa data"
              hint="Pakai nilai sebelumnya, ditandai di tooltip"
              checked={p.view.ffill}
              onChange={(ffill) => p.onView({ ffill })}
            />
          </section>

          <section aria-label="Rentang kustom" className={SECTION}>
            <h3 className={SECTION_TITLE}>Rentang kustom</h3>
            <RangeControl
              parts="dates"
              value={p.range}
              onChange={p.onRange}
              lastDate={p.lastDate}
              minDate={p.minDate}
            />
          </section>

          <section aria-label="Seri manual" className={SECTION}>
            <h3 className={SECTION_TITLE}>
              Seri manual{' '}
              <span className="font-normal normal-case tracking-normal">
                · campur gramasi, jual/buyback, varian
              </span>
            </h3>
            {!p.manual ? (
              <p className="m-0 text-xs leading-snug text-muted">
                Mengubah seri di sini beralih ke mode seri manual; pengaturan dasar tetap bisa
                dipulihkan.
              </p>
            ) : null}
            <SeriesBuilder
              options={p.options}
              listed={p.listed}
              perGram={p.view.mode === 'gram'}
              onChange={p.onPicks}
            />
          </section>
        </div>

        <div className="flex flex-none items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={!p.manual}
            onClick={p.onBack}
            className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-text disabled:cursor-not-allowed disabled:text-faint"
          >
            Kembali ke pengaturan dasar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 cursor-pointer rounded-control border-0 bg-btn px-6 text-sm font-semibold text-btntext"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
