import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { SiteNav } from '@/components/site-nav';
import { ThemeToggle } from '@/components/theme-toggle';

export const SITE_NAME = 'Harga Emas Historis';

/**
 * Header situs (mockup Main.dc.html). `status` = slot chip umur data di kiri tombol tema
 * ("Data 30 Okt 2026 · 21.10 WIB"), diisi setelah meta.json tersedia (P3-03/P3-09).
 */
export function SiteHeader({ status }: { status?: ReactNode }) {
  return (
    <header className="border-b border-line">
      <div className="wrap flex flex-wrap items-center justify-between gap-x-7 gap-y-3.5 py-[18px]">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3 text-text no-underline hover:text-text"
        >
          <BrandMark />
          <span className="flex min-w-0 flex-col leading-[1.15]">
            <span className="serif text-[23px]">{SITE_NAME}</span>
            <span className="text-[10.5px] tracking-[.16em] text-faint uppercase">
              Antam · UBS · Galeri24
            </span>
          </span>
        </Link>
        <SiteNav className="order-last w-full lg:order-none lg:w-auto" />
        <div className="flex items-center gap-2.5">
          {status}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
