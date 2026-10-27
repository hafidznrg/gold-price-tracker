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
| D-19 | 25 Okt 2026 | UBS Lifestyle: tanggal data dari endpoint grafik, bukan blok "Updated"; `source_updated_at` kosong | Diterima |
| D-20 | 25 Okt 2026 | Pegadaian: endpoint `/gold/prices/table`, vendor dipetakan lewat `idVendor`, vendor lain diabaikan | Diterima |
| D-21 | 25 Okt 2026 | Cara ambil sumber makro: JISDOR GET + ekspor postback, Frankfurter v2 CSV, Pink Sheet via tautan halaman, SheetJS dari CDN | Diterima |

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

### D-19 — Tanggal data UBS Lifestyle dari endpoint grafik

**Konteks:** riset P0-07 menemukan bahwa blok "Updated" di halaman UBS Lifestyle tidak mencerminkan waktu update harga: tanggalnya dicetak server saat halaman di-cache (selalu "hari ini", juga di hari Minggu ketika harga masih data Sabtu), dan jamnya diisi JavaScript dengan jam peramban. Aturan V-06 ("tanggal di halaman = hari ini") karenanya selalu lolos dan tidak pernah mendeteksi `stale`.
**Keputusan:** scraper UBS mengambil halaman lalu `chart_interval/GOLD/7` (satu request tambahan, jeda 5 detik). `data_date` = tanggal titik terakhir grafik bila nilainya sama dengan buyback 1 g tabel tahun berjalan; selain itu `stale`. `source_updated_at` dibiarkan `null` karena sumber tidak menyediakan waktu update yang dapat dipercaya. Raw snapshot menyimpan kedua respons.
**Konsekuensi:** dua request per run (masih sesuai NFR-12). Bila endpoint grafik hilang, scraper gagal dengan `PARSE_ERROR` alih-alih diam-diam menulis data berlabel tanggal salah.

### D-20 — Pegadaian lewat `/gold/prices/table`, vendor lewat `idVendor`

**Konteks:** riset P0-08. Halaman Pegadaian (Nuxt) memuat harga dari endpoint JSON same-origin yang dapat dipanggil tanpa token. Respons memuat 10 vendor, termasuk varian (Antam Retro, UBS Disney, Batik Series, Lotus Archi) yang tidak ditampilkan di tabel halaman, dan nama vendor tidak konsisten (`"GALERI 24"` di tabel harga, `"Galeri 24"` di daftar vendor).
**Keputusan:** jalur utama `GET /gold/prices/table`; Playwright membaca DOM hanya sebagai fallback. Brand ditentukan dari `idVendor` (`00005201808001` antam, `00005201808002` ubs, `00005202003010` galeri24), bukan nama. Vendor lain diabaikan tanpa karantina — menambahkannya (mis. `antam` + `gold_bar_retro`) adalah perubahan katalog lewat PR. Gramasi dengan `hargaJual = 0` dibuang. `source_updated_at` = `idHarga` (epoch ms) dalam zona Jakarta; `date` = `tglBerlaku`.
**Konsekuensi:** satu request per run. Bila Pegadaian menambah vendor baru, pipeline tidak gagal; bila kode vendor target berubah, V-04 (≥ 5 gramasi per brand) menggagalkan run sehingga perubahan terdeteksi.

### D-21 — Cara ambil sumber makro

**Konteks:** riset P0-10 memverifikasi keempat sumber makro dari jaringan lokal; semuanya dapat diakses tanpa API key atau browser.
**Keputusan:**
- **JISDOR harian:** satu `GET` halaman BI — tabelnya sudah memuat 10 hari kerja terakhir. **Backfill:** postback ASP.NET `ButtonExport` dengan rentang tanggal → satu XLSX berisi seluruh histori sejak 20 Mei 2013. Nama field dicari berdasarkan akhiran, bukan ID web part SharePoint.
- **Frankfurter:** `v2/rates.csv` (long format) untuk backfill dan fallback harian; v1 JSON sebagai cadangan. Histori ECB untuk IDR dimulai 4 Jan 1999 (bukan Feb 1999).
- **World Bank:** URL XLSX ber-hash yang berubah tiap rilis ditemukan dari tautan di halaman Commodity Markets; kolom emas dicari lewat nama `Gold`.
- **xaus:** histori = futures GC=F (Yahoo), spot = gold-api.com; keduanya indikatif dan diberi label di UI. V-10 memakai `data_state.status` untuk histori dan `stale` untuk spot.
- **SheetJS** dipasang dari tarball CDN resmi 0.20.3, bukan registri npm (0.18.5 berkerentanan). Dependabot tidak memantau dependensi URL, jadi versinya diperiksa manual di P5-04.
**Konsekuensi:** tidak ada sumber makro yang memerlukan Playwright; workflow makro tetap ringan. Struktur HTML/XLSX BI dan World Bank bisa berubah — dilindungi tes kontrak fixture dan aturan gagal keras.

