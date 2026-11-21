import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense } from 'react';
import { PageIntro } from '@/components/page-intro';
import { SpreadBoard } from '@/components/spread-board';
import { calendarFromMeta } from '@/lib/calendar';
import { readLatest, readMeta } from '@/lib/data/load-fs';
import { barSources, buildOptions, compareItems } from '@/lib/spread';

export const metadata: Metadata = {
  title: 'Spread',
  description:
    'Bandingkan spread (selisih harga jual dan buyback) emas batangan Antam, UBS, Galeri24, Lotus Archi, EMASKU, dan Tabungan Emas Pegadaian per gramasi dan dari waktu ke waktu.',
  openGraph: { title: 'Spread' },
};

export default function SpreadPage() {
  const latest = readLatest();
  const { sell, buyback } = buildOptions(latest);

  const bars = barSources(latest);

  return (
    <>
      <PageIntro
        eyebrow="Spread"
        title={
          <>
            Jarak antara harga beli <em>dan jual kembali</em>
          </>
        }
        lead="Spread adalah selisih harga jual toko dengan harga buyback. Makin sempit, makin cepat emas yang dibeli kembali ke titik impas."
      />
      <NuqsAdapter>
        <Suspense fallback={<div className="min-h-[1800px]" />}>
          <SpreadBoard
            sellOptions={sell}
            buybackOptions={buyback}
            compare={compareItems(latest)}
            bars={bars}
            asOf={latest.as_of ?? new Date().toISOString().slice(0, 10)}
            calendar={calendarFromMeta(readMeta())}
          />
        </Suspense>
      </NuqsAdapter>
    </>
  );
}
