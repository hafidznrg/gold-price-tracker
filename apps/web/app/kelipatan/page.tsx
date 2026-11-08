import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense } from 'react';
import { KelipatanBoard } from '@/components/kelipatan-board';
import { PageIntro } from '@/components/page-intro';
import { readAnnual, readLatest, readMeta } from '@/lib/data/load-fs';

export const metadata: Metadata = {
  title: 'Kelipatan',
  description:
    'Berapa kali lipat harga emas dalam rupiah, emas dalam dolar, dan kurs USD/IDR naik sejak tahun dasar pilihan Anda, pada skala logaritmik dengan peristiwa penting dan titik spot hari ini.',
  openGraph: { title: 'Kelipatan' },
};

export default function KelipatanPage() {
  const annual = readAnnual();
  const latest = readLatest();
  // events.yml dibaca saat build (build-data → meta.json#events); hanya tanggal dan label yang dipakai.
  const events = readMeta().events.map((e) => ({ date: e.date, label: e.label }));
  return (
    <NuqsAdapter>
      <Suspense
        fallback={
          // Tinggi dipesan (≈ papan Kelipatan) agar footer tidak melompat saat papan menggantikan fallback.
          <div className="min-h-[2600px] sm:min-h-[2300px]">
            <PageIntro
              eyebrow="Kelipatan · skala log"
              title="Berapa kali lipat harga emas naik"
              lead="Memuat grafik kelipatan…"
            />
          </div>
        }
      >
        <KelipatanBoard
          annual={annual.rows}
          until={annual.until}
          spot={latest.spot}
          events={events}
        />
      </Suspense>
    </NuqsAdapter>
  );
}
