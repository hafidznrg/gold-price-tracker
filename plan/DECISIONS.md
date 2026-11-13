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
**Catatan tampilan (1 Nov 2026):** jam snapshot ±18.32 hanya menentukan jadwal scrape. `source_updated_at` Pegadaian diisi waktu entri harga dibuat (`idHarga` untuk batangan, `id` untuk Tabungan Emas; ±10.06–10.30 WIB pada periode II), jadi web menampilkannya sebagai "harga terbit …", bukan jam snapshot (`lib/source-stamp.ts`, P3-09).

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

### D-28 — Backfill UBS: buyback 1 g dari grafik sebagai seri `variant = ''`

**Konteks:** P1-09 (FR-08). Endpoint grafik UBS (`chart_interval/GOLD/{hari}`, TECH-SPEC §5.1) memuat seluruh histori buyback 1 g sejak 20 Nov 2023, tanpa tahun produksi dan tanpa harga beli. Uji nyata 31 Okt 2026: 549 titik (20 Nov 2023 → 31 Okt 2026); celah terpanjang 79 hari (21 Jun → 8 Sep 2025), lalu dua celah ±33 hari di 2024. Hanya satu perubahan antartitik > 8%: +10,1% yang melewati celah 13 Mar → 15 Apr 2024. Puncak 3.015.000 pada 29 Jan 2026 (+7,1% lalu −6,7% esok harinya).
**Keputusan:**
- Diambil sebagai baris `brand ubs`, `weight_g 1`, **`variant = ''`** (tahun produksi tidak diketahui), `sell_price = null`, `buyback_price = a`, `origin = backfill`. Seri ini sengaja terpisah dari seri harian `variant = YYYY`: backfill tidak pernah menimpa atau merevisi baris scrape, dan tampilan (Fase 3) menyambungkan kedua seri secara eksplisit.
- Tanggal yang sudah punya baris 1 g hasil scrape harian (tahun apa pun) dibuang (`select` di job backfill), agar tidak ada dua seri 1 g di tanggal yang sama.
- Alternatif ditolak: mengisi `variant` dengan tahun produksi terbaru pada tanggal itu. Asumsinya tidak bisa diverifikasi dari sumber, dan baris itu akan bercampur dengan seri harian.
- Histori 6 bulan Logam Mulia dari grafik (D-26) tidak termasuk P1-09: butuh interaksi Playwright terpisah dan menambah risiko blokir. Dicatat sebagai kandidat lanjutan.
**Konsekuensi:** seri 1 g UBS punya histori ±3 tahun sebelum 26 Okt 2026, dengan celah sesuai sumber (tidak diinterpolasi). Puncak 29 Jan 2026 lolos validasi (< 10%) dan dibiarkan apa adanya; bila kelak terbukti salah, perbaiki lewat REVISION `manual`.

### D-29 — Histori Antam LM 1 g sejak 2010 dari arsip scraping

**Konteks:** situs logammulia.com versi baru membatasi grafik ke 6 bulan (D-24), jadi histori panjang tidak bisa diambil lagi dari situs. Ada arsip hasil scraping endpoint lama logammulia.com, dari masa sebelum pembatasan itu: harga dasar 1 g sejak 4 Jan 2010 dan buyback 1 g sejak 25 Nov 2015, sampai 23 Okt 2026. Pemilik arsip memberi izin pemakaian dan meminta tidak disebut.
**Pemeriksaan (31 Okt 2026):** nilai arsip 19–23 Okt 2026 sama persis dengan grafik situs di raw kita, untuk jual maupun buyback. Stempel waktu arsip adalah jam dinding WIB yang tersimpan seolah-olah UTC; titik sebelum 2016 hanya berisi tanggal. Hanya satu perubahan harga dasar antartanggal > 8%: −8,3% pada 30→31 Jan 2026, sejalan dengan lonjakan akhir Januari di data UBS.
**Keputusan:**
- Job backfill lokal `logammulia-archive` (`--input` = folder berisi `antam_sell.json` dan `antam_buy.json`). Job ini tidak muncul di `backfill.yml`, agar lokasi arsip tidak tercatat di kode atau log Actions publik. Diimpor dari terminal, dengan `run_id` `local-…`.
- Baris: `antam`, `gold_bar`, `variant = ''`, `weight_g 1`, `location jakarta`, `origin = backfill`, `parser_version logammulia-archive@1.0.0`. Tanggal = tanggal UTC dari stempel. Titik terakhir per tanggal dipakai. `source_updated_at` = jam stempel +07:00, atau kosong bila hanya tanggal. `buyback_price` kosong sebelum Nov 2015.
- Tanggal yang sudah di-scrape harian dibuang (sama seperti D-28). Arsip berakhir 23 Okt, jadi tidak ada tumpang tindih.
- Raw arsip disimpan di `data/raw/logammulia/` seperti backfill lain.
**Konsekuensi:** kriteria Fase 1 "histori jual sejak 2010 dan buyback sejak 2015" yang dicabut di D-24 terpenuhi kembali untuk 1 g. Hasil impor: 5.086 baris (2010–2026), 0 revisi, 0 karantina. Celah 24–25 Okt 2026 (antara akhir arsip dan scrape harian pertama) tetap ada. Gramasi selain 1 g tetap hanya mulai 26 Okt 2026.

### D-30 — Pegadaian Tabungan Emas masuk cakupan

