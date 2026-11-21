# Fase 7 — Hartadinata (EMASKU)

| | |
| --- | --- |
| **Tujuan** | Menambah brand **EMASKU** (PT Hartadinata Abadi Tbk, hrtagold.id) sebagai sumber baru `hrtagold`: harga jual + buyback per keping untuk 17 gramasi Gold (0,1–1.000 g) dan 3 gramasi Prime (25/50/100 g), satu request per hari, tampil di semua halaman web |
| **Bergantung pada** | G1 (pipeline ritel stabil) dan G6 (pola sumber/brand baru dari Fase 6). Bisa jalan paralel dengan Fase 5 |
| **Perkiraan usaha** | 3–4 hari kerja, ditambah observasi probe 5–7 hari di belakang (tanpa kerja aktif) |
| **Gerbang keluar** | **G7** |
| **Keputusan pemilik** | Q-11 (21 Nov 2026): aktifkan dan tampilkan, risiko klausul §9 diterima (D-69). Q-8 dan Q-9 terjawab; Q-10 terbuka sampai P7-08 |
| **Riset** | [research/hartadinata.md](../research/hartadinata.md) |

## Ruang lingkup

**Masuk:**

- Sumber `hrtagold` (`GET https://hrtagold.id/api/v1/brandings/price/daily`), scraper `hrtagold@1.0.0`.
- Brand `emasku`; Gold = `variant ''`, Prime = `variant 'prime'` (seri terpisah, tidak digabung).
- Probe dari runner GitHub, observasi jam terbit dan kalender 5–7 hari, jadwal final.
- Web: kartu Hari ini (keputusan layout lima kartu batangan), Spread, Bandingkan, Explorer, Kalkulator, Data, atribusi.
- Dokumen: D-69, PRD, TECH-SPEC §5.9 dan §7, DATA-MODEL §3.6.

**Tidak masuk:**

- Perhiasan Ardore, aplikasi EmasKITA, endpoint `price/one`.
- Backfill histori (Q-8). Dikerjakan hanya bila P7-02 menemukan endpoint resmi **dan** pemilik menyetujui; jadi tugas tambahan setelah G7.
- Sumber media (Bisnis.com, Kontan/MomsMoney) sebagai histori.

## Prinsip

- Pola Fase 6 dipakai ulang: kontrak `SourceScraper` (TECH-SPEC §3), raw apa adanya + gzip (FR-11), gagal keras pada perubahan struktur, **katalog masuk di commit yang sama dengan parser** (jika tidak, run pertama mengarantina semuanya sebagai `UNKNOWN_ITEM`, V-02).
- Tidak menembus proteksi bot (D-24). Bila runner diblokir: P7-05–P7-07 ditandai "tertahan" dengan alasan, bukan diakali.
- Satu request per run (NFR-12), User-Agent proyek, tanpa Origin/Referer/cookie.
- Buyback dibaca **per keping dari respons**; tidak pernah dihitung dari 1 g (buyback per gram 250/500/1.000 g berbeda dari gramasi kecil).
- Prime tidak boleh mengganti atau menggeser Gold: `isYearVariant('prime') === false`, jadi `matchAcrossSources` jatuh ke `variant = ''` (aturan D-64, sudah ada).
- Penamaan (usulan, dikunci di D-69): `source = hrtagold`, `brand = emasku`, label "EMASKU (Hartadinata)" / pendek "EMASKU". Alternatif `hartadinata` ditolak karena nama perusahaan yang juga menaungi merek lain; konsumen mengenal EMASKU, sejajar dengan `antam` dan `ubs` yang juga nama merek.

## Tugas

### Gelombang A — validasi akses dan observasi (wajib sebelum kode produksi)

