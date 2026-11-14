const TERMS = [
  {
    title: 'Harga jual',
    body: 'Harga yang Anda bayar untuk membeli satu keping dari penerbit.',
  },
  {
    title: 'Buyback',
    body: 'Harga yang dibayar penerbit bila Anda menjual kembali kepingnya.',
  },
  {
    title: 'Spread (selisih jual-beli)',
    body: 'Kerugian bila dibeli lalu langsung dijual lagi. Makin kecil, makin cepat balik modal.',
  },
  {
    title: 'Premi di atas spot',
    body: 'Seberapa mahal emas batangan dibanding harga emas dunia dalam rupiah.',
  },
] as const;

const FAQ = [
  {
    q: 'Kapan harga diperbarui?',
    a: 'Logam Mulia dan UBS dicek setiap pagi; Pegadaian di empat slot sepanjang hari. Jam pembaruan tiap sumber terlihat di tombol "Diperbarui" di atas.',
  },
  {
    q: 'Kenapa harga Antam di Logam Mulia dan Pegadaian berbeda?',
    a: 'Harga Logam Mulia adalah harga dasar sebelum PPh 0,25%, sedangkan Pegadaian menjual dengan harganya sendiri.',
  },
  {
    q: 'Kenapa buyback Galeri24 kosong?',
    a: 'Pegadaian tidak menampilkan harga buyback Galeri24, jadi kami tidak mengisinya dengan perkiraan.',
  },
  {
    q: 'Apakah situs ini menjual emas?',
    a: 'Tidak. Ini proyek non-komersial tanpa sponsor; datanya bisa diunduh bebas di halaman Data.',
  },
] as const;

/** Edukasi singkat + FAQ di bawah tabel beranda (teks dari mockup Main-v2). */
export function HomeEducation() {
  return (
    <section className="wrap flex flex-wrap gap-6 pt-6 pb-16">
      <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-3.5">
        <h2 className="serif m-0 text-[32px] max-sm:text-[26px]">Cara membaca angka ini</h2>
        <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          {TERMS.map((t) => (
            <div key={t.title} className="rounded-[14px] border border-line bg-surface p-4">
              <h3 className="m-0 text-sm font-semibold">{t.title}</h3>
              <p className="m-0 mt-1.5 text-sm leading-[1.55] text-muted">{t.body}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5">
        <h2 className="serif m-0 text-[32px] max-sm:text-[26px]">Pertanyaan umum</h2>
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
          {FAQ.map((f) => (
            <details key={f.q} className="group border-b border-line px-4 last:border-b-0">
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden="true"
                  className="text-lg text-faint transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="m-0 mb-3.5 text-sm leading-[1.6] text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
