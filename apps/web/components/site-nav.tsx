'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActivePath, NAV_ITEMS } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Pil navigasi; di layar sempit mengisi baris sendiri dan bergulir horizontal bila perlu. */
export function SiteNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? '/';
  return (
    <nav
      aria-label="Navigasi utama"
      className={cn(
        '-mx-1 flex gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-10 shrink-0 items-center rounded-full px-3 text-sm whitespace-nowrap no-underline xl:min-h-9 xl:px-3.5',
              active
                ? // Terang: emas sedikit lebih gelap agar kontras di atas goldsoft ≥ 4,5:1 (5,0 vs 4,28).
                  'bg-goldsoft font-semibold text-gold hover:text-gold light:text-[#7d5c14] light:hover:text-[#7d5c14]'
                : 'text-muted hover:text-text',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