### D-22 — Detail implementasi inti pipeline (P1-01–P1-04)

**Konteks:** implementasi `validate`, `merge`, scraper UBS, dan `scrape-retail.yml` memunculkan beberapa hal yang belum dirinci DATA-MODEL/WORKFLOWS.
**Keputusan:**
- **Artifact scrape:** `run.json` berisi baris RUN tanpa hitungan insert/update/unchanged, ditambah `expected_day`, `exit_code`, `history_points`, dan metadata raw (`file`, `ext`, `fetched_at`, `sha256` isi sebelum gzip). Merge memverifikasi sha256 dan gagal keras bila tidak cocok.
- **Raw UBS:** satu file JSON `{ tables, chart }` — semua blok `<table>` halaman + respons grafik apa adanya (±1 KB gzip, bukan halaman 188 KB). Bila halaman tidak memuat tabel, seluruh halaman ikut disimpan (`page`) untuk diagnosis.
- **"Tahun berjalan" UBS** (V-04, D-19) = tahun produksi **terbaru** di tabel, bukan tahun kalender, agar awal Januari (tabel masih "Tahun 2026") tidak gagal.
- **`stale` tidak menulis baris** (WORKFLOWS §5) dan tidak menambah `consecutive_failures`; hanya `failed` yang menambah. `stale` di hari yang diharapkan tetap merah (kode 3) dan dicoba lagi di slot retry.
- **V-01** juga menolak kunci utama ganda dalam satu hasil parse.
- **RUN idempoten:** merge ulang artifact dengan `run_id` + `source` yang sama tidak menambah atau menimpa baris RUN; bersama aturan nilai (D-14), merge 2× = tanpa diff Git.
- **File karantina:** `{date}-{run_id}.json`; bila satu run menahan baris karena lebih dari satu alasan, satu file per alasan dengan akhiran `-{reason_code}`.
- **`plan` manual** boleh menjalankan sumber nonaktif bila disebut eksplisit di input `sources` (untuk uji); daftar kosong = hanya sumber aktif.
- **Notifikasi bertahap:** `notify` sementara hanya menulis step summary; Telegram dan Issue menyusul di P1-05.
**Konsekuensi:** `ubslifestyle` diaktifkan (`parser_version 1.0.0`) sehingga pengumpulan data mulai sebelum Pegadaian dan Logam Mulia selesai.

### D-23 — Scraper Pegadaian (P1-07)

**Konteks:** implementasi P1-07 dan uji nyata Senin 26 Okt 09.43 WIB, yang menunjukkan harga bertanggal Minggu sudah terbit sejak Sabtu malam (TECH-SPEC §5.2).
**Keputusan:**
- `update_calendar` Pegadaian tetap **`daily`**: data Sabtu yang masih tampil di hari Minggu dianggap basi.
- `tglBerlaku` berbeda antar tiga brand target → parser melempar `VALIDATION_FAILED` (run `failed`, dicoba lagi di slot retry), bukan `stale`.
- `hargaBeli` disimpan sebagai `buyback_price` hanya bila berisi angka > 0. Saat ini selalu `null` (Q-1, D-07).
- Raw = respons JSON utuh (±1,5 KB gzip).
- **Fallback Playwright (DOM) ditunda:** belum ada fixture DOM untuk diuji, dan endpoint JSON stabil dari runner AS (P0-11). Dibuat bila endpoint berubah atau diblokir; sampai saat itu kegagalan endpoint = `failed`.
- Jumlah vendor yang diabaikan tidak dicatat di RUN karena skema RUN tidak punya kolomnya; vendor baru tetap bisa dilihat di raw snapshot.
**Konsekuensi:** `pegadaian` diaktifkan (`parser_version 1.0.0`). Slot primary 10.25 WIB bisa jatuh tepat saat periode II diterbitkan (±10.18–10.35 WIB); bila sering `failed` karena tanggal campur, geser jadwal di P1-11. *Jadwal diganti oleh D-25: Pegadaian dijalankan di jendela malam.*