**Konteks:** buyback emas batangan Pegadaian tidak tersedia (Q-1, D-07), sedangkan Tabungan Emas punya harga jual dan buyback harian serta histori 360 hari. Pemilik proyek memutuskan produk ini penting dan harus ikut dikumpulkan, lengkap dengan backfill-nya (31 Okt 2026). Cakupan Pegadaian lain tetap: vendor tambahan (Retro, Lotus, Disney, Batik, …) tidak diambil.
**Keputusan:**
- Brand baru `pegadaian` (produk milik Pegadaian sendiri), produk `gold_savings`, `weight_g 0.01`. Harga disimpan per 0,01 g persis seperti sumber; konversi per gram dilakukan saat menghitung metrik turunan, bukan di data.
- Scraper harian Pegadaian (`pegadaian@1.1.0`) mengambil Tabungan Emas di run yang sama dengan tabel batangan (jendela `evening`). Kegagalan salah satu endpoint menggagalkan sumber (atomik, D-15). Baris Tabungan Emas memakai `tglBerlaku`-nya sendiri.
- Histori lewat job backfill `pegadaian-savings` (`backfill.yml`): grafik 360 hari, `jual` → `sell_price`, `beli` → `buyback_price`. Job ini juga bisa dijalankan ulang kapan saja untuk menambal hari yang terlewat (grafik selalu memuat 360 hari terakhir); nilai yang sama tidak disentuh, nilai berbeda dicatat sebagai REVISION.
- Alternatif ditolak: menyimpan harga per gram (×100). Mengubah satuan sumber menyulitkan audit terhadap raw.
**Konsekuensi:** Pegadaian kini punya buyback (khusus Tabungan Emas) dan spread harian. Kode yang membandingkan harga lintas produk wajib membagi dengan `weight_g`. V-04 tetap hanya menghitung tiga brand batangan.


### D-31 — Detail resolusi frekuensi di `derive.ts`

**Konteks:** P2-11. DATA-MODEL §6.3 menetapkan urutan D ≥ 80% → M → A, tetapi belum menyebut hari kerja mana yang dihitung, kapan rata-rata `M` cukup untuk satu tahun, dan bagaimana periode berjalan diperlakukan.
**Keputusan:**
- "Hari kerja" untuk cakupan `D` = Senin–Jumat, tanpa mengurangi libur. Seri makro mengikuti kalender pasar yang berbeda (London, Frankfurt, Jakarta); libur JISDOR (±15 hari/tahun) hanya menurunkan cakupan ±6%, masih di atas ambang. Titik akhir pekan ikut dirata-ratakan, tetapi tidak menambah cakupan.
- Agregat tahunan dari `M` dipakai bila bulan yang ada ≥ 80% bulan periode itu; selain itu jatuh ke `A`. Agregat bulanan memakai baris `M` bulan itu, lalu nilai `A` tahunnya.
- Tingkat dicoba per frekuensi lebih dulu, lalu per seri menurut `precedence`: D JISDOR → D ECB → M → A tahunan. Jadi 2013 (JISDOR mulai 20 Mei) memakai ECB harian.
- Periode berjalan dipotong di `until` (default: tanggal terakhir yang diwakili data; baris `M`/`A` mewakili sampai akhir bulan/tahunnya), sehingga tahun berjalan dinilai terhadap hari kerja yang sudah lewat.
- Join kurs harian hanya memakai baris `D`; nilai tahunan tidak pernah dipasangkan dengan tanggal emas harian.
**Konsekuensi:** setiap titik agregat membawa `series`, `frequency`, `points`, dan `coverage` untuk tooltip (FR-32). Aturan ini tidak mengubah data, hanya cara build menghitung.

### D-32 — Job backfill makro dan pembulatan `usd_idr_ecb`

**Konteks:** P2-08 adalah job backfill makro pertama. Kerangka backfill (P1-13) hanya mengenal baris harga, sementara validasi dan merge baris makro baru dibuat di P2-01/P2-02. Kurs ECB adalah hasil bagi dua kurs (EUR/IDR ÷ EUR/USD), sehingga desimalnya panjang.
**Keputusan:**
- Kontrak job dipisah: `PriceBackfillJob` (job yang sudah ada, `kind` opsional `prices`) dan `MacroBackfillJob` (`kind: 'macro'`, `series`, `source` penyedia, `parse` → `MacroRow`). Job `ecb` sudah terdaftar, tetapi `backfill --job ecb` keluar dengan kode 2 dan menyebut P2-01/P2-02 sampai pipeline makro ada. Dengan begitu tidak ada kode run harian yang berubah selama observasi G1.
- `usd_idr_ecb` dibulatkan **2 desimal**. EUR/USD dari ECB hanya 4 desimal (presisi relatif ±1e-4, ±2 Rp), jadi angka di belakang sen adalah presisi semu.
- Tanggal yang kehilangan salah satu kuotasi IDR/USD, kuotasi ganda, atau header yang berubah menggagalkan run (`PARSE_ERROR`), alih-alih menulis seri berlubang diam-diam.
**Konsekuensi:** uji ke endpoint asli (1 Nov 2026): satu respons ±380 KB, 7.126 tanggal (4 Jan 1999 → 30 Okt 2026, ±255 per tahun, cukup untuk ambang 80% di D-31), nilai 6.614–18.176 Rp/US$.

### D-33 — Kurs tahunan 1996–1998 dari World Bank WDI (menjawab Q-3)

**Konteks:** P2-10. Histori harian ECB baru dimulai 4 Jan 1999 dan JISDOR 20 Mei 2013, sehingga kurs 1996–1998 butuh sumber tahunan resmi. TECH-SPEC §5.6 semula menyebut "file statis terverifikasi".
**Keputusan:**
- Sumber: World Bank WDI indikator `PA.NUS.FCRF` (*Official exchange rate, LCU per US$, period average*; data IMF International Financial Statistics), diambil lewat API publik `api.worldbank.org/v2` tanpa key. API dipakai, bukan file statis: nilainya bisa diaudit lewat raw, dan bila World Bank merevisinya, perbedaannya tercatat sebagai REVISION.
- Nilai (WDI `lastupdated` 2026-10-08, dibulatkan 2 desimal, D-32): **1996 = 2.342,30 · 1997 = 2.909,38 · 1998 = 10.013,62** Rp/US$, frekuensi `A`, tanggal 1 Januari, `source = wdi`.
- Verifikasi silang, 1 Nov 2026:
  - **OECD MEI** (`DF_FINMARK`, `IDN.A.CC`, rata-rata kurs spot) = 2.327,09 / 2.883,51 / 10.249,23, selisih −0,6% / −0,9% / +2,4%. Selisih 1998 terbesar karena tahun itu rupiah bergerak ±7.000 → ±16.000 → ±8.000, sehingga metode rata-rata (harian vs bulanan) sangat berpengaruh.
  - **Sambungan 1999**: rata-rata 259 hari ECB (`usd_idr_ecb`) = 7.849,92, sedangkan WDI 1999 = 7.855,15 (−0,07%) dan OECD = 7.848,94 (+0,01%). Pergantian seri `annual` → `ecb` di awal 1999 tidak menimbulkan lompatan.
