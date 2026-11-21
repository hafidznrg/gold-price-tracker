# Riset sumber — Hartadinata / EMASKU (`hrtagold.id`)

| | |
| --- | --- |
| **Status** | Riset awal 21 Nov 2026. Belum diimplementasikan. Rencana: [phases/fase-7-hartadinata.md](../phases/fase-7-hartadinata.md) (P7-01–P7-15) |
| **Brand** | `emasku` (baru, usulan). Emas batangan EMASKU 24K (999,9), 0,1–1.000 g, produsen PT Hartadinata Abadi Tbk (IDX: HRTA). Perhiasan Ardore di luar ruang lingkup |
| **Sumber** | `hrtagold` (baru, usulan), scraper `hrtagold@1.0.0` |
| **Metode** | Browser biasa + satu `GET` dari terminal lokal dengan User-Agent proyek (200 `application/json`). Akses dari runner GitHub (AS) **belum diuji** → P7-01 |
| **Fixture sementara** | Respons penuh 21 Nov 2026 tersimpan di scratchpad lokal; disalin ke `apps/scraper/test/fixtures/hrtagold/` di P7-01 |

## 1. Ringkasan

- `emasku.co.id` mengalihkan ke **`hrtagold.id`**, situs resmi "HRTA Gold" milik PT Hartadinata Abadi Tbk. Merek emas batangan: **EMASKU**; merek perhiasan: Ardore (tidak diambil). Aplikasi "HRTA Gold" (App Store id6756904287). Aplikasi lama "EmasKITA" ada tetapi tidak dipakai.
- Halaman harga `https://hrtagold.id/id/gold-price` ("Harga Emas Hari Ini · Terakhir update Tanggal 21 November 2026 Jam 8.12 WIB"; kolom `Berat (gr) | Harga Dasar (Rp) | Harga Buyback (Rp)`; grup **GOLD** dan **PRIME**) dirender di sisi klien dari satu endpoint JSON tanpa token.
- Setiap gramasi punya **harga jual dan buyback per keping** → buyback tersedia untuk semua gramasi (berbeda dari Logam Mulia dan lotusarchi.com yang hanya per gram).
- Tidak ada proteksi bot yang terlihat (header: HSTS, `X-Frame-Options: DENY`, `nosniff`; tanpa Cloudflare).
- **Kanal tunggal.** EMASKU tidak ada di daftar vendor Galeri24 maupun Pegadaian (dicek di fixture kedua sumber).
- Histori: halaman hanya menampilkan hari ini; belum ditemukan endpoint histori (Q-8). Media (Bisnis.com, Kontan/MomsMoney) memuat harga HRTA harian tetapi tidak cocok sebagai sumber backfill → seri dimulai saat aktivasi.

## 2. Endpoint

| Endpoint | Dipakai | Isi |
| --- | --- | --- |
| `GET https://hrtagold.id/api/v1/brandings/price/daily` | **ya** | Tabel harga lengkap (Gold + Prime), tanggal terbit |
| `GET https://hrtagold.id/api/v1/brandings/price/one` | tidak | Ringkasan 1 g beranda ("Harga Emas Hari Ini … /gr (-Rp 25.000)") |

### Bentuk respons (`price/daily`, 21 Nov 2026, dipangkas)

```json
{
  "code": 200,
  "message": "success",
  "updated_date": "2026-11-21T08:12:26+07:00",
  "data": [
    {
      "series_id": 1,
      "series": "Gold",
      "is_origin": true,
      "created_at": "2026-11-21T08:12:26+07:00",
      "prices": [
        { "gramasi_id": 1, "gramasi": 0.1, "price": 287000, "buyback_price": 212200 },
        { "gramasi_id": 4, "gramasi": 1, "price": 2258000, "buyback_price": 2122000 },
        { "gramasi_id": 7, "gramasi": 10, "price": 22130000, "buyback_price": 21220000 },
        { "gramasi_id": 14, "gramasi": 1000, "price": 2186000000, "buyback_price": 2086500000 }
      ]
    },
    {
      "series_id": 4,
      "series": "Prime",
      "is_origin": true,
      "created_at": "2026-11-21T08:12:26+07:00",
      "prices": [
        { "gramasi_id": 8, "gramasi": 25, "price": 55575000, "buyback_price": 53050000 },
        { "gramasi_id": 9, "gramasi": 50, "price": 111150000, "buyback_price": 106100000 },
        { "gramasi_id": 10, "gramasi": 100, "price": 222300000, "buyback_price": 212200000 }
      ]
    }
  ]
}
```

