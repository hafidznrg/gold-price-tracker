# Riset sumber — Lotus Archi

| | |
| --- | --- |
| **Status** | Riset awal 17 Nov 2026. Scraper `lotusarchi@1.0.0` aktif sejak 17 Nov 2026 (P6-09, TECH-SPEC §5.8); jadwal final 21 Nov 2026: `afternoon`, `business_days_id` (D-68). Implementasi: [phases/fase-6-galeri24-lotus-archi.md](../phases/fase-6-galeri24-lotus-archi.md) (P6-07–P6-10) |
| **Brand** | `lotusarchi` (baru). Emas batangan swasta 24K, 0,1–100 g, dijual di gerai Galeri24/Pegadaian dan toko resmi lotusarchi.com |
| **Metode** | Browser biasa + fixture Pegadaian di repo. Runner GitHub (AS) **lolos** 17 Nov 2026 (P6-01) |

## 1. Tiga kanal, tiga harga

Harga Lotus Archi **berbeda per kanal**, jadi ketiganya disimpan sebagai seri terpisah (`source` beda), tidak saling menggantikan.

| Kanal | `source` | Kode / URL | Gramasi | Jual | Buyback | Histori |
| --- | --- | --- | --- | --- | --- | --- |
| Galeri24 | `galeri24` | `vendorCode 00005202001009` di `page-data` | 1, 5, 10, 25, 50, 100 | ya | ya, per keping | Mulai saat P6-06 aktif (atau ±Feb 2024 bila Q-7 disetujui) |
| Pegadaian | `pegadaian` | `idVendor 00005202001009` di `/gold/prices/table` | ±6 (cek fixture) | ya | tidak (`hargaBeli: null`) | Ada di `data/raw/pegadaian/` sejak 24 Okt 2026 → P6-08 |
| Resmi | `lotusarchi` | `https://lotusarchi.com/pricing/` | 0,1, 0,2, 0,5, 1, 2, 5, 10, 25, 50, 100 | ya, per keping | per gram saja | Tidak ada; mulai saat P6-09 aktif |

Perbandingan 1 g, 16 Nov 2026:

| Kanal | Jual | Buyback |
| --- | --- | --- |
| Galeri24 | 2.471.000 | 2.286.000 |
| lotusarchi.com | 2.591.000 | 2.258.000 per gram (harga dasar 2.406.000/g) |

Di fixture Pegadaian (24 Okt 2026): 1 g 2.538.000, 10 g 24.580.000, 25 g 61.245.000.

## 2. Galeri24 dan Pegadaian

Formatnya sama dengan brand lain di kedua sumber, jadi tambahannya kecil (lihat research/galeri24.md §2 dan TECH-SPEC §5.2). Satu-satunya aturan baru: **Lotus Archi adalah brand opsional**.

- Tidak dihitung di V-04. Hilang dari respons = run tetap sukses.
- Tidak ikut cek "tanggal sama antar brand". Bila tanggalnya beda, barisnya dibuang dan dicatat di `note`, bukan menggagalkan run.

Alasannya: Lotus Archi tidak boleh mengganggu sumber yang sudah hijau berminggu-minggu.

## 3. lotusarchi.com

- WordPress 6.8 (tema Flatsome/UX Builder) di belakang **Cloudflare** (`server: cloudflare`, `cf-cache-status: DYNAMIC`). Tidak ada tantangan saat dibuka dari browser biasa. **Runner GitHub (AS, colo MSP) lolos** pada probe 17 Nov 2026 08.58 WIB: HTTP 200, tanpa tantangan, 10 baris gramasi, tanggal 16 Nov 2026 (P6-01).
- `/pricing/` (±175 KB HTML) memuat tabel emas statis `QTY (GR) | HARGA JUAL` di blok **tersembunyi** (`class="text hidden"`) yang **basi**: 17 Nov 2026 1 gr = 2.591.000, padahal harga sebenarnya 2.397.000. Tabel yang terlihat di browser diisi JavaScript dari endpoint JSON. Baris bertanggal di HTML (`16 NOVEMBER 2026 || Gold Price /gram …`, plus satu baris lama di dalam komentar HTML) juga tidak dipakai. **Jangan parse HTML.**
- Dua endpoint JSON (project User-Agent, tanpa Origin/Referer, dicek 17 Nov 2026 ±20.00 WIB; fixture di `apps/scraper/test/fixtures/lotusarchi/`):
  - `GET https://api.lotusarchi.com/harga-display` → `{data:[{id, produk, type: gold|silver, harga}]}`, 20 baris, **tanpa tanggal**. Emas: `0,1 gr`, `0,2 gr`, `0,5 gr`, `0,5 gr WB`, `1 gr`, `2 gr`, `5 gr`, `10 gr`, `25 gr`, `50 gr`, `100 gr`, `Paper Gold …`; perak `Silver 50–1000 gr`. `harga` = harga jual per keping (koma desimal di nama produk).
  - `GET https://lotusarchi.com/wp-json/la/v1/harga-gold` → `{data:[{harga_id, harga_emas, buyback_emas, tanggal}]}`: harga dasar dan buyback per gram, terbaru dulu, 518 baris sejak 2025-02-27; 29 tanggal muncul dua kali (revisi → ambil `harga_id` terbesar per tanggal).
  - Tanggal data = tanggal terbaru di `harga-gold`; `harga-display` "1 gr" harus sama dengan `harga_emas` tanggal itu (aturan sinkronisasi di TECH-SPEC §5.8).
  - **Histori sejak Feb 2025** di `harga-gold` memungkinkan backfill buyback per gram dan harga dasar nanti (harga keping per gramasi tidak ada di histori); belum dikerjakan.
