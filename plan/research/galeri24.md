# Riset sumber — Galeri24 (`galeri24.co.id/harga-emas`)

| | |
| --- | --- |
| **Status** | Riset awal 16 Nov 2026. Implementasi: [phases/fase-6-galeri24-lotus-archi.md](../phases/fase-6-galeri24-lotus-archi.md) |
| **Menjawab** | Q-1 / P5-06: sumber buyback Antam, UBS, dan Galeri24. Q-7 disetujui 17 Nov 2026 |
| **Metode** | Browser biasa (payload Nuxt, log jaringan, `fetch` same-origin). Akses dari runner GitHub **belum diuji** (P6-01) |

## 1. Ringkasan

- Halaman dirender server oleh **Nuxt 3**. Harga sudah ada di HTML sebagai payload `<script id="__NUXT_DATA__">` (key `data.goldPrice`). Saat halaman dimuat tidak ada XHR harga.
- Payload yang sama tersedia sebagai JSON dari server route same-origin **`GET /api/gold-prices/page-data`** (proksi ke `ecorp-backend.galeri24.co.id`). Tanpa token dan tanpa cookie (`credentials: 'omit'` → 200).
- Setiap baris punya **harga jual dan buyback** → buyback Antam, UBS, Galeri24, dan Lotus Archi per gramasi tersedia setiap hari.
- `vendorCode` **identik** dengan `idVendor` Pegadaian (D-20). Kemungkinan besar backend-nya sama dengan pegadaian.co.id, jadi harga jual mungkin sama persis dengan sumber `pegadaian`.
- Ada endpoint histori **`GET /api/gold-prices`** (berhalaman; `count` 178.063 pada 16 Nov 2026; baris tertua yang terlihat 1 Feb 2024). Lihat §5 — belum diverifikasi penuh; Q-7 disetujui pemilik 17 Nov 2026, verifikasi di P6-01b.
- Tidak ada proteksi bot yang terlihat (header `eo-cache-status` EdgeOne + `via: 1.1 google`, tanpa Cloudflare challenge).
- `robots.txt`: `Allow: *`; yang dilarang hanya `/account`, `/auth`, `/cart`, `/checkout`, `/payment`, `/protected`.

## 2. Bentuk data

`page-data?take=10000&date=YYYY-MM-DD` → `{ count, results: GoldPrice[] }`. Pada 16 Nov 2026: 111 baris dari 19 vendor. Kode klien (`_nuxt/index.*.js`, `goldPriceStore`) memanggil route ini dengan `take: 1e4` dan `date: new Date().toISOString().split("T")[0]` (tanggal **UTC**).

| Field | Contoh | Catatan |
| --- | --- | --- |
| `id` | UUID | Unik per entri harga |
| `vendorCode` | `"00005201808001"` | Kunci brand (pakai ini, bukan nama — D-20) |
| `vendorName` | `"ANTAM"` | Hanya untuk log |
| `date` | `"2026-11-16"` | Tanggal harga berlaku |
| `denomination` | `"1"` | String; desimal titik (`"0.5"`, `"1.06"`) |
| `price` | `"2522000"` | Harga dasar |
| `margin` | `"1.5"` | Persen |
| `sellingPrice` | `"2560000"` | = `ceil(price × (1 + margin/100), 1.000)` — cocok untuk 1 g & 100 g Antam, UBS, Galeri24, Lotus Archi |
| `buybackPrice` | `"2286000"` | `"0"` = tidak ada buyback |
| `status` | `"1"` | `1` aktif; `3` nonaktif/tergantikan (ANTAM BATIK, SENTRA BUYBACK; revisi lama di histori) |
| `createdAt` / `updatedAt` | ISO UTC | Waktu entri dibuat |
| `description` | `null` | — |

Semua angka berupa **string**.

### Vendor (16 Nov 2026)