- Angka sudah berupa **number** (bukan string), `gramasi` berupa number desimal (`0.1`, `0.25`, `0.5`).
- **Gold** (17 gramasi): 0,1, 0,25, 0,5, 1, 2, 5, 10, 25, 50, 100, 125, 150, 175, 200, 250, 500, 1000. Urutan di array tidak menurut gramasi (`gramasi_id` 16 sebelum 15 untuk 175/200 g) → jangan bergantung pada urutan.
- **Prime** (3 gramasi): 25, 50, 100 g. Harga jual sedikit di atas Gold (25 g: 55.575.000 vs 55.050.000, +0,95%); buyback **sama** dengan Gold untuk gramasi yang sama.
- Contoh 1 g, 21 Nov 2026: jual 2.258.000, buyback 2.122.000 (selisih 6,02%).
- `updated_date` = waktu terbit seluruh tabel (WIB, `+07:00`); `created_at` per seri sama dengan `updated_date` pada sampel ini.
- Pola harga (21 Nov 2026), penting agar parser **tidak menurunkan angka**:
  - jual per gram tidak konstan (0,1 g 2.870.000/g; 1 g 2.258.000/g; 10 g 2.213.000/g; 1.000 g 2.186.000/g);
  - buyback per gram 2.122.000 sampai 200 g, lalu 2.086.500 untuk 250/500/1.000 g. Jadi buyback hanya dibaca per keping dari respons, tidak pernah dihitung dari 1 g.

## 3. Akses dan robots

- Satu `GET` dari terminal lokal, User-Agent proyek, tanpa Origin/Referer/cookie → HTTP 200 `application/json`.
- Probe runner: menunggu run pertama (`probe.yml`, sumber `hrtagold`; schedule sementara 08.00–18.00 WIB tiap 2 jam).
- Runner GitHub (IP AS) **belum diuji**. P7-01 menjalankan probe sekali dari runner. Bila `403`/`429`/`503` atau halaman tantangan → `BLOCKED`, P7-05 tertahan; tidak ada penyamaran (D-24, kecuali pengecualian Logam Mulia D-26 yang tidak berlaku di sini).
- `https://hrtagold.id/robots.txt` mengembalikan HTML SPA (200 `text/html`) → tidak ada aturan robots yang sebenarnya. Scraper memakai User-Agent proyek, satu request per hari untuk arsip harga non-komersial; catat pertimbangan ini di D-69.
- Syarat penggunaan situs belum dibaca (FAQ/terms) → bagian P7-02.

## 4. Waktu terbit dan kalender (belum pasti)

- Sampel tunggal: 21 Nov 2026 (Sabtu) terbit **08.12 WIB**. Berarti ada harga di hari Sabtu.
- Belum diketahui: jam terbit di hari lain, revisi di hari yang sama, Minggu dan hari libur nasional, dan apakah `updated_date` bergeser setiap hari atau hanya saat harga berubah.
- Pendekatan seperti P6-01: jadwal probe **sementara** (`schedule:` di `probe.yml`) yang mem-probe `hrtagold` beberapa kali sehari selama 5–7 hari, mencatat `updated_date` dan `price` 1 g per probe. Hasilnya menutup Q-10 dan menentukan `schedule_window` serta `update_calendar` final.
- Usulan awal sebelum observasi: `schedule_window: day` (percobaan awal 08.20 WIB, retry 09.20 dan 11.20, D-67), `update_calendar: daily`, `stale_is_error_on_expected_day: false`, `accept_previous_day: true`. Alarm stale baru dihidupkan setelah kalender terbukti (pola `lotusarchi`, D-68).

## 5. Batasan data

