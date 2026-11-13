'use client';

import {
  ArrowLeftRight,
  Calculator,
  ChartLine,
  ChartNoAxesCombined,
  Database,
  Ellipsis,
  House,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { isActivePath, NAV_ITEMS } from '@/lib/nav';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  '/': House,
  '/explorer': ChartLine,
  '/spread': ArrowLeftRight,
  '/bandingkan': Scale,
  '/kalkulator': Calculator,
  '/kelipatan': ChartNoAxesCombined,
  '/data': Database,
};

const MAIN = NAV_ITEMS.filter((i) => !i.more);
const MORE = NAV_ITEMS.filter((i) => i.more);

const TAB =
  'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-control text-2xs font-medium tracking-tight no-underline';
const ACTIVE = 'bg-goldsoft font-semibold text-gold-strong hover:text-gold-strong';
const IDLE = 'text-muted hover:text-text';

/**
 * Menu bawah HP (< 640 px, design system Momen Emas, D-53): empat halaman utama + "Lainnya"
 * (Kalkulator, Kelipatan, Data, tombol tema). Tinggi 64 px di luar safe-area.
 */
export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const moreActive = MORE.some((i) => isActivePath(pathname, i.href));

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <nav
      ref={rootRef}
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {open ? (
        <div
          id={panelId}
          className="absolute inset-x-3 bottom-full mb-2 flex flex-col gap-0.5 rounded-card-sm border border-line bg-surface p-2 shadow-[0_12px_32px_rgba(0,0,0,.18)]"
        >
          {MORE.map((item) => {
            const Icon = ICONS[item.href] ?? Ellipsis;
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm no-underline',
                  active ? ACTIVE : 'text-text hover:bg-surface2 hover:text-text',
                )}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <div className="my-1 border-t border-line" />
          <ThemeToggle withLabel />
        </div>
      ) : null}
      <div className="flex h-16 items-stretch gap-0.5 px-1.5 py-1.5">
        {MAIN.map((item) => {
          const Icon = ICONS[item.href] ?? Ellipsis;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(TAB, active ? ACTIVE : IDLE)}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="max-w-full truncate">{item.short ?? item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((v) => !v)}
          className={cn(TAB, 'cursor-pointer', moreActive || open ? ACTIVE : IDLE)}
        >
          <Ellipsis size={20} aria-hidden="true" />
          <span>Lainnya</span>
        </button>
      </div>
    </nav>
  );
}