- Yang tidak dipakai: IMF IFS langsung (host `dataservices.imf.org` tidak dapat di-resolve, portal IMF sudah dipindah) dan FRED (timeout dari jaringan lokal).
**Konsekuensi:** Q-3 terjawab. Agregat tahunan `usd_idr` 1996–1998 memakai tingkat `A` (D-31) dan tooltip menyebut WDI. Grafik kelipatan dengan tahun dasar 1996 bergantung pada nilai 2.342,30. Memakai OECD sebagai gantinya akan menggeser kelipatan kurs sekitar +0,7%, masih dalam toleransi cek silang G2.

### D-34 — Tampilan web mengikuti mockup

**Konteks:** 1 Nov 2026 mockup tujuh halaman web dibuat dan disimpan di `mockup/` (acuan visual Fase 3–4), dengan dua masukan pemilik proyek: Tabungan Emas Pegadaian (D-30) ikut tampil sebagai pelengkap emas fisik, dan halaman Data cukup berisi unduhan.
**Keputusan:**
- **Tabungan Emas di web:** kartu tersendiri di Hari ini (harga per gram = harga per 0,01 g ÷ `weight_g`, harga asli per 0,01 g tetap ditampilkan), filter Semua / Emas fisik / Tabungan emas, tab di tabel gramasi (harga linear terhadap berat), seri di Explorer, garis spread % di Spread, garis dan baris di Bandingkan, opsi sumber di Kalkulator.
- **Halaman Data** hanya berisi kartu unduhan per seri dengan *data terakhir* (tanggal/jam, nilai terakhir, umur). Kamus kolom dan status sumber tidak ditampilkan di web (status sumber masuk halaman Kualitas data, FR-36); dokumentasi API statis pindah ke README repo (P4-10).
- **Warna arah harga:** hijau = naik, merah = turun (konvensi pasar Indonesia), selalu disertai ▲/▼ dan tanda +/−. Warna tidak menilai baik/buruk, kecuali untung/rugi di Kalkulator; spread memakai warna aksen netral.
- Mockup mengatur tampilan; bila bertentangan dengan PRD, DATA-MODEL, atau DECISIONS, dokumen-dokumen itu yang berlaku.
**Konsekuensi:** FR-20, FR-23, FR-30, P3-05, P3-08, P4-05, P4-10 diperbarui. Token desain dan pemetaan mockup → data ada di `mockup/README.md`.

### D-35 — Validasi dan merge baris makro

**Konteks:** P2-01 dan P2-02. V-08/V-09 (TECH-SPEC §7) menyebut batas "per hari", tetapi seri makro punya frekuensi `D`, `M`, `A`; backfill makro (D-32) menulis histori panjang yang memang memuat lonjakan besar; `ScraperId` tidak memuat `ecb` dan `wdi`.
**Keputusan:**
- **V-08/V-09 hanya baris `D`.** Rata-rata bulanan/tahunan wajar bergerak jauh antarperiode (kurs 1997 → 1998 +244%); `M`/`A` hanya lolos V-01. Baris `D` dibandingkan dengan nilai diterima terakhir seri yang sama (data di CSV dan baris batch yang lolos), berapa pun jarak harinya, seperti V-05. Baris yang melompat tidak menjadi pembanding, jadi satu lonjakan tidak menahan hari sesudahnya sedangkan pergeseran level permanen menahan semua hari berikutnya sampai disetujui. Batas tepat (+5% / +8%) lolos.
- **Backfill makro hanya V-01** (plus seri/penyedia baris harus sama dengan job), sama seperti backfill harga: V-05/V-08/V-09/V-11 tidak berlaku, diff dry run menggantikan tinjauannya.
- **V-10** adalah fungsi murni `checkXausFresh({ historyStatus, spotStale })` → `STALE_SOURCE` tingkat run, dipanggil scraper xaus (P2-03).
- **Artifact makro:** `run.json` mendapat `kind: 'macro'` (kosong = harga, artifact lama tidak berubah); `rows.json`/`held.json` berisi baris makro; `spot.json` opsional ditimpa merge ke `data/macro/spot.json` (divalidasi `SpotSnapshot`).
- **`run.source` job backfill makro = modul scraper pemilik seri** (`MacroBackfillJob.scraper`): worldbank → `worldbank`, jisdor/ecb/annual-fx → `jisdor`. Raw, karantina, dan RUN memakai nama itu; `ecb`/`wdi` tetap hanya nilai kolom `source` CSV.
- **Raw makro:** ekstensi `csv` dan `xlsx`; XLSX (dibawa base64 di `RawPayload`) disimpan sebagai byte aslinya, sha256 dihitung atas byte itu.
- **Nilai makro dibandingkan dalam bentuk CSV** (maks. 6 desimal) untuk klasifikasi unchanged/update dan `REVISION`.
**Konsekuensi:** `backfill --job {worldbank,ecb,jisdor,annual-fx}` tidak lagi ditolak CLI. Karantina makro berlokasi di `data/quarantine/{xaus|jisdor|worldbank}/` dan `approve` memakai aturan yang sama dengan harga.

### D-36 — Scrape makro harian: fallback JISDOR, spot, dan World Bank bulanan

