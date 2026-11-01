import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pembuka halaman (mockup Explorer/Spread/Data): eyebrow emas, judul serif 56 px, lead muted.
 * Gunakan <em> di `title` untuk aksen emas miring.
 */
export function PageIntro({
  eyebrow,
  title,
  lead,
  aside,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'wrap flex flex-wrap items-end justify-between gap-6 pt-12 pb-[26px] max-sm:pt-9',
        className,
      )}
    >
      <div className="min-w-0 flex-[1_1_560px]">
        <p className="eyebrow m-0 mb-3.5 text-gold">{eyebrow}</p>
        <h1 className="serif m-0 text-[56px] leading-[1.04] max-sm:text-[40px] [&_em]:text-gold">
          {title}
        </h1>
        {lead ? (
          <p className="m-0 mt-4 max-w-[620px] text-[15.5px] leading-[1.65] text-muted">{lead}</p>
        ) : null}
      </div>
      {aside}
    </section>
  );
}