- [x] **P7-01** Probe `hrtagold` dari runner GitHub, fixture, dan observasi jam terbit. — `G0`-style · M
  - Tambah target di `apps/scraper/src/probe/targets.ts` dan `checkHrtaGold` di `checks.ts`, jalankan lewat `probe.yml`.
  - `checkHrtaGold`: `GET /api/v1/brandings/price/daily` → 200 `application/json`, `code = 200`, `updated_date` valid ISO `+07:00`, seri `Gold` ≥ 12 gramasi dan seri `Prime` ada, semua `price` dan `buyback_price` bilangan bulat > 0, `buyback_price < price`, tanggal `updated_date` ≤ 3 hari dari hari ini. Respons berisi tantangan (`Just a moment`, `cf-chl`) atau 403/429/503 → `BLOCKED`.
  - Simpan fixture di `apps/scraper/test/fixtures/hrtagold/` dengan `README.md` seperti fixture lain: `price-daily-2026-11-21.json` (respons penuh, diambil dari terminal lokal) dan satu fixture sintetis kasus tepi (Prime tanpa Gold, harga 0, `buyback ≥ jual`, tanggal kemarin).
  - **Observasi 5–7 hari:** tambah `schedule:` **sementara** di `probe.yml` yang hanya mem-probe `hrtagold` (usulan 01.00, 03.00, 05.00, 07.00, 09.00, 11.00 UTC = 08.00–18.00 WIB tiap 2 jam, bergeser bila perlu), mencatat `updated_date`, `created_at`, dan harga Gold 1 g per probe. Dijawab: jam terbit, revisi di hari yang sama, Sabtu/Minggu/libur nasional.
  - *Probe runner 21 Nov 2026 (run 44864330585, AS): hijau. Observasi jam terbit berjalan.*
  - Hasil dicatat di research/hartadinata.md §3–§4. Bila runner diblokir → P7-05–P7-07 "tertahan", P7-03/P7-04 tetap boleh jalan.
- [x] **P7-02** Investigasi lokal: syarat situs, PPh, dan endpoint histori (Q-8, Q-9). — S
  - *21 Nov 2026: Q-8 ditutup (tidak ada histori di situs), Q-9 terjawab (harga sudah termasuk pajak). Temuan baru: Syarat & Ketentuan §9 melarang publikasi ulang Konten HRTA → Q-11, wajib diputuskan sebelum P7-07.*
  - Dari terminal lokal, **maksimal ±5 request** tambahan, jeda ≥ 5 detik, tanpa menembus proteksi apa pun.
  - Baca FAQ/syarat di `hrtagold.id` (halaman publik): apakah "Harga Dasar" sudah termasuk PPh 0,25% (Q-9), dan ada pembatasan pengambilan otomatis? Hasil menentukan label web dan catatan D-69.
  - Cari endpoint histori: parameter tanggal pada `price/daily`, atau rute yang dipakai grafik harga di aplikasi/situs (`/api/v1/brandings/price/...`). Hanya dari jaringan browser biasa dan permintaan GET publik; **jangan** mencoba menebak rute secara acak atau membongkar autentikasi.
  - Bila endpoint histori ada: catat bentuk, rentang tanggal, dan batas; minta persetujuan pemilik (pola Q-7) dan buat tugas backfill baru **setelah** G7. Bila tidak ada: Q-8 ditutup "tidak ada histori, seri mulai saat aktivasi".

### Gelombang B — skema dan konfigurasi