**Konteks:** P2-03–P2-05. Pipeline `scrape` semula hanya mengenal baris harga; `plan` tidak tahu data makro; dari mesin lokal koneksi TCP ke bi.go.id ±19,5 detik (batas connect `fetch` Node 10 detik), dari runner GitHub normal.
**Keputusan:**
- **Fallback JISDOR di dalam modul `jisdor`**, bukan job terpisah: bila `GET` BI gagal setelah 3 percobaan `fetchOk` (jaringan, connect timeout, HTTP ≠ 200, blokir), diambil Frankfurter 14 hari terakhir (URL dan parser `backfill/ecb.ts`) dan ditulis ke `usd_idr_ecb`. Run tetap `success` (artifact bersumber `jisdor`), dengan alasan di `error_message`; raw menyimpan CSV dan alasannya. Halaman terbaca tanpa tabel atau header berubah = `PARSE_ERROR`, tanpa fallback (perubahan sumber harus terlihat). Timeout global tidak dinaikkan; `UND_ERR_CONNECT_TIMEOUT` dipetakan ke `FETCH_TIMEOUT`.
- **Jendela xaus** = penutupan dengan `hari ini − 10 ≤ d < hari ini` (hari kalender; tanggal sasaran dari `ctx.date`, D-27), dibawa di raw agar `parse` tetap murni. V-10 dipanggil di `parse`: histori tidak `fresh` atau spot `stale` menggagalkan seluruh run (`STALE_SOURCE`).
- **`spot.json`** dibangun pipeline: nilai emas dari `parse`, kurs dari baris `usd_idr_jisdor`/`usd_idr_ecb` terbaru di `data/macro/` saat scrape (tanggal terbaru menang, JISDOR bila sama). JISDOR hari yang sama baru masuk di merge berikutnya, jadi spot bisa tertinggal satu hari kerja kurs.
- **World Bank** memakai ulang job backfill P2-06 (fetch + parse), tetapi hanya 3 bulan terakhir yang di-upsert (bulan terbaru + revisi dua bulan sebelumnya) agar rilis bulanan tidak merevisi ratusan baris dan memicu V-11. `plan` memilihnya bila tanggal sasaran ≥ 5 dan baris `M` bulan lalu belum ada; `--sources worldbank` eksplisit melewati aturan.
- **`targetDate`** (D-27) kini memahami cron `M H * * D` dengan hari-minggu (`1-5`): kemunculan terakhir ≤ waktu run yang jatuh di hari itu.
**Konsekuensi:** Telegram dari `notify` masih berjudul `scrape-retail` (perbaikan kosmetik tertunda). Status `stale` tidak dipakai untuk makro; keterlambatan data ditangkap `freshness.yml`.

### D-37 — Cek silang makro: titik akhir, Rp/gram 1996 turunan, dan proksi bulanan

**Konteks:** P2-07 dan P2-12 (G2). Grafik referensi (×80 / ×10,3 / ×7,7 per 23 Okt 2026) tidak cocok dengan rata-rata tahunan 2026 berjalan (×86,6 / ×11,6 / ×7,5), dan data Rp/gram hanya ada sejak 2010 (Antam).
**Keputusan:**
- **Referensi = ujung kanan grafik:** `check-macro` melaporkan dua pembanding terhadap rata-rata 1996 yang sama — rata-rata 2026 berjalan (resolusi frekuensi §6.3) dan titik harian terakhir ≤ 23 Okt (emas D × kurs as-of). Hanya yang kedua yang dicocokkan dengan ×80 / ×10,3 / ×7,7; selisih rata-rata berjalan dijelaskan, bukan dianggap galat.
- **Rp/gram 1996 diturunkan per bulan** (`xau_usd_oz` bulanan × kurs bulanan, lalu rata-rata), bukan dari hasil kali dua rata-rata tahunan, supaya identitas Rp/gram ≈ US$/oz × kurs benar-benar diuji (sisa 0,24%) dan bukan benar secara konstruksi.
- **Premi Antam sebelum histori harian xaus (2021-11)** memakai proksi: emas `M` bulan itu × kurs as-of hari sebelumnya, ditandai `basis M` di laporan; setelah itu `derive.premiumAt` (penutupan < tanggal harga).
- **Backfill xaus** memakai ulang `parseHistory`/`closingRows` milik scraper harian dan tidak mengambil spot; jendela 10 hari tidak berlaku, seluruh penutupan sampai kemarin ditulis. Kunci baris yang sama membuat tumpang tindih dengan scrape harian menjadi unchanged/update, tidak ganda.
**Konsekuensi:** `check-macro` perlu dijalankan ulang setelah backfill xaus ter-commit agar [2b] dan premi harian memakai data repo. Skrip tinggal di `apps/scraper/scripts/` (tsconfig dan dependensi sudah ada), bukan `scripts/` di akar yang belum punya paket.

### D-38 — Premi Antam bulanan 2010–2021 di halaman Bandingkan

**Konteks:** P4-09 / FR-33 meminta grafik premi Antam vs spot sejak 2010, tetapi spot harian (xaus) baru ada sejak 6 Nov 2021. Histori Antam LM 1 g sejak Jan 2010 (D-29) dan `xau_usd_oz` bulanan sejak 1996 sudah ada.
**Keputusan:**
- `derived/premium-antam.json` mendapat bagian `monthly` (`[bulan, premi %, frekuensi emas, jumlah hari Antam]`) untuk bulan-bulan **sebelum bulan** titik harian pertama: rata-rata harga Antam 1 g sebulan ÷ Rp/gram spot bulanan − 1, dengan emas dan kurs bulanan dari `aggregate` (resolusi D → M → A, DATA-MODEL §6.3) — rumus yang sama dengan `annual.json`.
- Berbeda dari proksi `check-macro` (D-37, emas `M` × kurs as-of per hari): di web dipakai rata-rata bulanan di kedua sisi supaya satu titik per bulan dan konsisten dengan agregat tahunan. Keduanya hanya estimasi tren.
- Grafik memisahkan dua resolusi: garis tipis tanpa area = bulanan, garis dengan area = harian; tooltip bulanan menyebut jumlah hari harga Antam dan frekuensi emas. Angka "Hari ini", rata-rata, terendah, dan tertinggi tetap dari data harian saja.
**Konsekuensi:** Premi tampil Jan 2010 → kini (142 titik bulanan + harian), file ±67 KB. Bila kelak tersedia spot harian sebelum 2021, bagian `monthly` menyusut otomatis karena dipotong di bulan titik harian pertama.

### D-39 — Kalkulator: buyback Logam Mulia per gram untuk semua ukuran keping

