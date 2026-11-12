'use client';

import { applyTheme, readTheme } from '@/lib/theme';

/** Tombol tema 44×44 px seperti mockup; ikon matahari. */
export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={() => applyTheme(readTheme() === 'dark' ? 'light' : 'dark')}
      aria-label="Ganti tema terang atau gelap"
      title="Ganti tema"
      className="grid size-10 shrink-0 cursor-pointer xl:size-9 place-items-center rounded-control border border-line bg-surface text-text"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
      </svg>
    </button>
  );
}
