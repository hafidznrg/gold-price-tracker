# Fixture harga-emas.org

Riset P1-06 (26 Okt 2026 ±10.20 WIB): harga-emas.org dinilai sebagai sumber sekunder harga Antam setelah logammulia.com memblokir akses otomatis. Diambil dengan `curl` + User-Agent proyek (`robots.txt`: `Disallow:` kosong). Kesimpulan di [DECISIONS D-24](../../../../../plan/DECISIONS.md); tes kontrak `test/fixtures-hargaemas.test.ts`.

| File | Isi | Asli? |
| --- | --- | --- |
| `home-table-2026-10-26.html` | Semua `<table>` beranda (Next.js, ±440 KB asli). Tabel `Gram \| Antam \| Pegadaian`; catatan "Update harga LM Antam: 23 Oktober 2026 pukul 10.46", "Harga pembelian kembali: Rp2.421.000 /grm" | Asli (dipotong) |
| `history-2026-10-09-table.html` | `GET /history-harga/2026/Oktober/09`: tabel Antam \| Pegadaian \| Pluang, tanpa buyback | Asli (dipotong) |
| `history-2026-08-31-table.html` | `GET /history-harga/2026/Agustus/31`: hanya kolom Pluang | Asli (dipotong) |

Temuan:

- Kolom Antam beranda cocok dengan Harga Dasar resmi untuk 2, 5, 25, 50, 100, 250, 500, 1.000 g, tetapi **0,5 g dan 1 g = Gift Series** dan **10 g = Batik Seri III** (bukan emas batangan biasa); 3 g tidak ada. Label tanggal update (23 Okt) tidak cocok dengan angkanya (harga 26 Okt).
- Kolom "Pegadaian" 1 g Rp2.467.000 = harga **Galeri 24** di Pegadaian, bukan Antam.
- Histori: `sitemap-history.xml` memuat 1.328 halaman harian `history-harga/{yyyy}/{NamaBulan}/{dd}` (ejaan `Febuari`), 22 Feb 2023 → 11 Okt 2026; tanpa buyback; sebagian hari tanpa kolom Antam.