**Konteks:** P4-06. Data buyback Logam Mulia hanya berisi baris 1 g (sejak Nov 2015, D-29), sehingga pembelian Antam LM selain 1 g tidak punya tempat jual di Kalkulator. Logam Mulia menetapkan satu harga buyback per gram yang berlaku untuk semua ukuran keping (dikonfirmasi pemilik proyek, 8 Nov 2026).
**Keputusan:** sumber di `BUYBACK_PER_GRAM` (`lm-antam`) memakai buyback berat itu sendiri bila ada, jika tidak buyback 1 g × berat (`sellOption`, `perGram: true`). Sumber lain tetap ketat: hanya buyback yang tercatat untuk berat itu. UI menyebut "harga buyback per gram (baris 1 g) × berat" di catatan sumber.
**Konsekuensi:** Antam LM 0,5 g – 1.000 g bisa dihitung untung/ruginya terhadap buyback LM. Pembelian Antam di Pegadaian juga bisa dijual ke buyback LM untuk semua berat. Tidak ada perubahan data atau build; aturan hanya di `apps/web/lib/kalkulator.ts`.

### D-40 — Coba ulang otomatis Logam Mulia saat diblokir (mengubah sebagian D-26)

**Konteks:** 8 Nov 2026 Akamai menolak tiga runner GitHub Actions berturut-turut (westus3, westus2, slot retry) dengan HTTP 403 `BLOCKED`. Padahal 26 Okt–7 Nov run dari region lain lolos, dan dari IP rumah tetap HTTP 200. Tiap run mendapat runner dan IP Azure acak, sehingga run baru punya peluang lolos. Data 8 Nov ditambal dengan scrape + merge lokal (`local-20261108133821`).
**Keputusan:**
- Workflow baru `retry-logammulia.yml` (WORKFLOWS §3.9): setelah run **terjadwal** `scrape-retail` gagal untuk `logammulia` dengan `BLOCKED`/`FETCH_HTTP`/`FETCH_TIMEOUT`/`UNKNOWN`, workflow ini memicu `scrape-retail` (`sources=logammulia`) dengan jeda 30 menit, paling banyak 3 run manual per tanggal WIB (termasuk run manual pemilik).
- Batasan D-26 "tanpa retry agresif" dilonggarkan menjadi batas di atas: tetap satu halaman per run, tanpa rotasi IP/proxy, tanpa penyelesai tantangan. `PARSE_ERROR` dan kegagalan validasi tidak dicoba ulang.
- Sumber lain tidak ikut; mereka tetap memakai slot primary/retry biasa.
**Konsekuensi:** paling banyak 5 permintaan ke logammulia.com per hari (2 slot + 3 coba ulang). Tiap percobaan gagal tetap mengirim Telegram dan memperbarui Issue `pipeline-failure`. Bila blokir mencakup seluruh IP Azure, coba ulang tidak membantu; fallback tetap self-hosted runner atau tambal lokal (D-26).

### D-41 — Slot malam terlewat lewat tengah malam: `stale` tanpa alarm (melengkapi D-27)

**Konteks:** 10 Nov 2026 kedua slot malam `scrape-retail` terlambat ±7 jam (19.05 → 02.34, 21.05 → 03.43 WIB 11 Nov). Sesuai D-27 keduanya menyasar 10 Nov, tetapi Pegadaian sudah menampilkan 11 Nov, sehingga V-06 menghasilkan `stale` kode 3: job merah, Telegram dan Issue `pipeline-failure` dibuka, padahal sumbernya sehat dan snapshot 10 Nov memang tidak bisa diambil lagi (kejadian yang sama dengan 26 Okt).
**Keputusan:**
- `scrape` menandai **slot terlewat** bila `stale`, tanggal data > tanggal sasaran, dan tanggal WIB saat run > tanggal sasaran (`missedSlot`). Status tetap `stale` (tidak ada baris yang ditulis), `error_message` ditambah keterangan "terlewat", tetapi kode keluar **0**.
- `notify` hanya memberi tahu `stale` yang kode keluarnya bukan 0, sehingga slot terlewat tidak mengirim Telegram atau membuka Issue. Untuk sumber ritel yang ada (semua `stale_is_error_on_expected_day: true`) perilaku lain tidak berubah.
- Bila sumber masih menampilkan tanggal sasaran (tanggal data = sasaran), run terlambat tetap sukses seperti D-27; bila tanggal data < sasaran, tetap `stale` kode 3 seperti biasa.
**Konsekuensi:** tanggal yang terlewat tetap hilang (terlihat sebagai `stale` di `runs/` dan `status.json`), tetapi tidak lagi tercatat sebagai kegagalan sumber. Pemicu eksternal untuk ketepatan waktu (alternatif D-27) tetap satu-satunya cara mencegah kehilangan data.

### D-42 — Pegadaian di keempat slot dengan toleransi tanggal (mengubah D-25)

**Konteks:** sejak 26 Okt 2026 cron malam `scrape-retail` (19.05 dan 21.05 WIB) hampir selalu baru jalan antara 00.08 dan 05.12 WIB keesokan harinya. Data Pegadaian selamat hanya berkat D-27, dan karena snapshot hari D (terbit ±18.17–21.27 WIB) biasanya masih tampil sampai sore D+1. Pada 11 Nov snapshot 11 Nov terbit pukul 00.05 WIB, sehingga kedua run malam 10 Nov (02.34 dan 03.43 WIB) membaca 11 Nov dan seluruh 31 baris Pegadaian 10 Nov hilang (D-41). Run siang dulu ditolak (D-25) karena V-06 menuntut tanggal data = sasaran, padahal snapshot kemarin yang dibaca siang hari adalah data valid untuk tanggal kemarin.
**Keputusan:**
- `schedule_window: any` (baru): sumber ikut keempat cron `scrape-retail`. Pegadaian = `any`; jadwal cron tidak berubah. Run manual siang tidak lagi melewati Pegadaian.
- `accept_previous_day: true` (baru, default `false`): V-06 menerima tanggal data dalam rentang [sasaran − 1, max(sasaran, tanggal WIB saat run)]. Baris disimpan dengan tanggalnya sendiri (`tglBerlaku`), sehingga slot siang menambal snapshot kemarin bila slot malam gagal atau terlambat, dan run terlambat yang membaca snapshot hari berikutnya ikut menyimpannya. Upsert memperlakukan tanggal yang sudah ada sebagai unchanged atau revisi.
- Di luar rentang (mis. snapshot dua hari lalu) tetap `stale` dengan kode 3 dan memicu alarm di slot retry.
**Konsekuensi:** tiap tanggal punya hingga empat kesempatan selama snapshotnya tampil, bukan hanya dua slot malam. Paling banyak 4 run Pegadaian per hari (masing-masing 2 permintaan). Alarm "Pegadaian belum terbit hari ini" baru muncul keesokan harinya, karena slot malam yang membaca snapshot kemarin dianggap sukses. Tanggal tetap hilang bila snapshotnya hanya tampil singkat dan tidak ada run yang jatuh di jendela itu (kasus 10 Nov); penangkalnya tetap pemicu eksternal (D-27).

