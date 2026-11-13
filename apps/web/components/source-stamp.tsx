import type { PriceSource } from '@gold/schema';
import type { ReactNode } from 'react';
import { InfoDisclosure } from '@/components/info-disclosure';
import { sourceStampText } from '@/lib/source-stamp';
import { cn } from '@/lib/utils';

/**
 * Atribusi sumber + waktu update di setiap tampilan harga (FR-26). Teks diatur `sourceStampText`.
 * `children` = keterangan tambahan setelah waktu (mis. "12 gramasi", "butik Jakarta").
 * Default terlipat di balik "Sumber" (D-48); `bare` = baris polos, untuk dikelompokkan di dalam
 * satu `InfoDisclosure` atau panel yang sudah tersembunyi.
 */
export function SourceStamp({
  source,
  date,
  at = null,
  children,
  className,
  bare = false,
}: {
  source: PriceSource;
  /** Tanggal data (`YYYY-MM-DD`). */
  date: string;
  /** `source_updated_at`; diabaikan untuk sumber tanpa jam (UBS). */
  at?: string | null;
  children?: ReactNode;
  className?: string;
  bare?: boolean;
}) {
  const line = (
    <p className={cn('m-0 text-xs leading-normal text-faint', bare && className)}>
      {sourceStampText(source, date, at)}
      {children ? <> · {children}</> : null}
    </p>
  );
  return bare ? line : <InfoDisclosure className={className}>{line}</InfoDisclosure>;
}