- **Tanpa histori** (Q-8). Seri `emasku` mulai pada hari aktivasi; katalog `active_from` = tanggal aktivasi (bukan tanggal mundur).
- **Harga Dasar** di tabel situs = `price` di API = harga jual keping. Belum jelas apakah termasuk PPh 0,25% (pada Logam Mulia, D-24/D-26, harga dasar dan pajak dinyatakan terpisah). Dicek di FAQ/terms situs pada P7-02 (Q-9). Sementara disimpan apa adanya dan diberi catatan "harga dasar situs" di web.
- **Prime** = produk/varian terpisah: `variant = 'prime'`, bukan tahun produksi. Tidak digabung dengan Gold, tidak mengganti Gold di Hari ini/Spread. Aturan `isYearVariant` (hanya 4 digit, D-64) memastikan `prime` tidak dianggap varian tahun; `matchAcrossSources` jatuh ke `variant = ''` (sudah ada sejak Fase 6).
- Buyback per keping untuk semua gramasi → tidak ada aturan "per gram saja" (`hasPerGramBuyback` tidak berlaku).
- Tidak ada `source_updated_at` per baris; seluruh tabel memakai `updated_date`. Karena `data_date` = tanggal `updated_date`, baris **tidak pernah carry-over** (D-66).

## 6. Risiko

| Risiko | Mitigasi |
| --- | --- |
| API internal berubah atau menambah token/Origin | Gagal keras `PARSE_ERROR`; fixture kontrak; probe dengan pemeriksaan bentuk. Tidak membongkar autentikasi (D-24) |
| IP runner GitHub diblokir | Probe P7-01 sebelum kode produksi. Bila diblokir, P7-05–P7-07 tertahan dan dicatat; fase tidak dipaksa |
| Tanpa histori | Seri dimulai saat aktivasi; hanya bila Q-8 menemukan endpoint resmi (dari terminal lokal, owner approval seperti Q-7), buat job backfill terpisah |
| Ambiguitas PPh pada Harga Dasar | Q-9; label di web "harga dasar situs"; tidak mengurangi/menambah pajak sendiri |
| Jam terbit/kalender belum diketahui | Alarm stale mati sampai observasi selesai (Q-10); jendela `day` dengan retry D-67 |
| Prime membingungkan atau menimpa Gold | Variant terpisah; uji `matchAcrossSources` dan Explorer |
| Layout Hari ini: lima kartu batangan | Keputusan di P7-10 (lihat fase-7) |
| Perubahan nama merek (EMASKU/HRTA Gold) | `source = hrtagold`, `brand = emasku`, label web mudah diubah |

## 7. Draf keputusan (D-69)

> **D-69 — Sumber `hrtagold` dan brand EMASKU (Hartadinata)**
> **Konteks:** PT Hartadinata Abadi Tbk menerbitkan harga emas batangan EMASKU (0,1–1.000 g; grup Gold dan Prime) di hrtagold.id lewat satu endpoint JSON publik tanpa token, dengan jual dan buyback per keping untuk semua gramasi. EMASKU tidak ada di Galeri24 maupun Pegadaian. Tidak ada histori.
> **Keputusan:** (1) sumber baru `hrtagold`, brand baru `emasku` — nama merek yang dikenal konsumen, sejajar dengan `antam`/`ubs` (bukan nama perusahaan `hartadinata`, yang juga menaungi merek lain seperti Ardore); label panjang "EMASKU (Hartadinata)", label pendek "EMASKU". (2) Prime = `variant = 'prime'`, seri terpisah, tidak pernah digabung (aturan non-tahun D-64). Gold = `variant ''`. (3) Satu `GET` `price/daily` per run (NFR-12). `source_updated_at` = `updated_date`; `data_date` = tanggal WIB dari `updated_date`. (4) Seri dimulai saat aktivasi; backfill hanya bila Q-8 menemukan endpoint resmi. (5) Jadwal/kalender final setelah observasi probe (Q-10); sebelum itu alarm stale mati. (6) Akses dari runner [lolos / tertahan karena …].
> **Konsekuensi:** kartu batangan ke-5 di Hari ini, satu pasangan jual–buyback baru di Spread/Bandingkan, dua seri (Gold, Prime) di Explorer. Buyback langsung per keping, tanpa penurunan per gram.
