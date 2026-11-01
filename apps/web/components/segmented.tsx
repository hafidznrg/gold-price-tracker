'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * Kontrol segmen generik (filter Semua / Emas fisik / Tabungan emas, tab sumber, rentang).
 * `semantics="radio"` (default) = radiogroup; `"tab"` = tablist. Navigasi keyboard: panah, Home,
 * End; fokus langsung memilih. Target sentuh ≥ 44 px. `value` null = tidak ada yang terpilih.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  semantics = 'radio',
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Label aksesibel grup. */
  label: string;
  semantics?: 'radio' | 'tab';
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selected = options.findIndex((o) => o.value === value);
  const tabStop = selected >= 0 && !options[selected]?.disabled ? selected : (enabled[0] ?? -1);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const pos = enabled.indexOf(index);
    let next: number | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    refs.current[next]?.focus();
    const opt = options[next];
    if (opt) onChange(opt.value);
  }

  const tab = semantics === 'tab';
  return (
    <div
      role={tab ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={cn(
        'inline-flex flex-wrap gap-1 rounded-[14px] border border-line bg-surface p-1',
        className,
      )}
    >
      {options.map((o, i) => {
        const active = i === selected;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={tab ? 'tab' : 'radio'}
            {...(tab ? { 'aria-selected': active } : { 'aria-checked': active })}
            disabled={o.disabled}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'min-h-11 min-w-12 cursor-pointer rounded-field border-0 px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'bg-btn text-btntext' : 'bg-transparent text-muted hover:text-text',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
