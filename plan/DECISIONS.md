# Catatan Keputusan

Log keputusan produk dan teknis (format ringkas ala ADR). Keputusan baru ditambahkan di bawah; keputusan yang diganti ditandai **Diganti oleh D-xx**, bukan dihapus.

| ID | Tanggal | Keputusan | Status |
| --- | --- | --- | --- |
| D-01 | 24 Okt 2026 | Git-as-database: CSV di repo GitHub, tanpa database | Diterima |
| D-02 | 24 Okt 2026 | GitHub Actions sebagai scheduler, Vercel sebagai hosting | Diterima |
| D-03 | 24 Okt 2026 | TypeScript dari ujung ke ujung, monorepo pnpm | Diterima |
| D-04 | 24 Okt 2026 | Skema *long format* dengan istilah netral `sell_price` / `buyback_price` | Diterima |
| D-05 | 24 Okt 2026 | Apache ECharts untuk grafik | Diterima |
| D-06 | 25 Okt 2026 | Antam LM: scraping endpoint JSON; bila gagal dibiarkan kosong | Diterima |
| D-07 | 25 Okt 2026 | Buyback Pegadaian: pakai data apa adanya | Diterima |
| D-08 | 25 Okt 2026 | Buyback UBS: simpan semua tahun produksi | Diterima |
| D-09 | 25 Okt 2026 | Repository publik | Diterima |
| D-10 | 25 Okt 2026 | Lokasi acuan Antam LM: Jakarta | Diterima |
| D-11 | 25 Okt 2026 | Pembanding spot dunia (XAU/USD × kurs) masuk v1 | Diterima |
| D-12 | 25 Okt 2026 | Non-komersial: pribadi dan portofolio data engineering | Diterima |
| D-13 | 25 Okt 2026 | Pisahkan konfigurasi (`config/`, ditulis manusia) dari state bot (`data/`) | Diterima |
| D-14 | 25 Okt 2026 | Merge berbasis nilai: baris tak berubah tidak disentuh, ketiadaan ≠ hapus, revisi dicatat | Diterima |
| D-15 | 25 Okt 2026 | Atomik per sumber untuk pelanggaran run; karantina per baris untuk pelanggaran baris | Diterima |
| D-16 | 25 Okt 2026 | *As-of join* eksplisit untuk metrik lintas seri | Diterima |
| D-17 | 25 Okt 2026 | Ruleset `main` tanpa wajib PR; bot push dengan `GITHUB_TOKEN` | Diterima |
| D-18 | 25 Okt 2026 | Paket `@gold/schema` diekspor sebagai sumber TypeScript (tanpa build); `update_calendar` tambah `monthly` | Diterima |

---

### D-01 — Git-as-database

**Konteks:** volume kecil (±45 ribu baris/tahun), satu penulis (bot), pembaca statis.
**Keputusan:** simpan data sebagai CSV per sumber per tahun di repo. JSON untuk web dibangun saat build dan tidak di-commit.
**Konsekuensi:** biaya nol, setiap perubahan teraudit lewat commit, diff terbaca. Bila nanti butuh query berat atau intraday, CSV dimuat ke DuckDB/SQLite saat build atau dipindah ke Postgres tanpa mengubah skema.

### D-02 — GitHub Actions + Vercel

**Konteks:** keputusan awal pemilik proyek.
**Keputusan:** cron GitHub Actions untuk scraping; push ke `main` memicu deploy Vercel.
**Konsekuensi:** cron bisa tertunda → jadwal di menit ganjil + slot ulang. Workflow terjadwal mati setelah 60 hari tanpa aktivitas → dicegah oleh commit data harian.

### D-03 — TypeScript monorepo

**Keputusan:** paket `schema` (zod) dipakai bersama oleh `scraper` dan `web`.
**Alternatif ditolak:** Python untuk scraper — skema harus ditulis dua kali.

### D-04 — Istilah netral

**Konteks:** UBS Lifestyle memakai "Harga Beli" untuk harga konsumen dan "Harga Jual" untuk buyback.
**Keputusan:** `sell_price` = toko menjual ke konsumen; `buyback_price` = toko membeli dari konsumen. Pemetaan dilakukan di parser.

### D-05 — ECharts

**Keputusan:** ECharts karena kuat untuk time series (`dataZoom`, multi-axis, area band, sumbu log, `markLine`).
**Alternatif:** TradingView Lightweight Charts — ringan, tetapi terbatas untuk grafik non-time-series.

### D-06 — Antam LM lewat endpoint JSON, tanpa cadangan

**Konteks:** logammulia.com memakai proteksi bot dan robots.txt-nya menolak akses otomatis. Grafik harganya memuat endpoint JSON yang mengembalikan seluruh histori 1 g.
**Keputusan:** scraping lewat sesi browser (Playwright + stealth) dan token CSRF. Bila gagal atau diblokir, hari itu dibiarkan kosong; **tidak** memakai harga Antam di Pegadaian sebagai pengganti dan **tidak** ada input manual.
**Konsekuensi:** seri Antam LM bisa berlubang atau berhenti; celah tercatat di `data/meta/runs/` dan ditampilkan apa adanya di grafik.