| Vendor | Kode | Gramasi | Relevansi |
| --- | --- | --- | --- |
| ANTAM | 00005201808001 | 0,5–100 (9) | **Target** |
| UBS | 00005201808002 | 0,5–500 (10) | **Target** |
| GALERI 24 | 00005202003010 | 0,5–1.000 (11) | **Target** |
| LOTUS ARCHI | 00005202001009 | 1, 5, 10, 25, 50, 100 (6) | **Target opsional** (brand baru `lotusarchi`) |
| ANTAM NON PEGADAIAN | 00005201905007 | 0,5–100 (9) | **Target opsional** (`antam`, `variant = non_pegadaian`): buyback Antam yang dibeli **di luar** Pegadaian (1 g: 2.178.000 vs 2.286.000) — P6-12 |
| ANTAM MULIA RETRO | 00005201808006 | 0,5–100 (9) | Kandidat `gold_bar_retro` (belum dijadwalkan) |
| SENTRA BUYBACK | 00005202507029 | 0,5–1.000 (12) | Jual = 0, status 3; arti belum jelas — abaikan |
| ANTAM BATIK | 00005201808007 | 0,5–20 (5) | Status 3, terakhir 23 Okt 2026 — abaikan |
| UBS DISNEY/ELSA/ANNA/MICKEY FULLBODY/HELLO KITTY, LOTUS ARCHI GIFT, DINAR G24, BABY GALERI 24, BABY SERIES TUMBUHAN/INVESTASI, BATIK SERIES | — | — | Abaikan (produk koleksi) |

Contoh 1 g, 16 Nov 2026 (jual / buyback):

| Brand | Jual | Buyback |
| --- | --- | --- |
| Galeri24 | 2.456.000 | 2.312.000 |
| Antam | 2.560.000 | 2.286.000 |
| UBS | 2.480.000 | 2.286.000 |
| Lotus Archi | 2.471.000 | 2.286.000 |

## 3. Waktu terbit

- Harga tanggal D umumnya dibuat **sore D−1**: baris ber-`date` 16 Nov punya `updatedAt` 15 Nov ±17.50–17.56 WIB.
- Revisi pada hari D bisa terjadi: ANTAM 16 Nov di-update **10.14 WIB** (pola periode II seperti Pegadaian).
- Pada 16 Nov pukul 18.10 WIB, baris ber-`date` 17 Nov sudah ada di endpoint histori, tetapi `page-data` dan halaman masih menampilkan 16 Nov. Artinya `page-data` memilih harga yang **berlaku hari ini**.
- Server **mengabaikan** parameter `date`: 17 Nov 2026 08.39 WIB, `date=2026-11-16` dan `date=2026-11-17` memberi respons identik byte demi byte (bertanggal 17 Nov). Run yang terlambat lewat tengah malam tidak bisa mengambil harga kemarin; `accept_previous_day` hanya mencegah alarm palsu (D-42).
- Jam pembuatan harga D bervariasi: harga 16 Nov dibuat 15 Nov ±17.51 WIB, harga 17 Nov dibuat 16 Nov ±21.37–21.42 WIB. Observasi probe P6-01 memastikan polanya.
- Halaman tidak menampilkan jam; jam tersedia dari `updatedAt`.

Usulan jendela: `afternoon` (Cloudflare 15.05 / 17.05 WIB). Pada jam itu revisi pagi sudah masuk dan halaman masih menampilkan tanggal D. Bandingkan dengan `day` (09.05) yang bisa mendahului revisi, dan dengan `evening`/`any` yang aman tetapi menambah run tanpa nilai tambah. Konfirmasi lewat observasi P6-01.

## 4. Strategi pengambilan harian

Dirinci sebagai tugas P6-04/P6-05. Intinya:

1. **Jalur utama:** satu `GET /api/gold-prices/page-data?take=1000&date={tanggal sasaran}`.
2. **Fallback:** `GET /harga-emas` → `__NUXT_DATA__` → `devalue.parse` → `data.goldPrice`. Tetap HTTP biasa, tanpa Playwright.
3. **Filter:** empat kode target, `status = "1"`, `sellingPrice > 0`. Brand wajib (antam, ubs, galeri24) harus bertanggal sama.
4. **Pemetaan:** `sell_price = sellingPrice`, `buyback_price = buybackPrice` (`0` → kosong), `source_updated_at = updatedAt` (WIB), `price`/`margin` hanya di raw.
5. **Validasi:** V-04 ≥ 5 gramasi per brand wajib; V-06 tanggal; V-12 baru (rumus margin); V-03 buyback < jual.

## 5. Histori `GET /api/gold-prices` (Q-7, disetujui)

- Bentuk respons: `{ count, next, previous, results }`, urut `date` menurun, default 20 baris/halaman, `take=5000` diterima. Dengan 178 ribu baris, seluruh histori ≈ 36 request.
- Nilainya besar: buyback Antam, UBS, Galeri24 per gramasi sejak ±Feb 2024.