### D-43 — Beranda v2: harga dulu, perbandingan lintas merek, tema terang default

**Konteks:** 11 Nov 2026 beranda dibandingkan dengan harga-emas.co.id. Kartu harga pertama baru muncul sekitar 590 px dari atas: di atasnya ada judul 72 px, empat sel spot, dan lima chip status. Perbandingan antarmerek (pertanyaan utama pengunjung) hanya bisa dilakukan satu sumber per tab. Istilah nav (Explorer, Spread) asing bagi pengguna awam.
**Keputusan:**
- Acuan baru beranda: `plan/mockup/Main-v2.dc.html` (menggantikan `Main.dc.html` untuk `/`). Judul 46 px; empat kartu ringkas di hero (harga, perubahan, buyback, selisih + bar). Catatan sumber, PPh, dan Q-1 masuk panel ⓘ per kartu.
- Lima chip status digabung jadi satu tombol "Diperbarui …" yang bisa dibuka. Data spot dunia jadi satu baris ringkas di bawah kartu.
- Tabel "Semua gramasi" per sumber diganti matriks **Bandingkan per gramasi** (kolom: Antam LM, Antam Pegadaian, UBS, Galeri24; mode jual/buyback/selisih; per keping/per gram; penanda termurah/tertinggi/terkecil hanya bila ≥2 nilai tersedia). Ditambah grafik tren 1 g (7H/30H/90H/1T + tertinggi/terendah/rata-rata) dan bagian edukasi + FAQ.
- Label nav: Explorer → "Riwayat harga", Spread → "Selisih jual-beli". Rute tidak berubah.
- Tema default **terang**, latar terang dihangatkan (`--bg #F7F5F0`, token baru `--hero #EFECE4`). Pilihan tersimpan pengguna tetap dihormati.
**Konsekuensi:** dikerjakan dua gelombang: (1) hero, kartu, status, spot, nav, tema, edukasi/FAQ; (2) matriks dan grafik tren. Sampai gelombang 2 selesai, tabel lama tetap tampil. Tidak ada perubahan data atau build.

### D-44 — Retry cron tambahan dan alarm "data belum masuk"

**Konteks:** 11 Nov 2026 sampai 10.10 UTC belum ada satu pun run terjadwal `scrape-retail`/`scrape-macro`, padahal dua cron siang sudah lewat. (Koreksi 12 Nov: slot 10.25 WIB ternyata tetap berjalan pada 11.12 UTC, terlambat 7 jam 47 menit, bukan hilang; lihat D-45.) Beranda menampilkan harga 10 Nov sampai dipicu manual, dan tidak ada notifikasi karena `notify` hanya berjalan bila scrape berjalan. Chip "5 dari 5 sumber terkini" tetap hijau (ambang ≤ 2 hari).
**Keputusan:**
- `scrape-retail` mendapat retry tambahan: siang 12.25 & 15.25 WIB, malam 22.35 WIB. `scrape-macro` mendapat retry 18.40 WIB hari kerja. Retry tanpa kerja selesai ±20 detik karena `plan` melewati sumber yang sudah sukses.
- Retry makro melewati sumber yang sukses pada tanggal itu pukul ≥ 12.00 WIB (`succeededOn`): `xaus` selalu bertanggal hari bursa sebelumnya, jadi `doneToday` saja akan selalu mengulang. Sukses sebelum 12.00 WIB dianggap run kemarin yang terlambat.
- Workflow baru `watchdog.yml` (16.50 WIB: ritel jendela `day`; 23.20 WIB, diubah D-45 menjadi 23.50 WIB: semua sumber) membaca `status.json` dan mengirim Telegram bila sumber yang diharapkan hari itu belum masuk (ritel: `last_data_date` = hari itu; makro: `succeededOn`). Run merah bila Telegram tidak tersedia atau gagal, sehingga email GitHub menjadi cadangan.
**Konsekuensi:** watchdog sendiri juga cron GitHub dan bisa ikut terlambat, tapi dua jadwal terpisah memperkecil peluang semuanya terlewat. Jika masih sering terjadi, pemicu eksternal (`workflow_dispatch` lewat API) dipertimbangkan. `freshness.yml` (Fase 5, Issue) tetap direncanakan; watchdog hanya menutup kebutuhan alarm harian lebih awal. Pegadaian yang snapshot-nya baru terbit lewat 23.20 WIB bisa memicu alarm palsu.

### D-45 — Pemicu eksternal Cloudflare Workers (melengkapi D-44)

