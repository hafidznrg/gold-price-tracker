'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Chevron, Swatch } from '@/components/explorer-parts';
import { useViewportClamp } from '@/components/use-viewport-clamp';
import { COMPARE_DEFS } from '@/lib/bandingkan';
import { colorVar } from '@/lib/data';
import type { ExplorerOption } from '@/lib/explorer';
import { formatWeight } from '@/lib/format';
import { brandAvailability, SHOW_LABELS, SHOW_MODES, type ShowMode } from '@/lib/riwayat';
import { cn } from '@/lib/utils';

const TRIGGER =
  'inline-flex min-h-10 w-full min-w-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-field border bg-surface px-3 text-sm max-sm:gap-1.5 max-sm:px-2.5 text-text transition-colors hover:bg-surface2';
const LINK_BTN =
  'cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-gold-strong hover:underline';

/**
 * Dropdown baris kontrol: tombol (`aria-expanded`) + panel yang menutup saat klik di luar, Escape
 * (fokus kembali ke tombol), atau fokus keluar. Di HP panel selebar baris kontrol (lembar), di
 * layar lebar menempel di bawah tombolnya.
 */
function Dropdown({
  trigger,
  panelLabel,
  panelClassName,
  active,
  children,
}: {
  trigger: ReactNode;
  panelLabel: string;
  panelClassName?: string;
  /** Tombol diberi garis emas (mis. saat terbuka atau berisi pilihan). */
  active?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useViewportClamp(panelRef, open);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div
      ref={boxRef}
      className="inline-flex min-w-0 max-sm:flex-auto sm:relative"
      onBlur={(e) => {
        if (open && !boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(TRIGGER, open || active ? 'border-goldline' : 'border-line')}
      >
        {trigger}
        <Chevron open={open} className="ml-auto max-sm:hidden" />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={panelLabel}
          className={cn(
            'absolute z-40 mt-1.5 rounded-card border border-line bg-surface p-2 shadow-lg',
            // HP: selebar baris kontrol (jangkar = baris, bukan tombol); layar lebar: di bawah tombol.
            'top-full max-sm:inset-x-0 sm:left-0',
            panelClassName,
          )}
        >
          {children(() => {
            setOpen(false);
            btnRef.current?.focus();
          })}
        </div>
      ) : null}
    </div>
  );
}

