# Fase 6 — Galeri24 (buyback) dan Lotus Archi

| | |
| --- | --- |
| **Tujuan** | Menutup Q-1 (buyback Antam/UBS/Galeri24) lewat sumber baru `galeri24`, termasuk histori sejak ±Feb 2024 dan buyback Antam non-Pegadaian, serta menambah brand **Lotus Archi** dari tiga kanal: Galeri24 (jual + buyback), Pegadaian (jual), dan lotusarchi.com (kanal resmi) |
| **Bergantung pada** | G1 (pipeline ritel stabil). Bisa jalan paralel dengan Fase 5; menggantikan P5-06 |
| **Perkiraan usaha** | 5–7 hari (termasuk backfill P6-11 dan varian P6-12) |
| **Gerbang keluar** | **G6** |
| **Keputusan pemilik (17 Nov 2026)** | Q-7 **disetujui**: histori Galeri24 boleh diambil dari `GET /api/gold-prices` (P6-11). P6-12 (Antam non-Pegadaian) **masuk** fase ini |
| **Riset** | [research/galeri24.md](../research/galeri24.md) · [research/lotusarchi.md](../research/lotusarchi.md) |

## Ruang lingkup

**Masuk:**

- Modul scraper `galeri24` (harga jual + buyback Antam, UBS, Galeri24, Lotus Archi, dan buyback Antam non-Pegadaian).
- Histori Galeri24 dari `/api/gold-prices` (backfill sekali jalan, P6-11).
- Brand baru `lotusarchi` di skema, katalog, dan web.
- Lotus Archi dari tabel Pegadaian (harga jual saja), termasuk histori dari arsip raw Pegadaian sejak 24 Okt 2026.
- Modul scraper `lotusarchi` (lotusarchi.com), **bersyarat**: hanya bila probe dari runner GitHub lolos tanpa tantangan Cloudflare.
- Web: kartu Hari ini, pasangan Spread, Bandingkan, Explorer, Data untuk sumber/brand/varian baru.

**Tidak masuk:**

- Produk koleksi (UBS Disney/Hello Kitty, Batik Series, Baby Series, Dinar, Lotus Archi Gift, Paper Gold, edisi Warner Bros), ANTAM MULIA RETRO, SENTRA BUYBACK, ANTAM BATIK.
- Histori Lotus Archi lotusarchi.com (situs tidak menyediakannya).

## Prinsip

- Pola yang sudah ada dipakai ulang: kontrak `SourceScraper` (TECH-SPEC §3), kontrak `PriceBackfillJob` (`backfill/types.ts`), brand dari kode vendor (D-20), raw apa adanya + gzip (FR-11), gagal keras pada perubahan struktur.
- `vendorCode` Galeri24 = `idVendor` Pegadaian. Satu tabel kode dipakai kedua modul:

  | Kode | Brand | `variant` | Wajib (V-04) | Dipakai di |
  | --- | --- | --- | --- | --- |
  | `00005201808001` | `antam` | `''` | ya | galeri24, pegadaian |
  | `00005201808002` | `ubs` | `''` | ya | galeri24, pegadaian |
  | `00005202003010` | `galeri24` | `''` | ya | galeri24, pegadaian |
  | `00005202001009` | `lotusarchi` | `''` | **tidak** | galeri24, pegadaian |
  | `00005201905007` | `antam` | `non_pegadaian` | **tidak** | galeri24 saja |

- **Aturan baris opsional** (Lotus Archi dan Antam non-Pegadaian). Baris opsional tidak boleh menggagalkan run sumber yang sudah hijau:
  - tidak dihitung di V-04;
  - tidak ikut cek "tanggal sama antar brand"; bila tanggalnya beda dari brand wajib, baris dibuang dan dicatat di `note`;
  - pelanggaran V-03 (buyback ≥ jual) pada baris opsional → baris dibuang + `note`, **bukan** `VALIDATION_FAILED` untuk seluruh run;
  - V-02, V-05, V-12 tetap berlaku per baris (karantina).
