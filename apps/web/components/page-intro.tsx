import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pembuka halaman: eyebrow emas, judul serif, lead muted. Gunakan <em> di `title` untuk aksen
 * emas miring. Default `compact` (D-47) agar grafik/alat utama halaman langsung terlihat;
 * `hero` = ukuran mockup asli (judul 56 px), dipakai halaman non-alat seperti 404.
 */
export function PageIntro({
  eyebrow,
  title,
  lead,
  aside,
  className,
  size = 'compact',
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  className?: string;
  size?: 'compact' | 'hero';
}) {
  const hero = size === 'hero';
  return (
    <section
      className={cn(
        'wrap flex flex-wrap items-end justify-between',
        hero
          ? 'gap-6 pt-12 pb-[26px] max-sm:pt-9'
          : 'gap-x-6 gap-y-3 pt-6 pb-5 max-sm:pt-4 max-sm:pb-3',
        className,
      )}
    >
      <div className="min-w-0 flex-[1_1_480px]">
        <p className={cn('eyebrow m-0 text-gold', hero ? 'mb-3.5' : 'mb-1.5 max-sm:hidden')}>
          {eyebrow}
        </p>
        <h1
          className={cn(
            'serif m-0 [&_em]:text-gold',
            hero
              ? 'text-[56px] leading-[1.04] max-sm:text-[40px]'
              : 'text-[36px] leading-[1.1] max-sm:text-[28px]',
          )}
        >
          {title}
        </h1>
        {lead ? (
          <p
            className={cn(
              'm-0 text-muted',
              hero
                ? 'mt-4 max-w-[620px] text-[15.5px] leading-[1.65]'
                : 'mt-2 max-w-[760px] text-[14px] leading-[1.55] max-sm:hidden',
            )}
          >
            {lead}
          </p>
        ) : null}
      </div>
      {aside}
    </section>
  );
}
