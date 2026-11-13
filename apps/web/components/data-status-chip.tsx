import { formatDate, formatTimeWib, jakartaDateOf } from '@/lib/format';
import { readMeta } from '@/lib/data/load-fs';
import { cn } from '@/lib/utils';

/**
 * Chip di header (mockup: "● Data 30 Okt 2026 · 21.10 WIB"): tanggal dan jam keberhasilan scrape
 * harga terbaru dari meta.json. Server component, dirender saat build. Titik hijau bila data ≤ 2
 * hari saat build, abu-abu bila lebih lama.
 */
export function DataStatusChip() {
  const meta = readMeta();
  const prices = meta.sources.filter((s) => s.kind === 'prices' && s.status?.last_success_at);
  const latestAt = prices
    .map((s) => s.status!.last_success_at!)
    .sort()
    .at(-1);
  const date = meta.as_of;
  if (!date) return null;
  const maxAge = Math.max(0, ...prices.map((s) => s.data_age_days ?? 0));
  const day = latestAt ? formatDate(jakartaDateOf(new Date(latestAt))) : formatDate(date);
  const time = latestAt ? formatTimeWib(latestAt) : null;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-[7px] text-xs max-sm:px-2.5 whitespace-nowrap text-muted">
      <span
        aria-hidden="true"
        className={cn('size-[7px] rounded-full', maxAge <= 2 ? 'bg-up' : 'bg-faint')}
      />
      <span className="max-sm:sr-only">Data</span> {day}
      {time ? <span className="max-sm:hidden"> · {time}</span> : null}
    </span>
  );
}