**Konteks:** riwayat 8–11 Nov 2026 menunjukkan tidak ada cron yang hilang, tetapi semua run terjadwal terlambat 4 jam 37 menit – 10 jam 24 menit (median 7 jam 37 menit). Primary siang 10.25 WIB selalu baru mulai 17.34–18.48 WIB, sehingga beranda menampilkan harga kemarin sampai sore. Retry D-44 ikut tergeser dan berdempetan dini hari; watchdog 23.20 WIB baru jalan 05.43 WIB.
**Keputusan:**
- Worker `apps/trigger` di Cloudflare Workers (paket Free, 4 dari 5 Cron Triggers per akun) memanggil `workflow_dispatch` tepat waktu dengan input `schedule` = cron GitHub yang ditiru: `scrape-retail` 10.25/13.25/19.05/21.05 WIB, `scrape-macro` 16.40/18.40 WIB hari kerja, `watchdog` 16.50/23.50 WIB.
- Workflow meneruskan input itu ke `--emulate`; `plan` dan `watchdog` memperlakukannya persis seperti run terjadwal cron tersebut (slot, jendela, tanggal sasaran). Hanya cron yang terdaftar di `SCHEDULES`/`WATCHDOG_SCHEDULES` yang diterima. RUN tetap mencatat `trigger: workflow_dispatch`, dan slotnya bukan `manual`, sehingga batas harian `retry-logammulia` tidak terpakai.
- Judul run dari Worker `scrape-retail (cron …)`; `retry-logammulia` juga bereaksi pada judul ini.
- Cron watchdog semua sumber digeser 23.20 → 23.50 WIB agar Worker cukup memakai satu cron (`50 9,16`).
- Hari-minggu cron Cloudflare memakai nama hari (`MON-FRI`), karena di Cloudflare `1` = Minggu; `1-5` sempat terpasang sebagai Minggu–Kamis saat deploy pertama 12 Nov.
- Cron GitHub tetap aktif sebagai cadangan. Bila Worker gagal dispatch, ia mengirim Telegram (opsional) dan cron GitHub tetap jalan walau terlambat.
**Konsekuensi:** perlu fine-grained PAT (hanya repo ini, Actions read/write) sebagai secret Worker, yang harus diperbarui saat kedaluwarsa. Cron GitHub cadangan yang datang ±7 jam kemudian: slot retry dilewati karena sudah sukses, tetapi slot primary menjalankan ulang sumbernya (commit data `+0` dan build Vercel tambahan, sekitar 2–3 kali sehari).

### D-46 — Cloudflare sebagai pemicu utama, cron GitHub hanya retry cadangan (melengkapi D-44, D-45)
**Konteks:** setelah D-45 ada 15 cron (GitHub 11, Cloudflare 4 yang memicu 8 run), dan cron GitHub yang tiba ±7 jam kemudian masih berslot `primary` sehingga menjalankan ulang sumber dan menghasilkan commit data `+0` serta build Vercel tambahan. Pemilik ingin cron lebih ramping dan harga pagi/siang di beranda sudah milik hari itu. Uji 12 Nov: Worker memicu `scrape-macro` 16.41 WIB dan `watchdog` 16.50 WIB tepat waktu; watchdog benar menandai ritel 12 Nov yang belum masuk karena slot pagi lewat sebelum Worker aktif.
**Keputusan:**
- Semua slot utama dipicu Cloudflare dengan **2 Cron Trigger**: `5 2,5,6,12,15,16 * * *` (09.05 primary siang, 12.05 retry siang, 13.05 watchdog siang, 19.05 primary malam, 22.05 retry malam, 23.05 watchdog semua sumber) dan `40 9 * * MON-FRI` (16.40 makro). Primary siang maju dari 10.25 ke 09.05 WIB karena Logam Mulia terbit ±07.30–08.40 WIB; bila UBS belum terbit, retry 12.05 menambal, dan watchdog 13.05 memberi alarm siang, bukan sore.
- Kunci slot Cloudflare ada di `SCHEDULES`/`WATCHDOG_SCHEDULES` tetapi **tidak** di `on.schedule`, sehingga cron GitHub tidak pernah menjadi slot utama.
- Cron GitHub tinggal 5, semuanya cadangan: `scrape-retail` 04.15, 09.15 (retry `day`) dan 19.15 WIB (retry `evening`); `scrape-macro` 16.45 WIB hari kerja (retry); `watchdog` 23.15 WIB (semua sumber; tiba esok pagi, memeriksa tanggal cron-nya — penanda Worker mati total). Dicatat di `GITHUB_SCHEDULES`/`GITHUB_WATCHDOG_SCHEDULES`; tes memastikan YAML sama dan semuanya `retry`.
- Cron 04.15 WIB memanfaatkan keterlambatan GitHub agar tiba ±09–14 WIB. Pengaman `DAY_FROM` = 08.30 WIB: sumber jendela `day` dilewati bila run tiba sebelum jam itu pada tanggal sasarannya (juga run manual tanpa daftar sumber), alih-alih mencatat `stale`. Run kemarin yang tiba lewat tengah malam tidak terkena.
- Retry siang melewati sumber `accept_previous_day` (Pegadaian) yang hari ini sudah sukses: snapshot siang selalu milik kemarin, jadi ulangannya hanya commit `+0`. Retry malam tetap menjalankannya.
- Tidak ada cron dini hari di Cloudflare: belum ada sumber yang terbit sebelum ±07.30 WIB; snapshot Pegadaian yang sesekali terbit 00.05 WIB ditambal slot siang (D-42).
- `watchdog.yml` mendapat `run-name` `watchdog (cron …)` seperti dua workflow lain.
**Konsekuensi:** total cron 15 → 7. Retry malam terakhir maju 22.35 → 22.05 dan watchdog semua sumber 23.50 → 23.05 WIB; Pegadaian yang terbit setelah 22.05 bisa memicu alarm palsu sesekali. Slot 18.40 (retry makro) dan 15.25 (retry siang ketiga) tidak ada lagi di jalur tepat waktu; kegagalannya ditangkap watchdog dan cron cadangan. Keterlambatan cron GitHub dini hari belum terukur (data D-45 dari cron siang/malam); bila 04.15 sering tiba sebelum 08.30, cron itu tidak berguna dan bisa digeser. Perlu `wrangler deploy` ulang setelah perubahan ini. `plan/WORKFLOWS.md`, yang terhapus tak sengaja pada commit D-45, dipulihkan bersama perubahan ini.

