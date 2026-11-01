import { UnderConstruction } from '@/components/under-construction';

export default function HomePage() {
  return (
    <>
      <section className="wrap pt-[60px] pb-[30px] max-sm:pt-10">
        <p className="eyebrow m-0 mb-4 text-gold">Harga per 1 gram</p>
        <h1 className="serif m-0 text-[72px] leading-none max-sm:text-[44px]">
          Harga emas <em className="text-gold">hari ini</em>
        </h1>
        <p className="m-0 mt-[22px] max-w-[540px] text-base leading-[1.65] text-muted">
          Harga jual dan buyback emas batangan Antam, UBS, dan Galeri24, ditambah Tabungan Emas
          Pegadaian. Dikumpulkan otomatis setiap pagi, divalidasi, lalu disimpan sebagai data
          terbuka.
        </p>
      </section>
      <UnderConstruction task="P3-05 · Hari ini" />
    </>
  );
}