### D-24 — Logam Mulia versi baru: tidak di-scrape, harga-emas.org belum dipakai

**Konteks:** 26 Okt 2026 logammulia.com kembali sebagai aplikasi baru (TECH-SPEC §5.3): API terenkripsi, dan Akamai menolak browser otomatis tanpa penyamaran ("Access Denied" untuk Playwright biasa dan `curl` dengan User-Agent proyek). Satu-satunya cara masuk adalah plugin stealth, yang tujuannya menyamarkan otomasi.
**Keputusan:**
- Proyek **tidak** menembus proteksi bot (stealth, User-Agent palsu, rotasi IP, penyelesai tantangan) dan **tidak** membongkar enkripsi API. Ini menggantikan bagian "Playwright + stealth" di D-06. `logammulia` tetap nonaktif; P1-06 tertahan sampai ada akses resmi (mis. izin atau feed dari Antam).
- Bila akses resmi tersedia: `sell_price` = **Harga Dasar** (tanpa PPh 0,25%, yang bergantung status NPWP pembeli); histori sejak 2010/2015 **tidak** diambil lagi (situs baru maks. 6 bulan) — kriteria Fase 1 "histori sejak 2010" dicabut.
- **harga-emas.org dievaluasi dan belum dipakai** sebagai sumber sekunder: kolom Antam mencampur produk (0,5 g & 1 g = Gift Series, 10 g = Batik Seri III), label tanggal tidak sesuai angka, tidak ada buyback per hari di histori, dan histori berhenti 11 Okt 2026 dengan hari tanpa kolom Antam (fixture `apps/scraper/test/fixtures/hargaemas/`). D-06 tetap: tidak ada sumber pengganti.
**Konsekuensi:** seri Antam LM kosong sejak awal; G1 memakai jalur "celah tercatat" untuk Logam Mulia. Harga Antam dari Pegadaian tetap terkumpul sebagai seri tersendiri (bukan pengganti). Nilai ulang harga-emas.org bila pemetaan produknya diperbaiki.

### D-25 — Pegadaian di jendela malam `scrape-retail`

**Konteks:** run terjadwal Senin 26 Okt 16.08 WIB gagal `stale` (`tglBerlaku` 25 Okt). Field `timestamp` per vendor di `/gold/prices/table` ternyata waktu **snapshot harian**: tiga pengamatan (24, 25, 26 Okt) semuanya 18.32.05 WIB. Snapshot hari D hanya memuat harga ber-`tglBerlaku` D, walau harga itu sudah dibuat sebelumnya (harga Senin dibuat Minggu 18.19 WIB; periode II 24 Okt dibuat 10.18–10.35 WIB). Akibatnya slot 10.25 dan 13.25 WIB selalu membaca harga kemarin, dan Pegadaian `stale` setiap hari (TECH-SPEC §5.2).
**Keputusan:**
- Field baru `schedule_window` di `config/sources.yml` (`day` default, `evening`). Pegadaian = `evening`.
- `scrape-retail.yml` menambah cron `5 12 * * *` (19.05 WIB, slot `primary`) dan `5 14 * * *` (21.05 WIB, slot `retry`) untuk jendela `evening`; cron siang hanya menjalankan sumber `day`. Pemetaan cron → slot + jendela ada di `SCHEDULES` (`pipeline/plan.ts`), dan tes memastikan isinya sama dengan YAML.
- Run manual tanpa daftar sumber melewati sumber `evening` sebelum 18.45 WIB; sumber yang disebut eksplisit tetap dijalankan.
- Alternatif ditolak: tetap di slot siang dan menerima `tglBerlaku` = kemarin. Datanya tetap benar per tanggal, tetapi harga hari D baru tercatat D+1 dan aturan stale butuh pengecualian lag khusus Pegadaian.
**Konsekuensi:** NFR-02 Pegadaian menjadi ≤ 21.30 WIB. Perubahan harga dalam sehari (periode II) hanya terlihat lewat snapshot malam, jadi slot retry tidak lagi menangkap revisi intraday. Tanggal campur antar brand kecil kemungkinannya (satu snapshot untuk semua vendor), tetapi aturan `VALIDATION_FAILED` dari D-23 tetap berlaku. `freshness.yml` (Fase 5) dijadwalkan setelah slot retry malam. Bila jam snapshot bergeser, ubah cron dan `EVENING_FROM` bersama-sama.