### D-47 — Tata letak padat: isi utama tiap halaman alat terlihat tanpa scroll
**Konteks:** audit UI 12 Nov di 1366×768: header 139 px (chip status dan tombol tema turun ke baris kedua; 191 px di HP), pembuka halaman 231–257 px (judul 56 px). Akibatnya grafik utama mulai di y=539 (Explorer), 664 (Kelipatan), 677 (Bandingkan), bahkan 843 di Spread (di bawah lipatan); di HP panel "Series aktif" Explorer (±1.400 px) mendahului grafik.
**Keputusan:**
- Header satu baris di ≥ 1280 px (brand 30 px, judul 19 px, nav 36 px, tombol tema 36 px, padding 10 px → 57 px); di bawahnya dua baris (brand + status, lalu nav bergulir). Chip status di HP hanya tanggal ("Data" tetap untuk pembaca layar). Subjudul "Antam · UBS · Galeri24" hanya di ≥ 1536 px.
- `PageIntro` default `compact` (judul 36/28 px, lead 14 px, padding 24/20 px); ukuran mockup asli jadi `size="hero"` (404).
- `Segmented` dan `RangeControl` mendapat `size="sm"` (36 px desktop, 40 px di layar sempit) untuk toolbar padat di atas grafik.
- HP (< 640 px): lead dan eyebrow `PageIntro` disembunyikan (lead tetap di DOM); `Segmented scroll` dan pilihan rentang jadi satu baris geser; chip ringkasan Kelipatan bergeser horizontal; KPI Spread di bawah grafik; tinggi grafik lewat `useChartHeight(desktop, phone)`.
- Target per halaman alat di 1366×768: kartu grafik/hasil utama mulai ≤ ±330 px dan sebisa mungkin utuh di layar pertama; di HP grafik mendahului panel pengaturan.
**Konsekuensi:** menyimpang dari ukuran mockup `plan/mockup/*.dc.html` untuk header, pembuka halaman, dan toolbar; beranda tidak berubah. Target sentuh di layar sempit 40 px (masih di atas minimum WCAG 2.5.8 24 px, di bawah saran 44 px).

### D-48 — Skala teks bertingkat dan teks pendukung terlipat
**Konteks:** audit 13 Nov di HP: beranda memakai 9 ukuran berbeda antara 11–15 px (11, 11,5, 12, 12,5, 13, 13,5, 14, 14,5, 15) sehingga judul panel, isi, dan keterangan tampak sama besar; atribusi "Sumber: …" dan catatan kaki tampil penuh di setiap panel dan bersaing dengan angka.
**Keputusan:**
- Skala teks di `globals.css` (`@theme`): `2xs` 11 px (label kapital), `xs` 12 px (keterangan/meta), `sm` 14 px (teks pendukung, tabel, tombol), `base` 16 px (isi/lead), `lg` 18 px / `xl` 20 px (judul panel, angka sekunder), serif 26–60 px (judul seksi, angka utama). Ukuran arbitrer `text-[N px]` di bawah 16 px tidak dipakai lagi.
- Judul panel 20 px (18 px di HP); judul seksi serif 32 px (26 px di HP, di bawah judul halaman); lead beranda 14 px di HP.
- `SourceStamp` default terlipat di balik tombol "Sumber" (`InfoDisclosure`, `<details>` tanpa JS, dibuka dengan klik/ketuk). Beberapa sumber di satu panel digabung dalam satu lipatan (`bare`); catatan kaki tabel beranda ("Catatan") dan Bandingkan ("Sumber & catatan") ikut terlipat.
**Konsekuensi:** FR-26 tetap terpenuhi (atribusi ada di setiap tampilan harga, satu ketukan, dan tetap di DOM), tetapi tidak lagi terlihat tanpa interaksi. Disclaimer "bukan rekomendasi investasi" dan catatan indikatif spot tetap terlihat.

### D-49 — Halaman UBS diambil melewati cache FastCGI (melengkapi D-19)

**Konteks:** 13 Nov 2026 ketiga run UBS `stale`. Run 08.49 dan 09.06 WIB membaca data 12 Nov (UBS belum terbit, wajar). Run retry 12.05 WIB membaca grafik yang sudah memuat 13 Nov (Rp2.276.000), tetapi tabel halaman masih identik dengan snapshot 08.49 WIB (buyback 1 g Rp2.290.000 = harga 12 Nov), karena halaman disajikan dari cache FastCGI (`x-fastcgi-cache: HIT`). Uji 15.15 WIB: URL dengan query unik dijawab `x-fastcgi-cache: BYPASS`. Harga UBS juga bisa berubah lebih dari sekali sehari (grafik 13 Nov: 2.276.000 pukul 12.06, 2.269.000 pukul 15.15 WIB).
**Keputusan:** `fetchRaw` meminta `PAGE_URL?nc={epoch ms}` (`pageUrl()`). Endpoint grafik (POST admin-ajax) tidak di-cache dan tidak diubah. Parser dan `parser_version` tetap.
**Konsekuensi:** satu permintaan per run tetap menembus cache ke PHP situs (paling banyak beberapa kali sehari). Run yang jatuh tepat saat situs sedang memperbarui harga masih bisa `stale` dan ditambal slot berikutnya. Data UBS 12 Nov hanya tersedia sebagai buyback 1 g backfill (tidak ada run 12 Nov sebelum Worker aktif, D-46).

### D-50 — Token warna design system Momen Emas; tema gelap jadi Navy

**Konteks:** design system "Momen Emas" (13 Nov 2026, artifact claude.ai) menetapkan nama token yang sama dengan `globals.css`, tetapi mengganti tema gelap abu-arang (`#0e0f12`) dengan Navy (`#0f1a2b`), mengubah warna seri Antam dan Galeri 24 agar terbedakan bagi buta warna merah-hijau, dan menambah token `gold-strong`, `gold-glint`, `spot`, `navy`. Penerapan dibagi gelombang: (1) token, (2) nama, logo, favicon, OG, (3) warna seri grafik dan `spot`, (4) menu bawah dan tata letak HP.
**Keputusan (gelombang 1):**
- `:root` = tema terang (bawaan, D-43); `[data-theme='dark']` = nilai Navy dari design system. Tema terang tidak berubah kecuali `antam` `#a67c1e` dan `g24` `#9c3220`; Navy: `antam` `#e6c27a`, `g24` `#d8603c`.
- Token baru dan kelas Tailwind-nya: `gold-strong` (teks emas di atas `goldsoft`, dipakai menu aktif), `gold-glint` (penanda titik grafik), `spot` (seri pembanding non-brand), `navy` (warna merek tetap).
- `FALLBACK_TOKENS` grafik dan `themeColor` viewport mengikuti nilai baru (terang `#F7F5F0`, Navy `#0F1A2B`).
**Konsekuensi:** tampilan mode gelap berubah warna; tata letak, data, dan build tidak berubah. Seri non-brand (Kelipatan, premi, spread) masih memakai `gold`/`ubs`/`g24` sampai gelombang 3. Nama situs dan OG image (`#F4F4F1`) baru diubah di gelombang 2.
