import type { PriceSource } from '@gold/schema';
import type { ReactNode } from 'react';
import { sourceStampText } from '@/lib/source-stamp';
import { cn } from '@/lib/utils';

/**
 * Atribusi sumber + waktu update di setiap tampilan harga (FR-26). Teks diatur `sourceStampText`.
 * `children` = keterangan tambahan setelah waktu (mis. "12 gramasi", "butik Jakarta").
 */
export function SourceStamp({
  source,
  date,
  at = null,
  children,
  className,
}: {
  source: PriceSource;
  /** Tanggal data (`YYYY-MM-DD`). */
  date: string;
  /** `source_updated_at`; diabaikan untuk sumber tanpa jam (UBS). */
  at?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn('m-0 text-[12.5px] leading-normal text-faint', className)}>
      {sourceStampText(source, date, at)}
      {children ? <> · {children}</> : null}
    </p>
  );
}