- Tidak menembus proteksi bot (D-24). Pengecualian stealth hanya untuk Logam Mulia (D-26). Bila lotusarchi.com menantang runner, P6-09 dihentikan dan dicatat, bukan diakali.
- Satu request per run per sumber (NFR-12); fallback `__NUXT_DATA__` hanya dipanggil saat jalur utama gagal. User-Agent proyek. Backfill: jeda ≥ 5 detik antar halaman.
- **Katalog masuk di commit yang sama dengan parser** yang menghasilkan barisnya. Tanpa itu, run pertama langsung mengarantina semua baris baru sebagai `UNKNOWN_ITEM` (V-02).

## Tugas

### Gelombang A — validasi akses (wajib sebelum kode produksi)

- [ ] **P6-01** Probe `galeri24` dan `lotusarchi` dari runner GitHub. — `G0`-style · S
  - Tambah target di `apps/scraper/src/probe/targets.ts` + `checks.ts` (`checkGaleri24`, `checkLotusArchi`), jalankan lewat `probe.yml`.
  - `galeri24`: `GET https://galeri24.co.id/api/gold-prices/page-data?take=1000&date={hari ini WIB}` → 200 JSON, `results` berisi keempat kode brand (Lotus Archi opsional) dengan `status = "1"`, ≥ 5 gramasi berharga per brand wajib, `date` sama untuk brand wajib. Cek juga `GET /harga-emas` memuat `<script id="__NUXT_DATA__">` (jalur fallback).
  - `galeri24`, satu request tambahan: `date` = kemarin. Catat apakah server memakai parameter itu (hasil bertanggal kemarin) atau mengabaikannya (hasil = hari ini). Hasilnya menentukan perilaku run terlambat (lihat P6-04).
  - `galeri24`, dari fixture: catat `sellingPrice` dan gramasi ANTAM NON PEGADAIAN (`00005201905007`). Bila `sellingPrice = "0"`, baris dipakai sebagai buyback saja (P6-04).
  - `lotusarchi`: `GET https://lotusarchi.com/pricing/` → 200 HTML tanpa halaman tantangan Cloudflare, memuat tabel `QTY (GR) | HARGA JUAL` dan baris `<tanggal> || Gold Price /gram : Rp … || Buyback Price : Rp …`.
  - Simpan fixture: `apps/scraper/test/fixtures/galeri24/` (`page-data-<tanggal>.json`, `harga-emas-<tanggal>.html`, satu fixture sintetis kasus tepi) dan `apps/scraper/test/fixtures/lotusarchi/` (`pricing-<tanggal>.html`), masing-masing dengan `README.md` seperti fixture Pegadaian. Fixture pertama boleh diambil dari terminal lokal; probe runner tetap menentukan lolos/tidaknya akses.
  - **Observasi jam terbit 3–5 hari:** `probe.yml` saat ini hanya `workflow_dispatch`. Tambah `schedule:` **sementara** (mis. 00.00, 04.00, 08.00, 12.00, 16.00 UTC = 07.00, 11.00, 15.00, 19.00, 23.00 WIB) yang hanya mem-probe `galeri24,lotusarchi`, lalu cabut setelah observasi. Yang dikonfirmasi: Galeri24 (harga tanggal D dibuat ±17.50 WIB hari D−1, revisi pagi D mis. Antam 10.14 WIB) dan lotusarchi.com (belum diketahui; 17 Nov masih menampilkan 16 Nov saat dicek).
  - **Hasil P6-01 dicatat di TECH-SPEC §5.7/§5.8 dan research/*.md sebelum lanjut.** Bila lotusarchi.com diblokir dari runner → P6-09 ditandai "tertahan", fase tetap bisa selesai tanpanya.
- [ ] **P6-01b** Investigasi `GET /api/gold-prices` untuk P6-11 (dari terminal lokal, bukan runner). — S
  - Maksimal ±15 request, jeda ≥ 5 detik. Simpan contoh respons (dipangkas) di `apps/scraper/test/fixtures/galeri24/history-*.json` + README.
  - Jawab pertanyaan di research/galeri24.md §5:
    - nama parameter halaman dan filter (`page`/`skip`/`next`, filter tanggal/vendor bila ada);
    - batas `take` maksimum yang diterima;
    - tanggal tertua yang sebenarnya;
    - arti `status` (apakah revisi lama = 3, dan apakah setiap kunci tanggal × vendor × gramasi selalu punya tepat satu `status = 1`);
    - urutan antarhalaman: stabil atau tidak saat baris baru masuk (bandingkan dua pengambilan halaman yang sama);
    - gramasi historis per vendor target (untuk katalog P6-03).
  - Hasilnya dicatat di research/galeri24.md §5 dan menentukan desain job P6-11.

### Gelombang B — skema dan konfigurasi

- [ ] **P6-02** Skema `@gold/schema` (`packages/schema/src/enums.ts`) + penyesuaian tipe di web. — · S
  - `SCRAPER_IDS` + `PRICE_SOURCES`: tambah `galeri24` (dan `lotusarchi` di P6-09, bukan sekarang).
  - `BRANDS`: tambah `lotusarchi`.
  - `QUARANTINE_REASONS`: tambah `PRICE_FORMULA` (V-12).
  - **Web ikut berubah di commit yang sama**, karena `SOURCE_LABELS`, `SOURCE_DOMAINS`, `BRAND_LABELS`, `SCRAPER_LABELS` (`apps/web/lib/data/catalog.ts`) dan `SOURCE_DOMAIN`, `SOURCE_VERB` (`apps/web/lib/source-stamp.ts`) bertipe `Record<PriceSource | Brand | ScraperId, …>`. Tanpa entri baru, `pnpm typecheck` gagal. Isi label/domain minimal di sini; UI-nya di P6-10.
  - Uji `packages/schema/test/*` untuk enum baru; DATA-MODEL §3.6 diperbarui.
  - Nilai enum baru bukan perubahan kolom → `SCHEMA_VERSION` tetap (DATA-MODEL §8).
- [ ] **P6-03** Konfigurasi. — · S
  - `config/sources.yml`: entri `galeri24`. Usulan awal (sesuaikan dengan hasil P6-01):

    ```yaml
    - id: galeri24
      kind: prices
      url: https://galeri24.co.id/api/gold-prices/page-data
      fetch_method: api
      workflow: scrape-retail
      update_calendar: daily # harga Minggu ada (15 & 16 Nov 2026); final setelah observasi (Q-6)
      schedule_window: afternoon # revisi pagi sudah final; harga D+1 dibuat ±17.50 WIB tetapi halaman tetap D sampai tengah malam
      stale_is_error_on_expected_day: true
      accept_previous_day: true # run terlambat lewat tengah malam tidak jadi alarm palsu (D-42)
      parser_version: 1.0.0
      enabled: false # true setelah P6-04 + P6-05 lolos dan P6-01 hijau dari runner
      notes: JSON server route Nuxt tanpa token; brand dari vendorCode (= idVendor Pegadaian, D-20). Fallback __NUXT_DATA__ dari /harga-emas.
    ```

  - `config/catalog.yml`:
    - grup `galeri24 × antam` [0.5, 1, 2, 3, 5, 10, 25, 50, 100], `galeri24 × ubs` [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500], `galeri24 × galeri24` [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000], `galeri24 × lotusarchi` [1, 5, 10, 25, 50, 100]. Cocokkan dengan fixture P6-01.
    - `active_from` = tanggal tertua dari P6-01b (perkiraan `'2024-02-01'`). Gramasi yang hanya ada di masa lalu → grup terpisah dengan `active_to`, agar backfill P6-11 lolos V-02.
    - Kunci katalog **tidak memuat `variant`** (`catalogItemKey` = source × brand × product × weight_g). Baris Antam non-Pegadaian ikut tervalidasi oleh grup `galeri24 × antam`. Gramasi non-Pegadaian di luar grup itu → tambah ke grup.

### Gelombang C — scraper Galeri24

- [ ] **P6-04** `apps/scraper/src/sources/galeri24.ts` (`galeri24@1.0.0`), daftarkan di `sources/index.ts`. — `FR-02` (perluasan), `FR-10` · M
  - `fetchRaw`: `GET /api/gold-prices/page-data?take=1000&date={ctx.date ?? hari ini WIB}`, `Accept: application/json`. Bila respons bukan JSON valid atau status ≥ 400: jeda `pauseMs`, lalu `GET /harga-emas` dan ambil isi `<script id="__NUXT_DATA__">`. Raw = `{ via: 'page-data' | 'nuxt', body }` (JSON), agar parser tahu bentuknya. Fallback dicatat di `note`.
  - `parse` (murni):
    - `page-data` → `results`; `nuxt` → `devalue.parse(body).data.goldPrice` (tambah dependensi `devalue` ke `apps/scraper`; payload memakai format devalue Nuxt 3, root = `[["Reactive",1], { data, state, … }, …]`).
    - Semua angka datang sebagai **string** → `Number()` + cek integer aman; `denomination` lewat `canonicalWeight`.
    - Ambil baris dengan `vendorCode` di tabel kode, `status === "1"`. Kode lain diabaikan tanpa karantina.
    - Brand wajib dan Lotus Archi: `sellingPrice > 0` wajib, selain itu baris dilewati (gramasi tidak dijual).
    - Antam non-Pegadaian: `variant = 'non_pegadaian'`. `sellingPrice = 0` → `sell_price = null` (baris buyback saja; V-01 tetap lolos karena buyback terisi). Kedua harga 0 → dilewati.
    - Tanggal: semua baris brand **wajib** harus ber-`date` sama, selain itu `VALIDATION_FAILED` (pola Pegadaian). Baris opsional dengan tanggal lain dibuang dan dicatat di `note`.
    - Duplikat kunci (tanggal × vendor × gramasi) dengan status 1 → ambil `updatedAt` terbesar, catat di `note`.
    - Baris: `source = galeri24`, `brand` dan `variant` dari tabel kode, `product = gold_bar`, `location = ''`, `sell_price = sellingPrice`, `buyback_price = buybackPrice` (`0` → `null`), `source_updated_at = jakartaIso(updatedAt)`.
    - `dataDate` = tanggal brand wajib; `sourceUpdatedAt` = `updatedAt` terbesar di antara brand wajib.
    - V-12 dihitung di sini (butuh `price`/`margin` yang tidak masuk CSV), lihat P6-05.
  - Fungsi pemetaan satu entri (`GoldPrice` → `ParsedRow`) diekspor agar dipakai ulang oleh job P6-11.
  - Uji `apps/scraper/test/galeri24.test.ts` dengan fixture P6-01:
    - jumlah baris per brand (16 Nov 2026: Antam 9, UBS 10, Galeri24 11, Lotus Archi 6, Antam non-Pegadaian 9) dan nilai 1 g;
    - buyback 0 → `null`; status 3 diabaikan;
    - tanggal campur di brand wajib → `VALIDATION_FAILED`; baris opsional tanggal lain → dibuang + note;
    - jalur `nuxt` = jalur `page-data` untuk snapshot yang sama;
    - respons rusak → `PARSE_ERROR`.
- [ ] **P6-05** Validasi untuk `galeri24` di `apps/scraper/src/pipeline/validate.ts`. — `FR-10` · S
  - V-04: `MIN_ROWS.galeri24 = 5` per brand wajib (`GALERI24_BRANDS = ['antam', 'ubs', 'galeri24']`), hanya `variant = ''`. Lotus Archi dan non-Pegadaian tidak dihitung.
  - **V-12 (baru, tingkat baris → karantina `PRICE_FORMULA`)**: `sellingPrice === ceil(price × (1 + margin/100) / 1000) × 1000`. Rumus ini cocok untuk 1 g dan 100 g Antam, UBS, Galeri24, Lotus Archi pada 16 Nov 2026; tujuannya menangkap salah baca kolom.
    - Mekanisme: field opsional baru `ParseResult.suspect?: { key: string; reason: QuarantineReason; detail: string }[]` (`sources/types.ts`). `key` = `priceRowKey`. Parser mengisinya, `validate()` memindahkan baris itu ke karantina `PRICE_FORMULA`. Tidak ada kolom CSV baru, dan parser tetap murni.
    - Tidak berlaku untuk baris `sell_price = null` (non-Pegadaian buyback saja).
    - Bila fixture P6-01/P6-01b menunjukkan baris sah yang menyimpang, turunkan jadi peringatan di `note` (bukan karantina) dan catat di D-64.
  - V-03: tingkat run untuk brand wajib; untuk baris opsional → buang + note (lihat Prinsip). Baris `sell_price = null` dilewati.
  - V-05, V-06 berlaku seperti sumber ritel lain. `seriesKey` sudah memuat `variant`, jadi lompatan harga non-Pegadaian dibandingkan dengan serinya sendiri.
  - Tambahkan V-12 ke TECH-SPEC §7 dan perbarui baris V-03/V-04 (aturan baris opsional).
- [ ] **P6-06** Aktifkan `galeri24`. — `FR-09` · S
  - `enabled: true`, satu run manual `scrape-retail` dengan `sources=galeri24`, cek commit data + `status.json`. Watchdog membaca `config.sources`, jadi `galeri24` otomatis ikut dicek.
  - TECH-SPEC §5.7 "Galeri24 (`galeri24.ts`)" (isi dari research/galeri24.md + hasil P6-01), PRD §6 tabel sumber, WORKFLOWS bila jendela berbeda dari usulan.
  - Cabut `schedule:` sementara di `probe.yml` (P6-01) bila observasi sudah selesai.
  - Pantau 7 hari (G6).

### Gelombang D — Lotus Archi di Pegadaian

- [ ] **P6-07** Lotus Archi di modul Pegadaian (`pegadaian@1.2.0`, harga jual saja). — · S
  - `VENDOR_BRAND` + `00005202001009 → lotusarchi`; `PEGADAIAN_BRANDS` (V-04) **tetap** tiga brand. Non-Pegadaian **tidak** diambil dari Pegadaian.
  - Cek "tglBerlaku sama" (`dates.size > 1` di `parse`) dibatasi ke brand wajib; Lotus Archi dengan tanggal lain dibuang + note.
  - `catalog.yml`: `pegadaian × lotusarchi` (gramasi dari fixture, perkiraan [1, 5, 10, 25, 50, 100]), `active_from: '2026-10-01'` agar P6-08 lolos V-02. **Commit yang sama** dengan parser.
  - `config/sources.yml`: `parser_version` Pegadaian → `1.2.0`.
  - `probe/checks.ts` `PEGADAIAN_VENDORS` tidak diubah (Lotus Archi opsional).
  - Uji: fixture Pegadaian yang ada sudah memuat Lotus Archi (24 dan 25 Okt 2026). Ekspektasi jumlah baris di `pegadaian.test.ts` ikut naik; tambah kasus Lotus tanggal beda → dibuang, run tetap sukses.
  - Ini mengubah D-30 ("vendor tambahan … tidak diambil") → catat di D-65.
- [ ] **P6-08** Histori Lotus Archi dari arsip raw Pegadaian. — `FR-14` (sebagian) · S
  - Job backfill `pegadaian-raw-brand` (`apps/scraper/src/backfill/`, `localOnly: true`, `--input data/raw/pegadaian`): baca semua snapshot `*.gz` (sejak Okt 2026, raw lama "tabel saja" dan raw `{ table, savings }`), parse dengan `pegadaian@1.2.0`, tulis **hanya** baris `brand = lotusarchi`, `origin = backfill`. `select` membuang tanggal yang sudah ada dari run harian (pola D-28, `backfill/select.ts`).
  - Bila beberapa snapshot bertanggal sama, ambil yang `idHarga` (= `source_updated_at`) terbesar.
  - Daftarkan di `BACKFILL_JOB_IDS` + `BACKFILL_TASKS` (`P6-08`); job lokal tidak muncul di `backfill.yml`.
  - Jalankan sekali dari terminal **setelah** P6-07 aktif, verifikasi jumlah baris ≈ jumlah tanggal unik × 6.
  - Alternatif: tunggu P5-01 `reparse`. Pilih job kecil ini bila P5-01 belum dikerjakan.

### Gelombang E — histori Galeri24 (Q-7 disetujui)

- [ ] **P6-11** Backfill histori Galeri24 dari `GET /api/gold-prices`. — `FR-08`-style · M
  - Desain final mengikuti hasil P6-01b. Kerangka:
  - **Dua langkah, pola `logammulia-archive` (job lokal):**
    1. Skrip unduh (`apps/scraper/src/backfill/galeri24-download.ts` atau perintah CLI) dijalankan sekali dari terminal: menelusuri semua halaman, jeda ≥ 5 detik, berhenti di tanggal tertua. Hanya baris dengan lima kode vendor di tabel Prinsip yang disimpan, apa adanya per baris, ke folder lokal (satu file per halaman). Total raw diperkirakan ±70 MB tanpa filter → filter wajib agar arsip raw di repo tetap kecil.
    2. Job `galeri24-history` (`localOnly: true`, `--input <folder>`): gabungkan, lalu pakai fungsi pemetaan dari P6-04.
  - Per kunci tanggal × vendor × gramasi: ambil `status = 1` dengan `updatedAt` terbesar; bila tidak ada `status = 1`, ambil entri terbaru dan catat jumlahnya di `note` (keputusan final dari arti `status` di P6-01b).
  - Urutan halaman tidak stabil → dedup berdasarkan `id`; hentikan bila `count` berubah lebih dari jumlah baris satu hari selama penelusuran, lalu ulangi.
  - `origin = backfill`; `select` membuang tanggal yang sudah di-scrape (D-28). Jalankan **setelah** P6-06 aktif agar tumpang tindihnya jelas.
  - V-02 lewat `validateBackfill`: gramasi historis di luar katalog masuk karantina `UNKNOWN_ITEM`. Perbaiki katalog dulu (P6-03), bukan menyetujui massal.
  - Uji `apps/scraper/test/galeri24-history.test.ts` dengan fixture P6-01b: dedup revisi, status 3 diabaikan, vendor lain diabaikan, `select` membuang tanggal yang sudah ada.
  - Verifikasi setelah jalan: jumlah tanggal per brand, celah > 3 hari dilaporkan, nilai 1 g di beberapa tanggal dicocokkan manual dengan `data/prices/pegadaian/` (harga jual sama?).
  - Catat di D-64 (Q-7 disetujui pemilik 17 Nov 2026) dan TECH-SPEC §5.7.

### Gelombang F — Lotus Archi resmi (bersyarat)

- [ ] **P6-09** *(bersyarat P6-01)* Scraper `lotusarchi` untuk lotusarchi.com (`lotusarchi@1.0.0`). — · M
  - Hanya bila probe dari runner lolos tanpa tantangan. Bila `403`/halaman tantangan muncul di run produksi → `BLOCKED`, tanpa retry agresif atau penyamaran.
  - Tambah `lotusarchi` ke `SCRAPER_IDS` + `PRICE_SOURCES`, beserta entri `Record` di web (sama dengan P6-02).
  - `fetchRaw`: `GET https://lotusarchi.com/pricing/` (HTML, `fetch_method: http`). Raw = potongan relevan (tabel + baris bertanggal), seperti raw UBS (D-22), bukan halaman 175 KB penuh.
  - `parse`:
    - Tabel `QTY (GR) | HARGA JUAL`: hanya baris yang cocok `^\d+(\.\d+)? gr$` (0,1–100 g). Baris `(WB)` dan `Paper Gold …` diabaikan.
    - Baris bertanggal: `(\d{1,2} <BULAN> \d{4}) || Gold Price /gram : Rp X || Buyback Price : Rp Y` → `dataDate`; bulan dalam bahasa Inggris/Indonesia huruf besar (cek di fixture).
    - Baris: `source = lotusarchi`, `brand = lotusarchi`, `product = gold_bar`, `sell_price` = harga per keping, `buyback_price` **hanya untuk 1 g** = buyback per gram (pola Logam Mulia D-26). Jangan mengalikan per gram untuk gramasi lain.
    - "Gold Price /gram" (harga dasar per gram) hanya di raw.
    - Tidak ada jam terbit di halaman → `source_updated_at = null`.
  - Tabel perak (`Kilobar Perak …`) diabaikan.
  - V-04: ≥ 8 gramasi; V-06 dari baris bertanggal. `schedule_window` dan `update_calendar` dari observasi P6-01.
  - `catalog.yml`: `lotusarchi × lotusarchi` [0.1, 0.2, 0.5, 1, 2, 5, 10, 25, 50, 100].
  - Web: sumber dengan buyback per gram → `hasPerGramBuyback` seperti Logam Mulia (D-39/D-60/D-61).
  - Uji dengan fixture P6-01 (+ satu fixture sintetis tanpa baris bertanggal → `PARSE_ERROR`).
  - TECH-SPEC §5.8, PRD §6.

### Gelombang G — web

- [ ] **P6-10** Sumber `galeri24` (+ `lotusarchi` bila P6-09 jadi), brand `lotusarchi`, dan varian Antam non-Pegadaian di `apps/web`. — `FR-20`–`FR-23`, `FR-30` · M
  - `lib/data/catalog.ts`:
    - `PRICE_SOURCE_IDS`, `SOURCE_LABELS` (`Galeri24`, `Lotus Archi`), `SOURCE_DOMAINS` (`galeri24.co.id`, `lotusarchi.com`), `SCRAPER_LABELS` (sudah diisi minimal di P6-02);
    - `BRAND_IDS`, `BRAND_LABELS` (`lotusarchi: 'Lotus Archi'`);
    - `colorToken` + token baru `lotus` (`ColorToken` di `lib/data/types.ts`, `COLOR_CLASSES`, variabel `--lotus` terang/gelap di `app/globals.css`; cek kontras seperti D-62);
    - `FILE_ORDER`: `galeri24-galeri24` sebelum `pegadaian-galeri24`, lalu `galeri24-lotusarchi`.
  - `lib/explorer.ts` `BRANDS`; `app/data/page.tsx` `BRAND_NAME`; `lib/source-stamp.ts` (atribusi sumber baru).
  - **Varian `non_pegadaian` — wajib sebelum data P6-12 tayang:**
    - `matchAcrossSources` (`packages/schema/src/derive.ts`): saat sumber punya beberapa varian dan tidak ada varian tahun, default ke `variant = ''` (`key.variant ?? newestYearVariant(list) ?? ''`). Tanpa ini, Antam Galeri24 **hilang** dari Spread/Hari ini begitu baris non-Pegadaian ada (`find(r => r.variant === null)` tidak pernah cocok). Tambah uji di `packages/schema/test`.
    - Cek `lib/explorer.ts`, `lib/bandingkan.ts`, `lib/spread.ts`, `lib/build/latest.ts`, dan `lib/today.ts`: varian `non_pegadaian` tidak boleh tergabung ke seri Antam Galeri24 biasa ("variant awal menang"). Ia hanya muncul sebagai opsi buyback tersendiri.
  - **Hari ini** (`lib/today.ts`):
    - Kartu Galeri24 memakai `galeri24-galeri24`, karena ada buyback. `pegadaian-galeri24` disembunyikan seperti kartu Pegadaian lain; harganya tetap disebut di catatan kartu ("Di Pegadaian: …").
    - Kartu baru Lotus Archi dari `galeri24-lotusarchi`.
    - `galeri24-antam`/`galeri24-ubs` tidak jadi kartu; muncul di Spread/Bandingkan.
    - Catatan "Harga buyback-nya belum tersedia" dihapus.
  - **Spread** (`lib/spread.ts`):
    - Opsi jual dan buyback baru: `g24-antam`, `g24-ubs`, `g24-g24`, `g24-lotus`, `pg-lotus` (jual saja), `g24-antam-np` (buyback saja: "Galeri24 — Antam dibeli di luar Pegadaian"), dan `la-lotus` (P6-09).
    - Aturan pasangan D-56 (brand + produk sama) tetap.
    - `POPULAR_PAIRS` + "Galeri24: Galeri24 → Galeri24", "Antam: Pegadaian → Galeri24", dan "Antam: Logam Mulia → Galeri24" (buyback `g24-antam-np`).
    - Catatan popover: buyback Antam biasa di Galeri24 berlaku untuk keping yang dibeli lewat Pegadaian/Galeri24; keping dari luar memakai buyback non-Pegadaian yang lebih rendah.
  - **Bandingkan** (`lib/bandingkan.ts`): series `g24-lotus` (dan `la-lotus`); Galeri24 memakai sumber `galeri24`.
  - Histori P6-11 membuat seri `galeri24-*` mulai ±Feb 2024: cek rentang default grafik dan ukuran file `public/data` setelah build.
  - Uji unit (`*.test.ts` di `lib/`) dan e2e `e2e/smoke.spec.ts` untuk kartu/opsi baru; `mockup/README.md` mencatat penyimpangan dari mockup.

### Gelombang H — dokumentasi

- [ ] **P6-12** *(masuk fase ini)* Antam non-Pegadaian — tidak ada tugas kode tersendiri; tercakup di P6-03 (katalog), P6-04 (parser), P6-05 (V-03/V-12), P6-10 (web, `matchAcrossSources`), dan P6-11 (histori ikut kode `00005201905007`). Centang bila kelimanya selesai.
- [ ] **P6-13** Keputusan dan dokumen. — · S
  - DECISIONS:
    - **D-64** sumber `galeri24` (isi dari draf research/galeri24.md §7 + hasil P6-01): termasuk Q-7 disetujui pemilik 17 Nov 2026 (backfill `/api/gold-prices`), aturan baris opsional, V-12, dan varian `antam/non_pegadaian`.
    - **D-65** brand Lotus Archi (tiga kanal; mengubah D-30 untuk Pegadaian; lotusarchi.com jadi/tertahan).
  - PRD:
    - §4: hapus Lotus Archi dari "di luar ruang lingkup";
    - §6: sumber baru;
    - §13: Q-1 **terjawab** (Galeri24), Q-7 **terjawab** (disetujui).
  - DATA-MODEL: §3.6 enum, nilai `variant = 'non_pegadaian'`, alasan karantina `PRICE_FORMULA`.
  - fase-5: P5-06 dicentang dengan rujukan ke fase ini; backlog "Brand lain" disisakan King Halim dkk.
  - README status + riwayat revisi; README repo (Operasional) untuk sumber baru dan cara menjalankan P6-11.

## Urutan kerja yang disarankan

Satu gelombang = satu commit (atau satu PR). Sebelum setiap commit: `pnpm lint`, `pnpm typecheck`, `pnpm test`; untuk web juga e2e smoke.

| # | Isi | Setelah | Catatan |
| --- | --- | --- | --- |
| 1 | P6-01 (probe + fixture + `schedule:` sementara) dan P6-01b (investigasi histori, lokal) | — | Push untuk menjalankan probe dari runner. Observasi 3–5 hari berjalan di belakang |
| 2 | P6-02 + P6-03 (`enabled: false`) + P6-04 + P6-05 (termasuk varian non-Pegadaian) | 1 (fixture) | Paling besar. Tidak dipecah paralel: enum, katalog, dan `validate.ts` dipakai bersama |
| 3 | P6-07 + P6-08 | 2 (enum `lotusarchi`) | Bisa dikerjakan selama observasi probe |
| 4 | P6-10 bagian `matchAcrossSources` + varian | 2 | **Harus masuk sebelum langkah 5**, agar data non-Pegadaian tidak menghilangkan Antam Galeri24 di web |
| 5 | P6-06 (aktifkan) + D-64/D-65 awal + TECH-SPEC §5.7 | 1 hijau dari runner, 2, 4 | Mulai hitung 7 hari G6 |
| 6 | P6-11 (unduh + job histori) | 1 (P6-01b), 5 | Commit data terpisah dari commit kode |
| 7 | P6-10 sisa (UI) | 5 (data ≥ 2 hari) | Pengembangan bisa mulai sejak langkah 2 dengan fixture |
| 8 | P6-09 bila probe lolos; P6-13 sisa | — | |

## Kriteria selesai

- `galeri24` menulis harga jual + buyback Antam, UBS, Galeri24 setiap hari yang diharapkan; Lotus Archi dan buyback Antam non-Pegadaian ikut bila ada.
- Histori Galeri24 (empat brand + non-Pegadaian) terisi sejak tanggal tertua yang tersedia, tanpa karantina `UNKNOWN_ITEM` terbuka.
- Lotus Archi punya seri dari Galeri24 (jual + buyback) dan Pegadaian (jual, dengan histori dari arsip raw); lotusarchi.com aktif **atau** tercatat tertahan beserta alasannya.
- Halaman Hari ini, Spread, Bandingkan, Explorer, Data menampilkan sumber, brand, dan varian baru dengan atribusi yang benar; Antam Galeri24 biasa tidak tertukar dengan non-Pegadaian.
- Q-1 dan Q-7 tertutup; D-64 dan D-65 tercatat.

## Gerbang keluar G6

- 7 hari berturut-turut run `galeri24` hijau (atau `stale` hanya di hari yang tidak diharapkan), tanpa karantina V-12 yang belum diputuskan.
- Tidak ada perubahan perilaku sumber lama: run Pegadaian tetap hijau setelah `pegadaian@1.2.0`.
- Backfill P6-11 selesai dan diverifikasi (celah > 3 hari tercatat).
