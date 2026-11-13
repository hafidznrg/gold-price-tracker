'use client';

import { useThemeAttribute } from '@/components/charts/use-theme-attribute';
import { applyTheme } from '@/lib/theme';

const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function SunIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON} className={className}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON} className={className}>
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
    </svg>
  );
}

/**
 * Sakelar "Mode gelap" (role=switch; gelap = tema Navy). Ikon dan kenop ditukar lewat varian CSS
 * `light:`/`dark:` agar langsung benar sebelum hidrasi; `aria-checked` dari atribut `data-theme`.
 * Default ikon 40×40 px di header (ikon = mode tujuan: bulan saat terang, matahari saat gelap);
 * `withLabel` = baris berteks dengan sakelar untuk menu "Lainnya" di HP (D-53).
 */
export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const dark = useThemeAttribute() === 'dark';
  const toggle = () => applyTheme(dark ? 'light' : 'dark');

  if (withLabel) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={dark}
        onClick={toggle}
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-left text-sm text-text hover:bg-surface2"
      >
        <MoonIcon />
        <span className="flex-1">Mode gelap</span>
        <span
          aria-hidden="true"
          className="relative h-6 w-10 flex-none rounded-full bg-line transition-colors dark:bg-gold"
        >
          <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow transition-transform dark:translate-x-4" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Mode gelap"
      title={dark ? 'Beralih ke mode terang' : 'Beralih ke mode gelap'}
      onClick={toggle}
      className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-control border border-line bg-surface text-text xl:size-9"
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="light:hidden" />
    </button>
  );
}
