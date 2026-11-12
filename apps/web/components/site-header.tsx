import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { SiteNav } from '@/components/site-nav';
import { ThemeToggle } from '@/components/theme-toggle';

export const SITE_NAME = 'Harga Emas Historis';

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
          <BrandMark size={30} />
          <span className="flex min-w-0 flex-col leading-[1.1]">
            <span className="serif text-[19px] whitespace-nowrap max-sm:text-[17px]">
              {SITE_NAME}
            </span>
            <span className="hidden text-[9.5px] tracking-[.16em] text-faint uppercase 2xl:block">
              Antam · UBS · Galeri24
            </span>
          </span>
        </Link>
        <SiteNav className="order-last w-full xl:order-none xl:w-auto" />
        <div className="flex items-center gap-2">
          {status}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