- [x] **P7-03** Skema `@gold/schema` (`packages/schema/src/enums.ts`) + penyesuaian tipe di web. — S
  - `SCRAPER_IDS` dan `PRICE_SOURCES`: tambah `hrtagold`. `BRANDS`: tambah `emasku`. `variant = 'prime'` bukan enum (string bebas), tidak perlu perubahan skema.
  - **Web ikut berubah di commit yang sama** (pelajaran P6-02): `SOURCE_LABELS`, `SOURCE_DOMAINS`, `BRAND_LABELS`, `SCRAPER_LABELS` (`apps/web/lib/data/catalog.ts`), `SOURCE_DOMAIN` dan `SOURCE_VERB` (`apps/web/lib/source-stamp.ts`) bertipe `Record<…>`; tanpa entri baru `pnpm typecheck` gagal. Isi label/domain minimal (`EMASKU`, `hrtagold.id`); UI di Gelombang E.
  - Uji `packages/schema/test/*` untuk enum baru; tambah kasus `derive.test.ts`: `isYearVariant('prime') === false`, `newestYearVariant` mengabaikan `prime`, dan `matchAcrossSources` memilih `variant ''` untuk sumber dengan varian `''` + `prime`.
  - Nilai enum baru bukan perubahan kolom → `SCHEMA_VERSION` tetap (DATA-MODEL §8).
- [x] **P7-04** Konfigurasi sumber (`enabled: false`). — S
  - `config/sources.yml`, usulan (sesuaikan dengan P7-01):

    ```yaml
    - id: hrtagold
      kind: prices
      url: https://hrtagold.id/api/v1/brandings/price/daily
      fetch_method: api
      workflow: scrape-retail
      update_calendar: daily # sampel: Sabtu 21 Nov terbit; final setelah observasi (Q-10)
      schedule_window: day # terbit 08.12 WIB (21 Nov); final setelah observasi
      stale_is_error_on_expected_day: false # jadi true setelah kalender terbukti (pola D-68)
      accept_previous_day: true
      parser_version: 1.0.0
      enabled: false # true di P7-07
      notes: Satu GET JSON tanpa token yang mengisi hrtagold.id/id/gold-price (Gold + Prime). Jual dan buyback per keping untuk semua gramasi. Tanpa histori.
    ```

  - Katalog **tidak** ditambah di sini; masuk di P7-05 bersama parser.

### Gelombang C — scraper

- [x] **P7-05** `apps/scraper/src/sources/hrtagold.ts` (`hrtagold@1.0.0`), daftarkan di `sources/index.ts`, plus katalog. — `FR-02` (perluasan), `FR-10` · M
  - `fetchRaw`: satu `GET` JSON, `Accept: application/json`, User-Agent proyek. `403`/`429`/`503` berisi tantangan atau HTTP 200 berisi tantangan → `BLOCKED` tanpa retry agresif; 200 bukan JSON → `PARSE_ERROR`. Raw = respons utuh (±4 KB), `application/json`.
  - `parse` (murni):
    - Wajib: `code = 200`, `updated_date` ISO valid, `data` array. Bentuk tak dikenal (data kosong, seri `Gold` hilang, angka bukan bilangan bulat aman) → `PARSE_ERROR`.
    - Seri `Gold` → `variant = ''`, seri `Prime` → `variant = 'prime'`. Seri lain (nama baru) dilewati dan dicatat di `note`, bukan karantina.
    - `gramasi` lewat `canonicalWeight`; jangan bergantung pada urutan array (`gramasi_id` tidak berurutan).
    - Baris: `source = hrtagold`, `brand = emasku`, `product = gold_bar`, `location = ''`, `sell_price = price`, `buyback_price = buyback_price` (0/null → `null`; keduanya kosong → dilewati), `source_updated_at = updated_date` (+07:00).
    - `dataDate` = tanggal WIB dari `updated_date`; `sourceUpdatedAt` = `updated_date`. Bila `dataDate` ≠ hari ini WIB → hasil `stale` (V-06) dan `accept_previous_day` (D-42) berlaku. Baris tidak pernah carry-over (D-66, tanggal WIB `source_updated_at` = `dataDate`).
    - Duplikat kunci gramasi dalam satu seri → ambil yang terakhir dan catat di `note`.
  - `config/catalog.yml` (commit yang sama):
    - `hrtagold × emasku × gold_bar` [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 125, 150, 175, 200, 250, 500, 1000], `active_from` = tanggal aktivasi (P7-07; selama `enabled: false` boleh tanggal hari commit).
    - Kunci katalog tidak memuat `variant` → Prime 25/50/100 ikut tervalidasi oleh grup di atas, tidak perlu grup sendiri.
  - Uji `apps/scraper/test/hrtagold.test.ts` dengan fixture 21 Nov 2026:
    - 17 baris Gold + 3 baris Prime; nilai 1 g (2.258.000 / 2.122.000), 0,1 g, 1.000 g;
    - `variant` benar per seri; urutan array diacak → hasil sama;
    - tanggal kemarin → `stale`; `updated_date` rusak → `PARSE_ERROR`; Gold hilang → `PARSE_ERROR`; seri tak dikenal → dilewati + note; tantangan → `BLOCKED`.
