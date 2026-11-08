import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense } from 'react';
import { KalkulatorBoard } from '@/components/kalkulator-board';
import { PageIntro } from '@/components/page-intro';
import { compareOptions } from '@/lib/bandingkan';
import { calendarFromMeta } from '@/lib/calendar';
import { readLatest, readMeta } from '@/lib/data/load-fs';
import { explorerOptions } from '@/lib/explorer';

export const metadata: Metadata = {
  title: 'Kalkulator',
  description:
    'Hitung untung atau rugi emas yang dibeli pada tanggal tertentu jika dijual kembali dengan harga buyback hari ini, lengkap dengan titik impas dan grafik nilai jual sejak tanggal beli.',
  openGraph: { title: 'Kalkulator' },
};

export default function KalkulatorPage() {
  const meta = readMeta();
  const latest = readLatest();
  const options = compareOptions(explorerOptions(meta));
  return (
    <>
      <PageIntro
        eyebrow="Kalkulator"
        title={
          <>
            Kalau dijual hari ini, <em>untung berapa?</em>
          </>
        }
        lead="Masukkan kapan dan di mana emas fisik atau tabungan emas dibeli, lalu pilih ke mana akan dijual kembali. Hasilnya memakai harga buyback terbaru."
      />
      <NuqsAdapter>
        <Suspense
          fallback={
            // Tinggi dipesan (≈ papan Kalkulator) agar footer tidak melompat saat papan menggantikan fallback.
            <div className="min-h-[1700px] sm:min-h-[1000px]">
              <p className="wrap py-10 text-sm text-muted">Memuat Kalkulator…</p>
            </div>
          }
        >
          <KalkulatorBoard
            options={options}
            asOf={meta.as_of ?? latest.as_of ?? new Date().toISOString().slice(0, 10)}
            calendar={calendarFromMeta(meta)}
          />
        </Suspense>
      </NuqsAdapter>
    </>
  );
}