**Hasil P6-01b (17 Nov 2026, 08.40 WIB, 3 request, jeda 5 detik):**

- **Paginasi:** `?take=N&page=P` (`next` = `…/gold-prices?take=N&page=P+1`, `null` di halaman terakhir). `take=10000` diterima (±3,4 MB, ±3 detik, ±50 hari data). `count` 178.157 → **18 halaman**.
- **Tanggal tertua:** `2024-02-01` (halaman 18, 8.157 baris, 4 Apr → 1 Feb 2024).
- **`status`:** revisi intraday **tidak** menurunkan entri lama ke status 3. Contoh: Antam 16 Nov 2026 punya dua entri `status = 1` per gramasi (`updatedAt` 15 Nov 17.51 WIB dan 16 Nov 10.14 WIB). Jadi aturan per kunci = **`status = 1` dengan `updatedAt` terbesar**. `status = 3` = gramasi nonaktif (mis. Antam 250/500/1.000 g pada 7 Nov 2026 hanya ada sebagai status 3). `status = 2` muncul 11 kali di 2024; perlakukan seperti 3 (abaikan).
- **Kunci tanpa `status = 1`:** 3 di halaman 1 dan 14 di halaman 18, semuanya gramasi besar yang nonaktif → diabaikan, bukan diambil "entri terbaru".
- **Gramasi historis** (perlu grup katalog dengan `active_to`): Antam 250/500/1.000 g, UBS 1.000 g, Antam non-Pegadaian 250/500/1.000 g, Lotus Archi 2,5 dan 4 g (2024).
- **Filter:** tidak diperlukan; seluruh histori cukup ditelusuri halaman demi halaman (18 request).
- **Stabilitas urutan:** urut `date` menurun; baris baru masuk di atas ±sekali sehari (±17.50 dan ±21.40 WIB, revisi pagi ±10.14 WIB), sehingga halaman bergeser. Mitigasi: jalankan di luar jam itu, dedup berdasarkan `id`, dan bandingkan `count` awal-akhir.
- Daily `page-data` hanya memuat satu entri per kunci (yang berlaku), jadi aturan dedup hanya penting untuk histori.

Pertimbangan: endpoint ini tidak ditautkan dari halaman harga, meski `robots.txt` tidak melarang `/api`. **Q-7 disetujui pemilik proyek (17 Nov 2026).** Pertanyaan di atas dijawab di P6-01b sebelum P6-11. Cara ambil: sekali jalan, jeda ≥ 5 detik, `origin = backfill`, tanggal yang sudah di-scrape dibuang (pola D-28/D-29).

## 6. Risiko

| Risiko | Mitigasi |
| --- | --- |
| Route `/api/gold-prices/page-data` berubah (Nuxt di-deploy ulang) | Fallback `__NUXT_DATA__`; fixture kontrak keduanya |
| Format devalue berubah | Fallback ke `page-data`; keduanya gagal = `PARSE_ERROR` |
| Parameter `date` diabaikan server | V-06 + `accept_previous_day` (D-42); run terlambat lewat tengah malam bisa kehilangan tanggal (D-27) |
| IP runner GitHub (AS) diblokir | Probe P6-01 sebelum aktif; fallback self-hosted runner |
| Harga jual sama dengan `pegadaian` | Diterima: `source` beda, seri terpisah. Web menampilkan satu kartu per brand |

## 7. Draf keputusan (D-64)

> **D-64 — Galeri24 sebagai sumber buyback Antam/UBS/Galeri24**
> **Konteks:** Q-1/P5-06. galeri24.co.id menampilkan jual + buyback per vendor dan gramasi lewat `GET /api/gold-prices/page-data` tanpa token; `vendorCode` sama dengan `idVendor` Pegadaian.
> **Keputusan:** sumber baru `galeri24` (`fetch_method: api`, fallback `__NUXT_DATA__`), jendela [hasil P6-01], brand dari `vendorCode`, `status = 1`, brand wajib antam/ubs/galeri24, Lotus Archi opsional, vendor lain diabaikan. Varian `antam/non_pegadaian` dari kode 00005201905007 (opsional). Backfill dari `/api/gold-prices` disetujui pemilik 17 Nov 2026 (Q-7).
> **Konsekuensi:** buyback harian tersedia untuk ketiga brand; Q-1 terjawab. Harga jual Antam/UBS/Galeri24 tercatat dua kali (pegadaian + galeri24) sebagai seri terpisah.
