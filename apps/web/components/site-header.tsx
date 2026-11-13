import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark, Wordmark } from '@/components/brand-mark';
import { SiteNav } from '@/components/site-nav';
import { ThemeToggle } from '@/components/theme-toggle';

export const SITE_NAME = 'Momen Emas';
export const SITE_TAGLINE = 'Temukan momen terbaik membeli emas';

/**
 * Header situs, dipadatkan (D-47): satu baris di ≥ 1280 px (brand · nav · status), dua baris di
 * bawahnya (brand + status, lalu nav bergulir). `status` = slot chip umur data di kiri tombol tema.
 */
export function SiteHeader({ status }: { status?: ReactNode }) {
  return (
    <header className="border-b border-line">
      <div className="wrap flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-2.5 xl:flex-nowrap">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 text-text no-underline hover:text-text"
        >
          <BrandMark
            id="me-logo-h"
            height={26}
            className="shrink-0 max-sm:h-[22px] max-sm:w-auto"
          />
          <span className="flex min-w-0 flex-col leading-[1.1]">
            <Wordmark className="text-xl max-sm:text-lg" />
            <span className="hidden text-[9.5px] tracking-[.16em] text-faint uppercase 2xl:block">
              Antam · UBS · Galeri24
            </span>
          </span>
        </Link>
        {/* HP (< 640 px): navigasi dan tombol tema pindah ke menu bawah (BottomNav, D-53). */}
        <SiteNav className="order-last w-full max-sm:hidden xl:order-none xl:w-auto" />
        <div className="flex items-center gap-2">
          {status}
          <span className="max-sm:hidden">
            <ThemeToggle />
          </span>
        </div>
      </div>
    </header>
  );
}