### D-26 — Logam Mulia lewat Playwright + stealth (menggantikan sebagian D-24)

**Konteks:** 26 Okt 2026 pemilik proyek memutuskan seri Antam LM harus terisi otomatis dengan sumber logammulia.com, setelah membandingkan opsi (impor semi-manual dari browser, akses resmi Antam, stealth) beserta risikonya: blokir Akamai, ToS Antam, UU ITE Pasal 30, dan kebijakan GitHub. Prototipe stealth membuka `/harga-emas` dengan HTTP 200 dari IP rumah.
**Keputusan:**
- Bagian D-24 "tidak menembus proteksi bot" **dicabut untuk Logam Mulia saja**: `logammulia.ts` memakai `playwright-extra` + plugin stealth, headless, satu halaman per run (cron `day` 10.25 & 13.25 WIB). Tidak ada rotasi IP, penyelesai CAPTCHA/tantangan, atau retry agresif. Halaman tantangan/"Access Denied" → `BLOCKED` dan run berhenti.
- Enkripsi API `api.logammulia.com` **tetap tidak dibongkar**. Yang dibaca hanya hasil tampilan aplikasi: teks halaman (tabel Emas Batangan) dan seri grafik ApexCharts (`Apex._chartInstances`) setelah tab "Harga Jual" diklik.
- Data: 12 gramasi 0,5–1.000 g, `sell_price` = Harga Dasar (D-24), `buyback_price` hanya 1 g dari grafik "Harga Jual" (titik terakhir hari itu), `location = jakarta` (butik default Jakarta Ekspedisi; butik lain = `PARSE_ERROR`). `data_date` dan `source_updated_at` dari "Terakhir diperbarui". Bila titik grafik 1 g hari itu ≠ tabel → `stale` dan buyback dikosongkan (pola D-19).
- V-07 (histori) dihapus; Logam Mulia memakai V-06 seperti sumber ritel lain. V-04 = 12 gramasi.
**Konsekuensi:** risiko tercatat dan diterima pemilik proyek: stealth bisa berhenti lolos kapan saja (paling mungkin dari IP datacenter GitHub Actions; fallback = self-hosted runner atau opsi impor dari browser), dan akses ini melanggar maksud proteksi situs. Backfill 6 bulan buyback/jual 1 g dari grafik (rentang "6 Bulan") jadi kandidat P1-09. Bila Antam menyediakan akses resmi, ganti `fetchRaw` dan kembali ke D-24.

### D-27 — Tanggal sasaran dari jadwal cron, bukan jam runner

**Konteks:** 26 Okt 2026 semua run terjadwal `scrape-retail` terlambat 5,7–6,9 jam (cron 10.25 → 16.08, 13.25 → 20.17, 19.05 → 01.35, 21.05 → 02.47 WIB). Kedua slot malam berjalan setelah tanggal WIB berganti, sehingga snapshot Pegadaian bertanggal 26 Okt dinilai terhadap "hari ini" 27 Okt: `stale`, 30 baris ditolak, dan harga Pegadaian 26 Okt hilang permanen.
**Keputusan:**
- `plan` menghitung **tanggal sasaran** (`targetDate`): untuk run terjadwal, tanggal Jakarta dari kemunculan cron terakhir ≤ waktu run; untuk run manual, tanggal sekarang. Output `date` diteruskan ke `scrape --date` (V-06, kalender hari diharapkan) dan `merge --date` (pesan commit).
- `doneToday` memakai `last_data_date` = tanggal sasaran, bukan tanggal `last_success_at`, agar retry yang terlambat tidak mengulang sumber yang sudah sukses untuk tanggal slot.
- CLI menolak `--date` selain hari ini atau kemarin (WIB).
- Alternatif ditunda: pemicu eksternal (mis. layanan cron yang memanggil `workflow_dispatch`) untuk ketepatan waktu. Dievaluasi selama observasi P1-11 bila keterlambatan berjam-jam terus terjadi.
**Konsekuensi:** run yang terlambat sampai lewat tengah malam tetap mengambil data tanggal slot selama sumber masih menampilkannya. Bila sumber sudah berganti ke tanggal berikutnya (mis. Pegadaian menerbitkan periode I hari berikutnya), hasilnya `stale` dan tanggal itu tetap hilang; satu-satunya mitigasi adalah run tepat waktu. Run tetap dicatat di `runs/{yyyy}.jsonl` menurut `started_at`.

