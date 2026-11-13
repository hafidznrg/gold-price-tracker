import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Lipatan untuk teks pendukung (sumber, catatan kaki) agar tidak bersaing dengan angka utama (D-48).
 * Tertutup secara default; dibuka dengan klik/ketuk/Enter. Tanpa JS (`<details>`), jadi aman di
 * server component, dan isinya tetap ada di DOM untuk pembaca layar dan mesin pencari.
 */
export function InfoDisclosure({
  label = 'Sumber',
  children,
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn('group text-xs text-faint', className)}>
      <summary className="-my-1 inline-flex min-h-7 cursor-pointer list-none items-center gap-1.5 rounded-md text-faint select-none hover:text-text [&::-webkit-details-marker]:hidden">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="flex-none fill-none stroke-current stroke-2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7.5v.5" />
        </svg>
        <span>{label}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="flex-none fill-none stroke-current stroke-[2.4] transition-transform group-open:rotate-180"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-1.5 flex flex-col gap-1 leading-normal">{children}</div>
    </details>
  );
}
