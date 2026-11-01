import type { Metadata } from 'next';
import { PageIntro } from '@/components/page-intro';
import { UnderConstruction } from '@/components/under-construction';

export const metadata: Metadata = { title: 'Spread' };

export default function SpreadPage() {
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
      <UnderConstruction task="P3-07 · Spread" />
    </>
  );
}
