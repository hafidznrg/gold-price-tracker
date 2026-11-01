import type { Metadata } from 'next';
import { PageIntro } from '@/components/page-intro';
import { UnderConstruction } from '@/components/under-construction';

export const metadata: Metadata = { title: 'Explorer' };

export default function ExplorerPage() {
  return (
    <>
      <PageIntro
        eyebrow="Explorer"
        title="Telusuri setiap seri harga"
        lead="Gabungkan brand, sumber, gramasi, dan jenis harga dalam satu grafik. Setiap pengaturan tersimpan di URL sehingga bisa dibagikan apa adanya."
      />
      <UnderConstruction task="P3-06 · Explorer" />
    </>
  );
}