- [x] **P7-06** Validasi untuk `hrtagold` di `apps/scraper/src/pipeline/validate.ts`. — `FR-10` · S
  - V-04: `MIN_ROWS.hrtagold = 12` baris `variant = ''` (dari 17 gramasi Gold). Prime tidak dihitung (opsional).
  - V-03: buyback < jual per baris; pelanggaran pada Gold → `VALIDATION_FAILED`; pada Prime → baris dibuang + `note` (Prime opsional, tidak boleh menggagalkan seri Gold; aturan baris opsional Fase 6).
  - V-05/V-06: berlaku seperti sumber ritel lain; `seriesKey` memuat `variant`, jadi lompatan Prime dibandingkan dengan Prime sendiri.
  - **Cek lunak** (tidak menggagalkan): buyback Prime sama dengan buyback Gold untuk gramasi yang sama. Bila beda → `note` (tanda produk berubah), bukan karantina.
  - Perbarui TECH-SPEC §7 (V-03/V-04 menyebut `hrtagold`).

### Gelombang D — aktivasi

- [x] **P7-07** Aktifkan `hrtagold`. — `FR-09` · S
  - *21 Nov 2026: Q-11 diputuskan pemilik (aktifkan dan tampilkan). `enabled: true`, `active_from` 2026-11-21; run manual pertama `scrape-retail` `sources=hrtagold`. G7 mulai dihitung.*
  - **Prasyarat: Q-11 diputuskan pemilik** (izin HRTA / arsip tanpa publikasi / batal).
  - Prasyarat: P7-01 hijau dari runner, P7-05 dan P7-06 lulus, dan **P7-09 (data layer web) sudah masuk** supaya data baru tidak merusak halaman (tipe `Record` sudah lengkap).
  - `enabled: true`, satu run manual `scrape-retail` dengan `sources=hrtagold`, cek commit data + `status.json`. Watchdog membaca `config.sources`, jadi otomatis ikut dicek.
  - `catalog.yml` `active_from` = tanggal run pertama. Cabut `schedule:` probe sementara bila observasi selesai (P7-08).
  - Mulai hitung 7 hari G7.
- [ ] **P7-08** Jadwal dan kalender final (menutup Q-10). — S
  - Dari observasi P7-01: `schedule_window` (`day` atau lain), `update_calendar` (`daily` / `mon_sat_id` / `business_days_id`), `stale_is_error_on_expected_day`. Perbarui `config/sources.yml`, `SCHEDULES` Worker bila jendela baru, dan hapus `schedule:` sementara di `probe.yml`.
  - Catat di D-69 (atau keputusan susulan, pola D-68). Bila jendela `day` ternyata terbit setelah 08.15 WIB pada banyak hari, pertimbangkan `midday`.
  - Bila Worker `apps/trigger` berubah → `wrangler deploy` setelah kode di `main` (catatan D-67).

### Gelombang E — web

