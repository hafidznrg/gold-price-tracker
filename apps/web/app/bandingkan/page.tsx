import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense } from 'react';
import { BandingkanBoard } from '@/components/bandingkan-board';
import { PageIntro } from '@/components/page-intro';
import { compareOptions, compareWeights, todayCells } from '@/lib/bandingkan';
import { calendarFromMeta } from '@/lib/calendar';
import { readLatest, readMeta } from '@/lib/data/load-fs';
import { explorerOptions } from '@/lib/explorer';

export const metadata: Metadata = {
  title: 'Bandingkan',
  description:
    'Bandingkan harga emas Antam, UBS, Galeri24, dan Tabungan Emas Pegadaian pada berat yang sama, serta premi Antam terhadap harga emas dunia dari waktu ke waktu.',
  openGraph: { title: 'Bandingkan' },
};

export default function BandingkanPage() {
  const meta = readMeta();
  const latest = readLatest();
  const options = compareOptions(explorerOptions(meta));
  return (
    <>
      <PageIntro
        eyebrow="Bandingkan"
        title={
          <>
            Emas fisik dan tabungan <em>di berat yang sama</em>
          </>
        }
        lead="Lihat mana yang termurah per gram: Antam, UBS, Galeri24, atau Tabungan Emas Pegadaian, dan seberapa jauh harga di Pegadaian berbeda dari toko resmi penerbitnya."
      />
      <NuqsAdapter>
        <Suspense
          fallback={
            // Tinggi dipesan (≈ papan Bandingkan) agar footer tidak melompat saat papan menggantikan fallback.
            <div className="min-h-[2400px] sm:min-h-[1800px]">
              <p className="wrap py-10 text-sm text-muted">Memuat Bandingkan…</p>
            </div>
          }
        >
          <BandingkanBoard
            options={options}
            weights={compareWeights(options)}
            today={todayCells(latest)}
            asOf={meta.as_of ?? latest.as_of ?? new Date().toISOString().slice(0, 10)}
            calendar={calendarFromMeta(meta)}
          />
        </Suspense>
      </NuqsAdapter>
    </>
  );
}