function OptionList<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-0.5 p-0">
      {options.map((o) => (
        <li key={o.value}>
          <button
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onPick(o.value)}
            className={cn(
              'flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-field border-0 px-3 text-left text-sm',
              o.value === value
                ? 'bg-goldsoft font-semibold text-gold-strong'
                : 'bg-transparent text-text hover:bg-surface2',
            )}
          >
            {o.label}
            {o.value === value ? <Check /> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn('flex-none fill-none stroke-current stroke-[3]', className)}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export interface ExplorerToolbarProps {
  options: readonly ExplorerOption[];
  weights: readonly number[];
  weight: number;
  onWeight: (w: number) => void;
  show: ShowMode;
  onShow: (v: ShowMode) => void;
  /** Id brand terpilih di URL (bisa memuat yang tak tersedia di gramasi ini). */
  brandIds: readonly string[];
  onBrands: (ids: string[]) => void;
  /** Mode seri manual: tiga dropdown diganti satu tombol. */
  manual: boolean;
  manualCount: number;
  onBack: () => void;
  advOpen: boolean;
  onOpenAdvanced: () => void;
}

/** Satu baris kontrol di atas grafik (D-71): Gramasi · Tampilkan · Brand, Lanjutan. Rentang ada di baris periode (D-72). */
export function ExplorerToolbar(p: ExplorerToolbarProps) {
  const rows = COMPARE_DEFS.map((d) => ({
    d,
    a: brandAvailability(d, p.weight, p.show, p.options),
  }));
  const availableIds = rows.filter((r) => r.a.ok).map((r) => r.d.id);
  const active = rows.filter((r) => r.a.ok && p.brandIds.includes(r.d.id));
  const toggle = (id: string) =>
    p.onBrands(p.brandIds.includes(id) ? p.brandIds.filter((x) => x !== id) : [...p.brandIds, id]);

  return (
    <div className="relative mb-4 flex flex-wrap items-center gap-2 max-sm:gap-1.5">
      {p.manual ? (
        <>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={p.advOpen}
            onClick={p.onOpenAdvanced}
            className={cn(TRIGGER, 'w-auto border-goldline font-semibold max-sm:flex-1')}
          >
            Seri manual ({p.manualCount})
            <Chevron className="ml-1" />
          </button>
          <button type="button" onClick={p.onBack} className={cn(LINK_BTN, 'px-1')}>
            Kembali ke pengaturan dasar
          </button>
        </>
      ) : (
        <>
          <Dropdown
            panelLabel="Gramasi"
            panelClassName="min-w-[168px]"
            trigger={
              <>
                <span className="text-muted max-lg:hidden">Gramasi</span>
                <span className="num font-semibold">{formatWeight(p.weight)}</span>
              </>
            }
          >
            {(close) => (
              <OptionList
                label="Pilih gramasi"
                options={p.weights.map((w) => ({ value: String(w), label: formatWeight(w) }))}
                value={String(p.weight)}
                onPick={(v) => {
                  p.onWeight(Number(v));
                  close();
                }}
              />
            )}
          </Dropdown>

          <Dropdown
            panelLabel="Tampilkan"
            panelClassName="min-w-[200px]"
            trigger={
              <>
                <span className="text-muted max-lg:hidden">Tampilkan</span>
                <span className="font-semibold">{SHOW_LABELS[p.show]}</span>
              </>
            }
          >
            {(close) => (
              <OptionList
                label="Pilih tampilan"
                options={SHOW_MODES.map((m) => ({ value: m, label: SHOW_LABELS[m] }))}
                value={p.show}
                onPick={(v) => {
                  p.onShow(v);
                  close();
                }}
              />
            )}
          </Dropdown>

          <Dropdown
            panelLabel="Brand"
            panelClassName="sm:w-[380px]"
            active
            trigger={
              <>
                <span aria-hidden="true" className="flex items-center gap-0.5 max-sm:hidden">
                  {active.slice(0, 8).map(({ d }) => (
                    <span
                      key={d.id}
                      className="size-2 rounded-full"
                      style={{ background: colorVar(d.color) }}
                    />
                  ))}
                </span>
                <span className="font-semibold">{active.length} brand</span>
              </>
            }
          >
            {() => (
              <>
                <div className="flex items-center justify-between gap-3 px-2 pb-1.5 pt-1">
                  <span className="text-2xs font-semibold uppercase tracking-[.1em] text-faint">
                    Brand · {formatWeight(p.weight)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className={LINK_BTN}
                      onClick={() => p.onBrands(availableIds)}
                    >
                      Semua
                    </button>
                    <span aria-hidden="true" className="text-faint">
                      ·
                    </span>
                    <button type="button" className={LINK_BTN} onClick={() => p.onBrands([])}>
                      Kosongkan
                    </button>
                  </span>
                </div>
                <ul aria-label="Pilih brand" className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {rows.map(({ d, a }) => {
                    const checked = a.ok && p.brandIds.includes(d.id);
                    return (
                      <li key={d.id}>
                        <label
                          className={cn(
                            'relative flex min-h-10 items-center gap-2.5 rounded-field px-2 text-sm',
                            a.ok ? 'cursor-pointer hover:bg-surface2' : 'cursor-not-allowed',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!a.ok}
                            onChange={() => toggle(d.id)}
                            className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              'grid size-[18px] flex-none place-items-center rounded-[5px] border text-btntext peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold',
                              checked ? 'border-btn bg-btn' : 'border-line bg-surface',
                              !a.ok && 'opacity-50',
                            )}
                          >
                            {checked ? <Check className="size-3" /> : null}
                          </span>
                          <span className={cn('flex-none', !a.ok && 'opacity-40')}>
                            <Swatch color={d.color} dashed={d.dashed} width={22} />
                          </span>
                          <span className={cn('min-w-0 flex-1 truncate', !a.ok && 'text-faint')}>
                            {d.brandName}
                          </span>
                          <span className="min-w-0 flex-none truncate text-right text-xs text-muted">
                            <span className={a.ok ? undefined : 'text-faint'}>
                              {d.sourceName}
                              {a.ok ? (d.linear ? ' · per gram' : '') : ` · ${a.reason}`}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Dropdown>
        </>
      )}

      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={p.advOpen}
        aria-controls="explorer-advanced"
        onClick={p.onOpenAdvanced}
        className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-field border border-goldline bg-goldsoft px-3.5 text-sm font-semibold text-gold-strong sm:ml-auto max-sm:px-2.5"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="flex-none fill-none stroke-current stroke-2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
        <span className="max-sm:sr-only">Lanjutan</span>
      </button>
    </div>
  );
}
