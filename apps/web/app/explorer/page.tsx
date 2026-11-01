import type { PriceSource } from '@gold/schema';
import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense } from 'react';
import { ExplorerBoard } from '@/components/explorer-board';
import { PageIntro } from '@/components/page-intro';
import { readMeta } from '@/lib/data/load-fs';
import { explorerOptions } from '@/lib/explorer';

export const metadata: Metadata = {
  title: 'Explorer',
  description:
    'Telusuri dan bandingkan seri harga emas batangan: gabungkan brand, sumber, gramasi, dan jenis harga dalam satu grafik yang bisa dibagikan lewat URL.',
  openGraph: { title: 'Explorer' },
};

export default function ExplorerPage() {
  const meta = readMeta();
  const stamps: Partial<Record<PriceSource, { date: string | null; at: string | null }>> = {};
  for (const s of meta.sources) {
    if (s.kind === 'prices') {
      stamps[s.id as PriceSource] = { date: s.last_data_date, at: s.source_updated_at };
    }
  }
  return (
    <>
      <PageIntro
        eyebrow="Explorer"
        title="Telusuri setiap seri harga"
        lead="Gabungkan brand, sumber, gramasi, dan jenis harga dalam satu grafik. Setiap pengaturan tersimpan di URL sehingga bisa dibagikan apa adanya."
      />
      <NuqsAdapter>
        <Suspense fallback={<p className="wrap py-10 text-sm text-muted">Memuat Explorer…</p>}>
          <ExplorerBoard
            options={explorerOptions(meta)}
            asOf={meta.as_of ?? new Date().toISOString().slice(0, 10)}
            stamps={stamps}
          />
        </Suspense>
      </NuqsAdapter>
    </>
  );
}
