# Riset sumber — Lotus Archi

| | |
| --- | --- |
| **Status** | Riset awal 17 Nov 2026. Implementasi: [phases/fase-6-galeri24-lotus-archi.md](../phases/fase-6-galeri24-lotus-archi.md) (P6-07–P6-10) |
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
- `/pricing/` (±175 KB HTML, server-rendered):
  - Tabel `QTY (GR) | HARGA JUAL`: 0.1 gr 341.000 · 0.2 gr 630.000 · 0.5 gr 1.346.000 · 0.5 gr (WB) · 1 gr 2.591.000 · 2 gr 5.097.000 · 5 gr 12.592.000 · 10 gr 25.130.000 · 25 gr 62.625.000 · 50 gr 125.221.000 · 100 gr 250.265.000 · Paper Gold 0.1/0.2/0.5/1 gr · Paper Gold 1 gr FIFA.
  - Baris bertanggal: `16 NOVEMBER 2026 || Gold Price /gram : Rp 2.406.000 || Buyback Price : Rp 2.258.000` (format persis dicek dari fixture P6-01).
  - Tabel perak (kilobar, minted bar) — abaikan.
- Beranda menampilkan "HARGA PER GRAM 16 NOV 2026", "BUYBACK PER GRAM 16 NOV 2026", dan nilai sebelumnya. Cukup pakai `/pricing/` saja (satu request).
- `/buyback/` hanya memuat buyback **perak**.
- Waktu terbit belum diketahui: saat dicek 17 Nov 2026, halaman masih bertanggal 16 Nov. Observasi di P6-01.
- `robots.txt`: `User-agent: *` → `Allow: /`, dengan `Content-Signal: search=yes, ai-train=no, use=reference`. Sejumlah bot AI/crawler (mis. GPTBot, ClaudeBot, CCBot) diblokir per nama.
  - Scraper proyek memakai User-Agent proyek, mengambil satu halaman per hari untuk arsip harga non-komersial (bukan pelatihan AI). Ini sesuai dengan aturan `*`.
  - Catat pertimbangan ini di D-65.

### Batasan data

- Buyback hanya **per gram** → disimpan di baris 1 g saja (pola Logam Mulia, D-26). Jangan dikalikan untuk gramasi lain, karena buyback per keping bisa berbeda.
- Tidak ada jam terbit → `source_updated_at = null`.
- "Gold Price /gram" adalah harga dasar, bukan harga keping 1 g → hanya disimpan di raw.

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
