import type { PriceSource } from '@gold/schema';
import type { ReactNode } from 'react';
import { InfoPopover } from '@/components/info-popover';
import { sourceStampText } from '@/lib/source-stamp';
import { cn } from '@/lib/utils';

/**
 * Atribusi sumber + waktu update di setiap tampilan harga (FR-26). Teks diatur `sourceStampText`.
 * `children` = keterangan tambahan setelah waktu (mis. "12 gramasi", "butik Jakarta").
 * Default tersembunyi di balik popover "ⓘ Sumber" (D-48); `bare` = baris polos, untuk dikelompokkan
 * di dalam satu `InfoPopover` atau panel yang sudah tersembunyi.
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
  return bare ? (
    line
  ) : (
    <InfoPopover
      label="Sumber"
      ariaLabel="Sumber data"
      side="top"
      className={cn('self-start', className)}
    >
      {line}
    </InfoPopover>
  );
}