### D-07 — Buyback Pegadaian apa adanya

**Keputusan:** simpan buyback Pegadaian hanya bila ditampilkan di halaman; kolom dibiarkan kosong bila tidak ada.
**Tindak lanjut:** pertanyaan terbuka Q-1 di PRD.

### D-08 — Semua tahun produksi UBS

**Keputusan:** setiap tabel tahun produksi yang ditampilkan UBS Lifestyle disimpan, dibedakan lewat kolom `variant`.

### D-09 — Repository publik

**Konsekuensi:** menit GitHub Actions tanpa batas, data terbuka untuk portofolio, wajib menjaga agar secrets hanya lewat GitHub Secrets.

### D-10 — Lokasi acuan Jakarta

**Keputusan:** harga Antam LM diperlakukan sebagai harga Jakarta (`location = jakarta`), mewakili harga nasional. Endpoint tidak membedakan butik.

### D-11 — Pembanding spot dunia di v1

**Keputusan:** tambah seri XAU/USD dan USD/IDR; turunkan Rp/gram spot, grafik kelipatan (log), dan premi Antam.
**Sumber:** World Bank (bulanan, backfill), xaus.com (harian), JISDOR (harian, resmi), ECB via Frankfurter (backfill 1999–2013), kurs tahunan 1996–1998.

### D-12 — Non-komersial

**Konsekuensi:** Vercel Hobby cukup. Fokus portofolio → pengujian, validasi, dokumentasi, dan keterlacakan data menjadi kriteria selesai, bukan tambahan.

### D-13 — Konfigurasi terpisah dari state

**Konteks:** versi awal mencampur URL/jadwal sumber (diubah manusia) dan status terakhir (ditulis bot) di satu `sources.json`, sehingga setiap run bot menyentuh file yang juga diedit lewat PR dan rawan konflik.
**Keputusan:** `config/` (sources, catalog, holidays, events) hanya diubah lewat PR; `data/` hanya ditulis bot. `status.json` berisi state, `sources.yml` berisi konfigurasi.

### D-14 — Semantik merge berbasis nilai

**Konteks:** upsert yang selalu memperbarui `scraped_at` membuat setiap run menghasilkan diff, sehingga NFR-03 (idempoten) tidak terpenuhi, dan endpoint Logam Mulia yang mengembalikan seluruh histori akan menulis ulang ribuan baris setiap hari.
**Keputusan:** baris dengan nilai sama tidak disentuh; nilai berbeda di-update dan dicatat di `REVISION`; baris yang hilang dari sumber tidak dihapus. Detail di DATA-MODEL §5.

### D-15 — Atomik per sumber, karantina per baris

**Keputusan:** pelanggaran yang menandakan sumber rusak (skema, buyback ≥ jual, baris terlalu sedikit, histori menyusut) menggagalkan seluruh sumber. Pelanggaran yang menandakan satu nilai mencurigakan (lonjakan, gramasi baru) hanya menahan baris itu ke karantina. Revisi histori massal (> 20 baris) ditahan seluruhnya.

### D-16 — *As-of join*

**Keputusan:** penggabungan seri dengan tanggal berbeda memakai nilai terakhir ≤ tanggal acuan dengan toleransi; premi Antam memakai spot < tanggal acuan karena Antam menetapkan harga pagi berdasarkan penutupan sebelumnya. Detail di DATA-MODEL §6.2.

### D-17 — Proteksi branch

**Konteks:** branch protection "wajib PR" memblokir push data oleh `GITHUB_TOKEN`.
**Keputusan:** ruleset `main` hanya memblokir force-push dan penghapusan. Alternatif ketat (wajib PR + deploy key sebagai bypass) didokumentasikan di WORKFLOWS §6.1.

### D-18 — Schema sebagai sumber TypeScript; kalender `monthly`

**Konteks:** P0-02/P0-03. `packages/schema` dipakai `tsx` (scraper) dan nanti Next.js (web).
**Keputusan:** `@gold/schema` mengekspor `src/index.ts` langsung (`moduleResolution: Bundler`), tanpa langkah build; Next.js memakainya lewat `transpilePackages` di Fase 3. `update_calendar` mendapat nilai `monthly` untuk World Bank Pink Sheet. CLI memakai kode keluar 2 untuk kesalahan pemakaian dan perintah yang belum diimplementasikan, serta perintah tambahan `check` untuk memvalidasi `config/` dan `status.json` di CI.
**Konsekuensi:** tidak ada artefak `dist/` yang perlu disinkronkan; typecheck tiap paket mencakup sumber schema.