- [x] **P7-09** Data layer web: sumber `hrtagold`, brand `emasku`, varian `prime`. — `FR-20`–`FR-23`, `FR-30` · S
  - `lib/data/catalog.ts`: `PRICE_SOURCE_IDS`, `SOURCE_LABELS` (`EMASKU (Hartadinata)`), `SOURCE_DOMAINS` (`hrtagold.id`), `BRAND_IDS`, `BRAND_LABELS` (`EMASKU`), `FILE_ORDER` (`hrtagold-emasku` setelah `lotusarchi-lotusarchi`).
  - Token warna `emasku`: tambah ke `ColorToken` (`lib/data/types.ts`), `COLOR_CLASSES`, variabel `--emasku` terang/gelap di `app/globals.css`. Pilih hue yang belum dipakai token lain (`--antam`, `--ubs`, `--g24`, `--tab`, `--lotus`) dan **cek kontras** seperti D-62; usulan ditetapkan saat implementasi.
  - `lib/explorer.ts` `BRANDS`; `app/data/page.tsx` `BRAND_NAME`; `lib/source-stamp.ts` (atribusi `hrtagold.id`, kata kerja sumber).
  - Varian `prime`: pastikan `lib/explorer.ts`, `lib/bandingkan.ts`, `lib/spread.ts`, `lib/build/latest.ts`, `lib/today.ts` tidak menggabung Prime ke seri Gold ("variant awal menang"). Prime hanya muncul sebagai opsi tersendiri.
  - Uji unit di `lib/`.