- Beranda menampilkan "HARGA PER GRAM 16 NOV 2026", "BUYBACK PER GRAM 16 NOV 2026", dan nilai sebelumnya. Tidak dipakai; sumber = dua endpoint JSON di atas.
- `/buyback/` hanya memuat buyback **perak**.
- Waktu terbit belum diketahui: saat dicek 17 Nov 2026, halaman masih bertanggal 16 Nov. Observasi di P6-01.
- `robots.txt`: `User-agent: *` → `Allow: /`, dengan `Content-Signal: search=yes, ai-train=no, use=reference`. Sejumlah bot AI/crawler (mis. GPTBot, ClaudeBot, CCBot) diblokir per nama.
  - Scraper proyek memakai User-Agent proyek, mengambil dua respons JSON per hari untuk arsip harga non-komersial (bukan pelatihan AI). Ini sesuai dengan aturan `*`.
  - Catat pertimbangan ini di D-65.

### Batasan data

- Buyback hanya **per gram** → disimpan di baris 1 g saja (pola Logam Mulia, D-26). Jangan dikalikan untuk gramasi lain, karena buyback per keping bisa berbeda.
- Tidak ada jam terbit → `source_updated_at = null`.
- "Gold Price /gram" adalah harga dasar, bukan harga keping 1 g → hanya disimpan di raw.

### Histori `harga-gold` (backfill `lotusarchi-history`)

- Respons penuh `GET https://lotusarchi.com/wp-json/la/v1/harga-gold` (17 Nov 2026, satu request): 518 baris `{harga_id, harga_emas, buyback_emas, tanggal}` dari 2025-02-27 sampai 2026-11-17, terbaru dulu; 29 tanggal ganda (revisi) → `harga_id` terbesar menang, sisa 489 tanggal.
- **Asumsi:** `harga_emas` = harga jual keping **1 g**. Bukti: pada 17 Nov 2026 "1 gr" di `api.lotusarchi.com/harga-display` = 2.397.000 = `harga_emas`, dan grafik situs memberi label `harga_emas` "Harga Jual". `buyback_emas` = buyback per gram (baris 1 g saja, D-26).
- Hasil: satu baris per tanggal (`lotusarchi` × `lotusarchi` × `gold_bar` × 1 g, `source_updated_at` kosong, `origin = backfill`). Baris dengan harga ≤ 0 atau buyback ≥ jual dibuang dan dicatat di `note` (0 baris pada unduhan ini). Katalog: 1 g `active_from: 2025-02-27`; gramasi lain `active_from: 2026-11-17`.

## 4. Risiko

| Risiko | Mitigasi |
| --- | --- |
| Cloudflare menantang IP runner GitHub | Probe P6-01. Bila ditantang, P6-09 tertahan; tidak memakai stealth (D-24). Galeri24 + Pegadaian tetap memberi seri Lotus Archi |
| Tema WordPress diubah (tabel/baris bertanggal hilang) | Gagal keras `PARSE_ERROR`; fixture kontrak |
| Lotus Archi berhenti dijual di Galeri24/Pegadaian | Brand opsional: run tetap hijau, celah terlihat di halaman Kualitas data |
| Tiga harga per kanal membingungkan pengguna | Web selalu menampilkan pasangan "brand · sumber" (pola yang sudah ada) |

## 5. Draf keputusan (D-65)

> **D-65 — Brand Lotus Archi dari tiga kanal**
> **Konteks:** Lotus Archi ada di tabel Galeri24 (jual + buyback) dan Pegadaian (jual) dengan kode vendor yang sama, serta di toko resminya lotusarchi.com (harga keping + buyback per gram). Harga berbeda per kanal.
> **Keputusan:** brand baru `lotusarchi`. (1) `galeri24` dan `pegadaian` mengambil kode `00005202001009` sebagai **brand opsional** (tidak ikut V-04 dan cek tanggal antar brand) — mengubah kalimat D-30 "vendor tambahan tidak diambil" khusus Lotus Archi. (2) Histori Pegadaian sejak 24 Okt 2026 dipulihkan dari `data/raw/pegadaian/`. (3) Sumber `lotusarchi` (lotusarchi.com/pricing) [aktif / tertahan karena …].
> **Konsekuensi:** hingga tiga seri Lotus Archi; spread Lotus Archi tersedia dari Galeri24. Buyback lotusarchi.com hanya 1 g.
