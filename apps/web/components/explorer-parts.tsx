import type { ReactNode } from 'react';
import { colorVar, SOURCE_LABELS, type PriceField } from '@/lib/data';
import {
  optionBrandName,
  type Aggregation,
  type ExplorerOption,
  type ValueMode,
} from '@/lib/explorer';
import { formatDate, formatWeight } from '@/lib/format';
import { cn } from '@/lib/utils';

// Potongan kecil yang dipakai bersama papan Riwayat harga, baris kontrol, dan pop-up Lanjutan.

export const FIELD =
  'h-11 w-full rounded-field border border-line bg-surface2 px-3 text-sm text-text';
export const FIELD_LABEL = 'flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted';
export const PRICE_LABEL: Record<PriceField, string> = { sell: 'Jual', buyback: 'Buyback' };
export const DIR_CLASS = { up: 'text-up', down: 'text-down', flat: 'text-muted' } as const;

export const MODE_OPTIONS: { value: ValueMode; label: string }[] = [
  { value: 'nominal', label: 'Per keping' },
  { value: 'gram', label: 'Per gram' },
  { value: 'index', label: 'Indeks' },
  { value: 'pct', label: '% ubah' },
];
export const AGG_OPTIONS: { value: Aggregation; label: string }[] = [
  { value: 'd', label: 'Harian' },
  { value: 'w', label: 'Mingguan' },
  { value: 'm', label: 'Bulanan' },
];
export const AGG_NOUN: Record<Aggregation, string> = {
  d: 'harian',
  w: 'mingguan',
  m: 'bulanan',
};
export const VALUE_FORMAT = {
  nominal: 'rupiah',
  gram: 'rupiah',
  index: 'number',
  pct: 'percent',
} as const;

export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Elemen pertama untuk tiap kunci, urutan asli dipertahankan. */
export function uniqBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const x of xs) if (!seen.has(key(x))) seen.set(key(x), x);
  return [...seen.values()];
}

export function seriesParts(o: ExplorerOption, price: PriceField): { title: string; meta: string } {
  return {
    title: [optionBrandName(o), SOURCE_LABELS[o.source]].join(' · '),
    meta: [o.kind === 'fisik' ? formatWeight(o.w) : null, PRICE_LABEL[price]]
      .filter(Boolean)
      .join(' · '),
  };
}

export function seriesLabel(o: ExplorerOption, price: PriceField): string {
  const { title, meta } = seriesParts(o, price);
  return meta ? `${title} · ${meta}` : title;
}

/** Judul ringkas di daftar seri: brand + gramasi (sumber dan jenis harga ditampilkan terpisah). */
export function seriesTitle(o: ExplorerOption): string {
  return [optionBrandName(o), o.kind === 'fisik' ? formatWeight(o.w) : null]
    .filter(Boolean)
    .join(' · ');
}

export function seriesMeta(o: ExplorerOption, price: PriceField, perGram = false): string {
  const first = o.first[price];
  return [
    o.kind === 'fisik' && !perGram ? 'per keping' : 'per gram',
    o.source === 'logammulia' && price === 'sell' ? 'harga dasar' : null,
    price === 'buyback' && o.buybackFromGram ? 'buyback 1 g × berat' : null,
    o.variant === 'non_pegadaian' ? 'keping dibeli di luar Pegadaian' : null,
    o.source === 'hrtagold' && price === 'sell' ? 'sudah termasuk pajak' : null,
    first ? `sejak ${formatDate(first)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function PriceTag({ price }: { price: PriceField }) {
  return (
    <span className="flex-none rounded-full border border-line bg-surface px-1.5 py-px text-2xs font-semibold uppercase tracking-[.06em] text-muted">
      {PRICE_LABEL[price]}
    </span>
  );
}

export function Swatch({
  color,
  dashed,
  width = 26,
  className,
}: {
  color: string;
  dashed: boolean;
  width?: number;
  className?: string;
}) {
  return (
    <svg
      width={width}
      height="10"
      viewBox={`0 0 ${width} 10`}
      aria-hidden="true"
      className={cn('flex-none', className)}
    >
      <path
        d={`M1 5 H${width - 1}`}
        fill="none"
        stroke={colorVar(color as never)}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray={dashed ? '4 3' : undefined}
      />
    </svg>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 py-10 text-center text-sm text-muted">{children}</p>;
}

export function Chevron({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(
        'flex-none fill-none stroke-current stroke-[2.6] text-faint transition-transform',
        open && 'rotate-180',
        className,
      )}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
