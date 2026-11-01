import type { Metadata } from 'next';
import { PageIntro } from '@/components/page-intro';
import { UnderConstruction } from '@/components/under-construction';

export const metadata: Metadata = { title: 'Data' };

export default function DataPage() {
  return (
    <>
      <PageIntro
        eyebrow="Data terbuka"
        title={
          <>
            Unduh <em>setiap seri</em>
          </>
        }
        lead="Data mentah yang sama dengan yang dipakai grafik di situs ini, diperbarui otomatis setiap hari. Bebas dipakai untuk analisis pribadi."
        aside={
          <span className="rounded-full border border-line px-[13px] py-[9px] text-[12.5px] text-muted">
            CSV UTF-8 · koma · tanggal Asia/Jakarta
          </span>
        }
      />
      <UnderConstruction task="P3-08 · Data" />
    </>
  );
}
