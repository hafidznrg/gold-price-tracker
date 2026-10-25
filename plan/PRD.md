# PRD — Platform Harga Emas Historis

| | |
| --- | --- |
| **Status** | Disetujui untuk implementasi |
| **Pemilik** | Hafidz |
| **Versi** | 1.1 — 25 Okt 2026 (lihat §16) |
| **Dokumen sumber** | Artifact "Fondasi Platform Harga Emas Historis" |
| **Dokumen terkait** | [TECH-SPEC.md](./TECH-SPEC.md) · [DATA-MODEL.md](./DATA-MODEL.md) · [WORKFLOWS.md](./WORKFLOWS.md) · [DECISIONS.md](./DECISIONS.md) · [phases/](./phases/) |

---

## 1. Ringkasan

Platform web untuk melihat pergerakan historis harga emas batangan di Indonesia: **harga jual toko** dan **harga buyback**, untuk Antam, UBS, dan Galeri24, beserta **spread** di antara keduanya. Data dikumpulkan otomatis setiap hari oleh GitHub Actions, disimpan sebagai CSV di repository GitHub (pola *git-as-database*), lalu disajikan sebagai situs statis di Vercel.

Platform juga membandingkan harga lokal dengan **harga emas dunia (XAU/USD) dan kurs USD/IDR**. Tujuannya menjawab dua pertanyaan: seberapa cepat emas tumbuh dalam rupiah dibanding dalam dolar, dan berapa premi harga ritel di atas harga spot.

Proyek ini **non-komersial**, untuk kepentingan pribadi sekaligus **portofolio data engineering**. Karena itu kualitas pipeline (pengujian, validasi, dokumentasi, keterlacakan data) sama pentingnya dengan tampilan.

## 2. Latar belakang dan masalah

- Situs penerbit hanya menampilkan **harga hari ini**. Histori tidak tersedia, atau hanya tampil sebagai grafik tanpa data yang bisa diunduh.
- Istilah tidak seragam antar situs. Di UBS Lifestyle, "Harga Beli" adalah harga yang dibayar konsumen dan "Harga Jual" adalah buyback, terbalik dari istilah sehari-hari.
- Membandingkan brand, gramasi, dan tempat beli versus tempat jual kembali (mis. beli UBS di Pegadaian, jual kembali ke UBS Lifestyle) harus dilakukan manual.
- Belum ada sumber terbuka yang menggabungkan harga ritel dengan harga spot dunia untuk melihat premi lokal.

## 3. Tujuan

| ID | Tujuan | Ukuran keberhasilan |
| --- | --- | --- |
| G-1 | Mengumpulkan riwayat harian harga jual dan buyback per brand, per gramasi, per sumber | ≥ 95% hari kerja memiliki data UBS Lifestyle dan Pegadaian dalam 90 hari pertama |
| G-2 | Visualisasi harga, spread, dan perbandingan dengan filter fleksibel | Semua halaman P0 tersedia; setiap konfigurasi grafik bisa dibagikan lewat URL |
| G-3 | Pembanding harga spot dunia dan premi lokal | Seri XAU/USD dan USD/IDR tersedia sejak 1996; grafik kelipatan dan premi Antam berjalan |
| G-4 | Data terbuka dan dapat diunduh | CSV dan JSON dapat diunduh dari halaman Data dan endpoint statis |
| G-5 | Kualitas pipeline setara produksi (portofolio) | Tidak ada data invalid ter-commit; setiap kegagalan memicu notifikasi dalam satu run |

## 4. Di luar ruang lingkup (v1)

- Harga intraday (lebih dari satu nilai per hari per seri).
- Notifikasi atau alert harga untuk pengguna.
- Akun pengguna, login, portofolio pribadi tersimpan di server.
- Prediksi harga.
- Monetisasi.
- Brand lain di luar Antam, UBS, Galeri24 (arsitektur disiapkan agar mudah ditambah).

## 5. Pengguna

| Persona | Kebutuhan utama |
| --- | --- |
| **Pemilik proyek** (pengguna utama) | Memantau harga dan spread harian, mengecek untung/rugi emas yang dimiliki, memamerkan kualitas pipeline sebagai portofolio |
| **Investor emas ritel** | Membandingkan harga antar brand dan tempat beli, mengetahui kapan spread menyempit, menghitung titik impas |
| **Rekruter / reviewer teknis** | Melihat arsitektur, kualitas data, pengujian, dan dokumentasi yang rapi |
| **Analis / pengembang** | Mengunduh data mentah (CSV/JSON) untuk dipakai di alat lain |

