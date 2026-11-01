import Link from 'next/link';
import type { Metadata } from 'next';
import { PageIntro } from '@/components/page-intro';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Halaman tidak ditemukan' };

export default function NotFound() {
  return (
    <>
      <PageIntro
        eyebrow="404"
        title={
          <>
            Halaman <em>tidak ditemukan</em>
          </>
        }
        lead="Alamat ini tidak ada atau sudah dipindahkan. Kembali ke harga hari ini atau telusuri seri harga di Explorer."
      />
      <section className="wrap flex flex-wrap gap-3 pb-16">
        <Button asChild>
          <Link href="/">Ke Hari ini</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/explorer">Buka Explorer</Link>
        </Button>
      </section>
    </>
  );
}
