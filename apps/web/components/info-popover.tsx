'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tombol ⓘ yang membuka popover di tempatnya (seperti catatan kartu harga). Tidak menggeser tata
 * letak; menutup saat klik di luar atau Escape. `label` opsional ditampilkan di samping ikon.
 */
export function InfoPopover({
  label,
  ariaLabel,
  children,
  align = 'left',
  side = 'bottom',
  className,
}: {
  label?: ReactNode;
  ariaLabel: string;
  children: ReactNode;
  align?: 'left' | 'right';
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
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
  return (
    <div ref={boxRef} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label ? undefined : ariaLabel}
        title={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1.5 rounded-md border-none bg-transparent text-xs text-faint hover:text-text',
          label ? 'min-h-7 px-0' : '-m-1.5 size-8 justify-center',
        )}
      >
        <svg
          width={label ? 13 : 16}
          height={label ? 13 : 16}
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="flex-none fill-none stroke-current stroke-2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7.5v.5" />
        </svg>
        {label ? <span>{label}</span> : null}
      </button>
      {open ? (
        <div
          id={panelId}
          role="note"
          className={cn(
            'absolute z-30 flex w-[min(360px,calc(100vw-48px))] flex-col gap-1 rounded-field border border-line bg-surface px-3.5 py-3 text-left text-xs leading-normal font-normal text-muted shadow-lg',
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
            align === 'left' ? 'left-0' : 'right-0',
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