- [x] **P7-10** Keputusan layout Hari ini untuk lima kartu batangan. — `FR-20` · S
  - Saat ini grid kartu batangan `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (`app/page.tsx`) = 4 kartu (Logam Mulia, UBS, Galeri24, Lotus Archi) + kartu Tabungan Emas yang lebar. Kartu ke-5 pada `lg` menjadi yatim di baris kedua.
  - Opsi (bandingkan di mockup dan di browser, lebar 375 / 768 / 1024 / 1280):
    1. **4 + (EMASKU + Tabungan)** — kartu EMASKU berbagi baris kedua dengan Tabungan Emas (Tabungan menyempit atau tetap lebar). Perubahan terkecil.
    2. **3 + 2** — `lg:grid-cols-6`, tiga kartu `col-span-2`, dua `col-span-3`. Urutan tetap, kartu tidak menyempit.
    3. **5 kolom di `xl`** — `xl:grid-cols-5`; risiko angka `Rp2.258.000` + selisih terlalu sempit.
    4. **Gulir horizontal di `md`** — tidak disukai (menyembunyikan kartu).
  - Hasil: satu opsi dipilih dan dicatat di `mockup/README.md` beserta alasannya; implementasi di P7-11. Prime **tidak** jadi kartu sendiri (lihat P7-11).
  - **Keputusan (21 Nov 2026): opsi 1 "4 + (EMASKU + Tabungan)".** Desktop (≥ `lg`): baris 1 = Antam, UBS, Galeri24, Lotus Archi; baris 2 = kartu EMASKU (1 kolom) + Tabungan Emas (3 kolom sisanya). Tablet 2 kolom, HP 1 kolom (Tabungan selebar baris). Alasan: perubahan terkecil, empat kartu baris 1 tidak menyempit, tidak ada kartu yatim atau tersembunyi; opsi 3 (5 kolom) memaksa angka `Rp2.258.000` + selisih ke ±230 px. Tabungan Emas yang menyempit (±705 px di 1024 px) tetap bertumpuk sampai `xl`; tiga kolom mulai di 1280 px. Diverifikasi di 375/768/1024/1280 px (tanpa gulir horizontal, kartu satu baris sama tinggi).
  - **Diubah 21 Nov 2026 setelah tinjauan pemilik:** Tabungan Emas yang lebar tampak timpang, jadi layout menjadi 6 kartu seragam (3×2 di desktop, 2×3 tablet, 1 kolom HP); lihat `plan/mockup/README.md`.
- [x] **P7-11** Hari ini (`lib/today.ts`, `components/price-card.tsx`). — `FR-20` · M
  - *Selesai 21 Nov 2026 (fixture sintetis; sumber belum aktif). Penyimpangan: kartu memakai catatan "harga sudah termasuk pajak" (Q-9 terjawab), bukan "Harga dasar situs"; Prime 25 g = baris `extra` di kaki kartu (hanya bila seri Prime berjalan).*
  - Kartu EMASKU dari `hrtagold-emasku` (Gold, `variant ''`), jual + buyback 1 g, label "Harga dasar situs" bila Q-9 belum jelas.
  - Prime: catatan di kartu ("Prime 25 g: …") atau baris tambahan, bukan kartu sendiri; tidak menggeser angka Gold.
  - Baris carry-over tidak berlaku (D-66); label "vs kemarin" mengikuti aturan yang ada (hanya bila `prev` tepat sehari sebelumnya).
  - Layout sesuai keputusan P7-10; cek mobile 375 px (tanpa gulir horizontal).
- [x] **P7-12** Spread, Bandingkan, Kalkulator. — `FR-21`, `FR-30`, `FR-37` · M
  - *Selesai 21 Nov 2026. Penyimpangan: id opsi Spread/Bandingkan `hr-emasku`; opsi `hrta-prime` **tidak** dibuat di Spread (keputusan pemilik: Prime hanya seri Explorer + catatan kartu + deskripsi Data). Semua opsi tersembunyi sampai file `hrtagold-emasku` ada. Kalkulator: buyback per keping, tanpa "Berat lain…".*
  - Spread (`lib/spread.ts`): opsi jual dan buyback `hrta-emasku` (Gold) dan `hrta-prime` (25/50/100 g); aturan pasangan D-56 (brand + produk sama) tetap; `POPULAR_PAIRS` "EMASKU: jual → buyback". Prime hanya berpasangan dengan Prime.
  - Bandingkan (`lib/bandingkan.ts`): seri `hrta-emasku` dengan warna token baru; histori mulai dari tanggal aktivasi, jadi rentang default tidak boleh menyiratkan data lama.
  - Kalkulator: EMASKU sebagai sumber dengan buyback **per keping** (bukan `hasPerGramBuyback`); gramasi besar (≥ 250 g) memakai buyback per keping yang sebenarnya.
- [x] **P7-13** Explorer, Data, dan e2e. — `FR-22`, `FR-23` · S
  - *Selesai 21 Nov 2026. e2e bersyarat data (lulus dengan dan tanpa data hrtagold); uji unit memakai fixture sintetis `lib/test-support/hrtagold.ts` (Gold 17 + Prime 3). Diverifikasi juga dengan CSV sintetis lewat `GOLD_DATA_DIR` (opsi baru `scripts/build-data.ts`, tanpa menyentuh `data/`).*
  - Explorer: brand EMASKU, varian Prime, gramasi 17 pilihan; Data: unduhan `data/prices/hrtagold/…` dan baris sumber.
  - `e2e/smoke.spec.ts`: kartu/opsi EMASKU ada, Prime tidak menimpa Gold, tidak ada gulir horizontal di 375 px. Periksa ukuran `public/data` setelah build.
  - `mockup/README.md` mencatat penyimpangan dari mockup.

### Gelombang F — dokumentasi

- [x] **P7-14** Keputusan dan dokumen spesifikasi. — S
  - *Selesai 21 Nov 2026: D-69 final di DECISIONS (draf research §7 diganti penunjuk); TECH-SPEC §5.9 + §7; DATA-MODEL §3.6; PRD §6/§13/§16 (v1.5); README repo (sumber, jadwal, contoh `series`) dan baris status/riwayat `plan/README.md` ikut diperbarui (sisa P7-15: penutupan setelah G7). Q-10 tetap terbuka sampai P7-08.*
  - DECISIONS: **D-69** (isi dari draf research/hartadinata.md §7 + hasil P7-01/P7-02/P7-08). Draf tetap di research sampai tugas ini (preseden D-64/D-65 di P6-13).
  - TECH-SPEC: **§5.9 Hartadinata (`hrtagold.ts`)** (endpoint, bentuk respons, pemetaan Gold/Prime, validasi, jadwal), §7 (V-03/V-04 menyebut `hrtagold`).
  - DATA-MODEL §3.6: `source` `hrtagold`, `brand` `emasku`, nilai `variant = 'prime'`.
  - PRD: §6 baris sumber `hrtagold.id`; §13 Q-8, Q-9, Q-10 dijawab; §16 revisi.
- [ ] **P7-15** README dan penutupan. — S
  - `plan/README.md`: status Fase 7 dan riwayat revisi; README repo (Operasional): sumber baru.
  - `fase-5-hardening.md`: backlog "Brand lain" sudah menandai Hartadinata pindah ke Fase 7.
  - Bila Q-8 menemukan histori: tambah tugas backfill (`hrtagold-history`) sebagai lanjutan setelah G7.

## Urutan kerja yang disarankan

Satu gelombang = satu commit (atau satu PR). Sebelum setiap commit: `pnpm lint`, `pnpm typecheck`, `pnpm test`; untuk web juga e2e smoke.

| # | Isi | Setelah | Catatan |
| --- | --- | --- | --- |
| 1 | P7-01 (probe + fixture + `schedule:` sementara) dan P7-02 (investigasi lokal) | — | Push untuk menjalankan probe dari runner. Observasi 5–7 hari berjalan di belakang |
| 2 | P7-03 + P7-04 (`enabled: false`) | 1 | Enum, label web, dan konfigurasi dalam satu commit supaya `typecheck` hijau |
| 3 | P7-05 + P7-06 (parser, katalog, validasi) | 1 (fixture, runner hijau), 2 | Katalog di commit yang sama dengan parser |
| 4 | P7-09 (data layer web) dan P7-10 (keputusan layout) | 2 | **Harus masuk sebelum langkah 5**, agar data Prime tidak merusak halaman |
| 5 | P7-07 (aktifkan) + D-69 awal | 1 hijau, 3, 4 | Mulai hitung 7 hari G7 |
| 6 | P7-11–P7-13 (UI) | 5 (data ≥ 2 hari), 4 | Pengembangan bisa mulai dengan fixture sejak langkah 3 |
| 7 | P7-08 (jadwal final) | 1 (observasi selesai) | Bisa sebelum atau sesudah langkah 6 |
| 8 | P7-14, P7-15 | 5–7 | |

## Kriteria selesai

- `hrtagold` menulis harga jual + buyback EMASKU Gold (17 gramasi) dan Prime (3 gramasi) setiap hari yang diharapkan, tanpa karantina `UNKNOWN_ITEM` terbuka.
- Halaman Hari ini, Spread, Bandingkan, Explorer, Kalkulator, dan Data menampilkan EMASKU dengan atribusi `hrtagold.id`; Prime tidak menggeser Gold.
- Jadwal dan kalender final tercatat (Q-10), PPh tercatat (Q-9), dan status histori tercatat (Q-8).
- D-69 tercatat; PRD/TECH-SPEC/DATA-MODEL sesuai implementasi.

## Gerbang keluar G7

- 7 hari berturut-turut run `hrtagold` hijau (atau `stale` hanya di hari yang tidak diharapkan), tanpa karantina yang belum diputuskan.
- Tidak ada perubahan perilaku sumber lama: run Galeri24, Pegadaian, Logam Mulia, UBS, dan Lotus Archi tetap hijau; seri Gold tidak tertukar dengan Prime di web.
- Layout Hari ini terverifikasi di 375 / 768 / 1280 px tanpa gulir horizontal; `pnpm lint`, `typecheck`, `test`, dan e2e smoke hijau.
- Probe `schedule:` sementara sudah dicabut.