## 6. Sumber data

| Sumber | Brand / seri | Cara akses | Waktu update | Kesulitan |
| --- | --- | --- | --- | --- |
| ubslifestyle.com/harga-buyback-hari-ini | UBS Gold Bar 0,05–100 g: harga beli konsumen + buyback, per tahun produksi | Tabel HTML server-rendered | ±10.00 WIB | Rendah |
| pegadaian.co.id/harga-emas | Galeri24 (0,5–1.000 g), UBS (0,5–500 g), Antam (0,5–100 g): harga jual; buyback bila ditampilkan | Endpoint JSON yang dipanggil halaman (Nuxt) | ±07.30 WIB | Sedang |
| logammulia.com | Antam 1 g: histori jual (sejak 2010) dan buyback (sejak 2015); opsional tabel gramasi | Sesi browser + token CSRF → endpoint JSON grafik | Setelah 08.30 WIB | Tinggi |
| xaus.com API | XAU/USD harian (≤ 5 tahun) + spot | REST JSON tanpa key | Harian | Rendah |
| World Bank Pink Sheet | XAU/USD rata-rata bulanan, histori panjang | XLS bulanan | Bulanan | Rendah |
| Bank Indonesia JISDOR | USD/IDR harian sejak 20 Mei 2013 | Halaman histori BI | Hari kerja 15.15 WIB | Sedang |
| Frankfurter (kurs acuan ECB) | EUR/IDR & EUR/USD sejak 1999 → USD/IDR | REST/CSV tanpa key | Hari kerja | Rendah |
| Kurs tahunan resmi (mis. World Bank WDI) | USD/IDR 1996–1998 | File statis | Statis | Rendah (perlu verifikasi) |

