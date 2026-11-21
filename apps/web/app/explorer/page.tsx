import type { PriceSource } from '@gold/schema';
import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense } from 'react';
import { ExplorerBoard } from '@/components/explorer-board';
import { PageIntro } from '@/components/page-intro';
import { readMeta } from '@/lib/data/load-fs';
import { calendarFromMeta } from '@/lib/calendar';
import { compareOptions, compareWeights } from '@/lib/bandingkan';
import { explorerOptions } from '@/lib/explorer';

export const metadata: Metadata = {
  title: 'Riwayat harga',
  description:
    'Telusuri dan bandingkan seri harga emas batangan: gabungkan brand, sumber, gramasi, dan jenis harga dalam satu grafik yang bisa dibagikan lewat URL.',
  openGraph: { title: 'Riwayat harga' },
};

export default function ExplorerPage() {
  const meta = readMeta();
  const stamps: Partial<Record<PriceSource, { date: string | null; at: string | null }>> = {};
  for (const s of meta.sources) {
    if (s.kind === 'prices') {
      stamps[s.id as PriceSource] = { date: s.last_data_date, at: s.source_updated_at };
    }
  }
  const options = explorerOptions(meta);
  return (
    <>
      <PageIntro
        eyebrow="Riwayat harga"
        title="Telusuri setiap seri harga"
        lead="Bandingkan brand di berat yang sama. Setiap pengaturan tersimpan di URL sehingga bisa dibagikan apa adanya."
      />
      <NuqsAdapter>
        <Suspense
          fallback={
            // Tinggi dipesan (≈ papan Explorer) agar footer tidak melompat saat papan menggantikan fallback.
            <div className="min-h-[1500px] sm:min-h-[1000px]">
              <p className="wrap py-10 text-sm text-muted">Memuat Riwayat harga…</p>
            </div>
          }
        >
          <ExplorerBoard
            options={options}
            weights={compareWeights(compareOptions(options))}
            asOf={meta.as_of ?? new Date().toISOString().slice(0, 10)}
            stamps={stamps}
            calendar={calendarFromMeta(meta)}
          />
        </Suspense>
      </NuqsAdapter>
    </>
  );
}
