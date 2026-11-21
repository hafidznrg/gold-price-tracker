import Link from 'next/link';
import type { Momen } from '@/lib/momen';

/**
 * Blok "Momen hari ini" (D-76): kalimat deskriptif hasil hitung saat build, tiap kalimat tautan
 * ke Riwayat harga. Ringan: garis emas di kiri dan latar goldsoft, bukan kartu. Kosong → tak tampil.
 */
export function HomeMomen({ items }: { items: readonly Momen[] }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="momen-title"
      data-testid="home-momen"
      className="rounded-r-xl border-l-[3px] border-gold bg-goldsoft px-4 py-3 max-sm:px-3.5 max-sm:py-2.5"
    >
      <h2
        id="momen-title"
        className="eyebrow m-0 mb-1.5 text-xs tracking-[0.14em] text-gold-strong"
      >
        Momen hari ini
      </h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.slice(0, 3).map((m) => (
          <li key={m.href} className="m-0">
            <Link
              href={m.href}
              className="group rounded-sm text-[15px] leading-snug text-text no-underline hover:underline max-sm:text-[13px]"
            >
              {m.text}
              <span
                aria-hidden="true"
                className="ml-1.5 inline-block text-gold transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-1.5 text-xs text-faint max-sm:text-[11px]">
        Ringkasan otomatis dari data, bukan rekomendasi investasi.
      </p>
    </section>
  );
}