Detail teknis cara akses tiap sumber ada di [TECH-SPEC.md §5](./TECH-SPEC.md#5-spesifikasi-scraper-per-sumber).

## 7. Kebutuhan fungsional

Prioritas: **P0** = wajib untuk rilis publik (MVP) · **P1** = wajib untuk v1 lengkap · **P2** = bila waktu memungkinkan.

### 7.1 Pengumpulan data

| ID | Kebutuhan | Prioritas | Fase |
| --- | --- | --- | --- |
| FR-01 | Scrape UBS Lifestyle: harga beli konsumen dan buyback per pecahan, **semua tahun produksi** yang ditampilkan, beserta tanggal/jam update di situs | P0 | 1 |
| FR-02 | Scrape Pegadaian: harga jual per brand (Antam, UBS, Galeri24) per gramasi; buyback **apa adanya** bila tersedia | P0 | 1 |
| FR-03 | Scrape Antam LM lewat endpoint JSON: histori jual dan buyback 1 g; run pertama sekaligus backfill sejak 2010. Bila gagal, hari itu dibiarkan kosong (tanpa sumber pengganti) | P0 | 1 |
| FR-04 | Scrape tabel harga Antam LM per gramasi dengan sesi browser yang sama | P2 | 4 |
| FR-05 | Ambil XAU/USD harian (penutupan hari sebelumnya) dan titik spot terakhir | P0 | 2 |
| FR-06 | Ambil USD/IDR JISDOR harian | P0 | 2 |
| FR-07 | Backfill seri makro: World Bank bulanan (1996+), ECB bulanan/harian (1999+), JISDOR (2013+), xaus harian (5 tahun), kurs tahunan 1996–1998 | P0 | 2 |
| FR-08 | Backfill histori UBS dari endpoint grafik bila tersedia | P2 | 1 |
| FR-09 | Penjadwalan otomatis via GitHub Actions: harga ritel 10.25 WIB (primary) dan 13.25 WIB (retry, hanya sumber yang belum sukses); makro 16.40 WIB hari kerja; jalan manual (`workflow_dispatch`) | P0 | 1, 2 |
| FR-10 | Gerbang validasi: pelanggaran tingkat run menggagalkan sumber; pelanggaran tingkat baris menahan baris ke karantina (TECH-SPEC §7) | P0 | 1 |
| FR-11 | Simpan fragmen mentah (HTML/JSON) terkompresi, dilewati bila isinya identik dengan snapshot terakhir (sha256), untuk parse ulang | P0 | 1 |
| FR-12 | Log setiap run (`data/meta/runs/{yyyy}.jsonl`) dan status terakhir per sumber (`data/meta/status.json`); konfigurasi sumber terpisah di `config/sources.yml` | P0 | 1 |
| FR-13 | Notifikasi kegagalan ke Telegram + GitHub Issue otomatis berisi log dan cuplikan snapshot | P0 | 1 |
| FR-14 | Perintah parse ulang (`reparse`) dari arsip mentah untuk memperbaiki data historis | P1 | 5 |
| FR-15 | **Karantina**: baris yang ditahan disimpan di `data/quarantine/` dan diputuskan (setujui/tolak) lewat workflow manual `quarantine.yml`; setiap batch membuka Issue | P0 | 1 |
| FR-16 | **Log revisi**: setiap perubahan nilai pada baris yang sudah ada dicatat (nilai lama, nilai baru, run, alasan) | P0 | 1 |
| FR-17 | **Monitor kesegaran**: Issue otomatis bila sumber tidak punya data ≥ 2 hari yang diharapkan atau workflow terjadwal berhenti | P1 | 5 |

### 7.2 Web dan visualisasi

| ID | Kebutuhan | Prioritas | Fase |
| --- | --- | --- | --- |
| FR-20 | Halaman **Hari ini**: kartu per brand (jual, buyback, spread, perubahan vs kemarin, 1 g) + tabel semua gramasi dengan sparkline 30 hari | P0 | 3 |
| FR-21 | Halaman **Explorer**: pilih ≥ 1 series (brand × sumber × gramasi × jenis harga) dan rentang waktu bebas; line chart dengan zoom | P0 | 3 |
| FR-22 | Halaman **Spread**: area band jual–buyback, line spread %, bar spread % per gramasi hari ini | P0 | 3 |
| FR-23 | Halaman **Data**: unduh CSV/JSON, kamus kolom, status tiap sumber, umur data terakhir | P0 | 3 |
| FR-24 | Kontrol rentang: 7H, 1B, 3B, 6B, YTD, 1T, Semua, kustom | P0 | 3 |
| FR-25 | Semua state filter tersimpan di query URL (bisa dibagikan) | P0 | 3 |
| FR-26 | Atribusi sumber + waktu update di setiap tampilan harga; disclaimer "bukan rekomendasi investasi"; penjelasan PPh 22 buyback | P0 | 3 |
| FR-27 | Mode nilai: nominal Rp, per gram, indeks (=100 di awal periode), % perubahan | P1 | 4 |
| FR-28 | Agregasi: harian, mingguan, bulanan (penutupan periode, opsional min–maks) | P1 | 4 |
| FR-29 | Pasangan spread bebas: harga jual sumber A vs buyback sumber B | P1 | 4 |
| FR-30 | Halaman **Bandingkan**: Antam vs UBS vs Galeri24 pada gramasi sama, termasuk Antam LM vs Antam Pegadaian | P1 | 4 |
| FR-31 | Halaman **Kalkulator**: beli tanggal X di sumber A, jual hari ini ke sumber B → untung/rugi dan titik impas | P1 | 4 |
| FR-32 | **Grafik kelipatan** (skala log): emas Rp/gram vs emas US$/oz vs kurs, pilihan tahun dasar dan agregasi, titik spot hari ini bergaris putus, anotasi peristiwa dari `config/events.yml`, subjudul kelipatan + CAGR otomatis | P1 | 4 |
| FR-33 | **Premi Antam vs spot**: harga Antam 1 g ÷ Rp/gram spot − 1, dari waktu ke waktu | P1 | 4 |
| FR-34 | API statis: `/data/latest.json`, `/data/series/{source}-{brand}.json`, `/data/macro/*.json` | P1 | 4 |
| FR-35 | Hari tanpa data tampil sebagai celah; opsi *forward-fill* berlabel | P1 | 4 |
| FR-36 | Halaman **Kualitas data**: kelengkapan per sumber per bulan, riwayat run, insiden | P2 | 5 |

## 8. Kebutuhan non-fungsional

| ID | Kebutuhan | Target |
| --- | --- | --- |
| NFR-01 | Biaya operasional | Rp0: GitHub publik + Vercel Hobby |
| NFR-02 | Kesegaran data | Data UBS & Pegadaian hari ini tayang ≤ 14.00 WIB; makro ≤ 17.30 WIB hari kerja |
| NFR-03 | Idempoten | Menjalankan pipeline 2× dengan data sumber yang sama tidak menghasilkan diff Git (baris yang tidak berubah tidak disentuh, termasuk `scraped_at`) |
| NFR-04 | Ketahanan | Kegagalan satu sumber tidak menggagalkan sumber lain |
| NFR-05 | Keterlacakan | Setiap baris punya `source`, `scraped_at`, `origin`; setiap perubahan data = commit |
| NFR-06 | Reproducibility | Data bisa dibangun ulang dari arsip mentah dengan perintah `reparse` |
| NFR-07 | Pertumbuhan repo | Data + arsip mentah < 10 MB per tahun |
| NFR-08 | Performa web | LCP < 2,5 dtk di mobile 4G; JSON awal halaman < 300 KB (gzip) |
| NFR-09 | Responsif dan aksesibel | Layout jalan di lebar 360 px; kontras WCAG AA; tema terang/gelap |
| NFR-10 | Kualitas kode | Parser 100% tercakup uji fixture; CI hijau sebelum merge; TypeScript strict |
| NFR-11 | Zona waktu | Semua tanggal harga dalam `Asia/Jakarta`; timestamp teknis dalam UTC |
| NFR-12 | Etika scraping | ≤ 1 sesi per sumber per jadwal, jeda antar request, timeout di semua request |

## 9. Model data (ringkas)

Dua tabel observasi (CSV *long format*) ditambah tabel operasional untuk keterlacakan. ERD, kamus data, dan aturan tulis lengkap ada di [DATA-MODEL.md](./DATA-MODEL.md).

- **`PRICE_OBSERVATION`**: `date, source, brand, product, variant, weight_g, location, sell_price, buyback_price, source_updated_at, scraped_at, run_id, origin`. Kunci: `date + source + brand + product + variant + weight_g + location`.
- **`MACRO_OBSERVATION`**: `date, series, frequency, value, unit, source, scraped_at, run_id, origin`. Kunci: `date + series + frequency`.
- **Operasional**: `RUN`, `SOURCE_STATUS`, `REVISION`, `QUARANTINE_BATCH`, `RAW_SNAPSHOT`, `SPOT_SNAPSHOT`.
- **Konfigurasi** (ditulis manusia): `SOURCE`, `MACRO_SERIES`, `CATALOG_ITEM`, `HOLIDAY`, `EVENT` di `config/`.

Metrik turunan (spread, spread %, Rp/gram spot, indeks, CAGR, premi) **dihitung saat build** dengan aturan *as-of join* yang eksplisit, tidak disimpan.

## 10. Asumsi dan batasan

- Situs sumber dapat berubah struktur kapan saja; parser harus gagal keras, bukan salah baca diam-diam.
- logammulia.com memakai proteksi bot dan robots.txt-nya menolak akses otomatis. Scraping tetap dijalankan atas keputusan pemilik proyek; konsekuensinya seri Antam LM bisa berlubang atau berhenti.
- Harga Antam LM diperlakukan sebagai acuan **Jakarta**, mewakili harga nasional.
- Cron GitHub Actions bisa tertunda; jadwal memakai menit ganjil dan ada slot ulang.
- Workflow terjadwal di repo publik dinonaktifkan GitHub setelah 60 hari tanpa aktivitas; commit data harian mencegahnya.
- Harga xaus.com bersifat indikatif (histori dari Yahoo Finance) — cukup untuk visualisasi, bukan valuasi.

## 11. Risiko utama

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| logammulia.com memblokir | Seri Antam LM berlubang | Playwright + stealth, 1 sesi/hari, gagal keras + notifikasi; celah dibiarkan kosong |
| IP runner GitHub (luar negeri) diblokir | Job gagal walau kode benar | *Self-hosted runner* di jaringan Indonesia khusus sumber bermasalah |
| Struktur situs berubah | Parser gagal / salah baca | Validasi ketat, uji fixture, Issue otomatis berisi snapshot |
| Data salah ter-commit | Lonjakan palsu di grafik | Batas perubahan harian; koreksi via `reparse` dari arsip mentah |
| Endpoint Pegadaian tidak stabil | Seri Pegadaian berlubang | Fallback Playwright membaca DOM |

## 12. Keputusan yang sudah diambil

Ringkasan; rincian dan alasannya di [DECISIONS.md](./DECISIONS.md).

1. Antam LM memakai scraping endpoint; bila gagal dibiarkan kosong.
2. Buyback Pegadaian memakai data apa adanya; sumber buyback Antam/Galeri24 dipelajari belakangan.
3. Buyback UBS menyimpan semua tahun produksi yang ditampilkan.
4. Repository publik.
5. Lokasi acuan Antam LM: Jakarta.
6. Pembanding spot dunia (XAU/USD × kurs) termasuk v1.
7. Non-komersial: pribadi dan portofolio.

## 13. Pertanyaan terbuka

| ID | Pertanyaan | Kapan diputuskan |
| --- | --- | --- |
| Q-1 | Apakah Pegadaian menampilkan buyback per brand? Jika tidak, dari mana buyback Antam/Galeri24? | Setelah Fase 1 berjalan. **Temuan P0-08:** tidak — endpoint dan halaman hanya memuat harga jual emas batangan (`hargaBeli: null`); buyback hanya untuk Tabungan Emas. Sumber buyback Antam/Galeri24 masih terbuka (P5-06) |
| Q-2 | Apakah grafik histori UBS Lifestyle memuat endpoint JSON yang bisa dipakai untuk backfill? | **Terjawab (P0-07):** ya, tetapi hanya buyback 1 g sejak Nov 2023, bercelah, tahun produksi tidak diketahui — TECH-SPEC §5.1 |
| Q-3 | Sumber kurs USD/IDR tahunan 1996–1998 yang terverifikasi | Fase 2 |
| Q-4 | Perlukah *self-hosted runner* Indonesia? | **Terjawab (P0-11, 25 Okt 2026):** tidak untuk UBS Lifestyle, Pegadaian, xaus, JISDOR, World Bank, Frankfurter — semua lolos dari runner GitHub di AS. Logam Mulia belum dapat dinilai (situs maintenance untuk semua pengunjung) |
| Q-5 | Nama domain dan nama produk | Sebelum rilis publik (Fase 3) |
| Q-6 | `update_calendar` tiap sumber (apakah UBS/Pegadaian/Logam Mulia update di akhir pekan dan hari libur) | Observasi 2 minggu di Fase 1. Temuan awal UBS: Senin–Sabtu, sebagian libur tetap update (TECH-SPEC §5.1) |

## 14. Rencana rilis

| Fase | Isi | Gerbang keluar |
| --- | --- | --- |
| [0 — Fondasi & validasi sumber](./phases/fase-0-fondasi.md) | Monorepo, skema, CI, fixture, uji akses semua sumber | Semua sumber terbukti bisa diambil dari runner GitHub (atau status LM diketahui) |
| [1 — Pipeline harga ritel](./phases/fase-1-pipeline-ritel.md) | Scraper UBS, LM, Pegadaian; validasi; merge; workflow; notifikasi | 7 hari berturut-turut run hijau |
| [2 — Data makro](./phases/fase-2-data-makro.md) | XAU/USD, USD/IDR, backfill 1996+ | Seri makro lengkap dan lolos cek silang |
| [3 — Web MVP](./phases/fase-3-web-mvp.md) | Hari ini, Explorer, Spread, Data; deploy Vercel | **Rilis publik** (data ≥ 14 hari) |
| [4 — Analitik & fleksibilitas](./phases/fase-4-analitik.md) | Bandingkan, Kalkulator, grafik kelipatan, premi, mode & agregasi, API | Semua FR P1 selesai |
| [5 — Hardening & portofolio](./phases/fase-5-hardening.md) | Reparse, halaman kualitas data, dokumentasi, studi kasus | Siap dipresentasikan sebagai portofolio |

## 15. Glosarium

| Istilah | Arti |
| --- | --- |
| Harga jual (`sell_price`) | Harga yang dibayar konsumen saat membeli dari toko |
| Buyback (`buyback_price`) | Harga yang dibayar toko saat membeli kembali dari konsumen |
| Spread | Harga jual − buyback; spread % = spread ÷ harga jual × 100 |
| Premi | Harga ritel ÷ harga spot dalam Rp/gram − 1 |
| Series | Kombinasi brand × sumber × gramasi × jenis harga |
| Variant | Pembeda tambahan dalam satu produk, mis. tahun produksi UBS |
| Backfill | Pengisian histori sekali jalan, ditandai `origin = backfill` |
| Gerbang validasi | Aturan yang harus lolos sebelum data ditulis |
| JISDOR | Jakarta Interbank Spot Dollar Rate, kurs acuan USD/IDR Bank Indonesia |

## 16. Riwayat revisi

| Versi | Tanggal | Perubahan |
| --- | --- | --- |
| 1.0 | 25 Okt 2026 | Versi awal dari artifact fondasi |
| 1.1 | 25 Okt 2026 | Tinjauan skema & workflow: tambah DATA-MODEL.md (ERD, kamus data, aturan merge, *as-of join*) dan WORKFLOWS.md; FR-15 karantina, FR-16 log revisi, FR-17 monitor kesegaran; pemisahan `config/` vs `data/`; kolom `run_id`; NFR-03 diperjelas; Q-6 |
