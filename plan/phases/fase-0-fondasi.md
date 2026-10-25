# Fase 0 — Fondasi & validasi sumber

| | |
| --- | --- |
| **Tujuan** | Menyiapkan kerangka repo dan membuktikan bahwa setiap sumber data bisa diambil dari runner GitHub Actions sebelum menulis pipeline |
| **Bergantung pada** | — |
| **Perkiraan usaha** | 2–3 hari |
| **Gerbang keluar** | **G0** |

## Ruang lingkup

**Masuk:** repo publik, monorepo, paket skema, CI, kerangka CLI, struktur folder data, riset teknis semua sumber, fixture, workflow `probe`.

**Tidak masuk:** penulisan data ke `data/`, jadwal cron, web.

## Tugas

### Kerangka repo

- [ ] **P0-01** Repo publik `gold-price-tracker` (sudah dibuat). Ruleset `main`: blokir force-push dan penghapusan, **tanpa** wajib PR agar bot bisa push data dengan `GITHUB_TOKEN` (WORKFLOWS §6.1). Lisensi MIT untuk kode; README menyatakan data milik masing-masing penerbit. — `D-09`, `D-17` · S
- [x] **P0-02** Monorepo pnpm: `packages/schema`, `apps/scraper`, `apps/web` (placeholder). TypeScript strict, ESLint + Prettier, `.nvmrc` Node 22, field `packageManager` di `package.json` (dibaca `pnpm/action-setup`). — `NFR-10` · S
- [x] **P0-03** `packages/schema` sesuai DATA-MODEL §3–4: skema `zod` `PriceRow`, `MacroRow`, `RunRecord`, `QuarantineBatch`; semua enum (§3.6); `parseRupiah('Rp1.403.300') → 1403300`, `parseWeight('0,5 Gram') → 0.5`, `canonicalWeight()`, `rowKey()`; util tanggal `Asia/Jakarta`; penulis/pembaca CSV sesuai §4.1; `SCHEMA_VERSION`. Sertakan uji unit. — `NFR-10`, `NFR-11` · M
- [x] **P0-04** Aksi komposit `.github/actions/setup` dan workflow `ci.yml` (WORKFLOWS §3.1, §3.8): lint, typecheck, test pada PR dan push kode ke `main` (abaikan `data/**`). — `NFR-10` · S
- [x] **P0-05** Kerangka CLI `apps/scraper/src/cli.ts` dengan subperintah `plan`, `scrape`, `merge`, `probe` (stub), opsi `--root` untuk path absolut, dan antarmuka `SourceScraper`. — · S
- [x] **P0-06** Buat `config/sources.yml`, `config/catalog.yml` (gramasi valid per sumber × brand × produk), `config/holidays.yml` (2026–2027), `config/events.yml`, serta struktur `data/` (DATA-MODEL §1) dan `.gitattributes` (`*.csv text eol=lf`). — `FR-12`, `D-13` · S

### Riset dan fixture per sumber

- [x] **P0-07** **UBS Lifestyle:** simpan ≥ 2 fixture HTML. Petakan struktur tabel per tahun produksi dan blok "Updated". Cek tab Network apakah grafik histori 7H–3T memuat endpoint JSON (jawab **Q-2**). — `FR-01`, `FR-08` · S
- [x] **P0-08** **Pegadaian:** di DevTools → Network, temukan request yang mengembalikan harga. Catat URL, method, header wajib, dan bentuk respons. Simpan fixture. Catat apakah buyback per brand tersedia (bahan **Q-1**). — `FR-02` · M
- [ ] **P0-09** **Logam Mulia:** prototipe lokal Playwright + `playwright-extra` + stealth sesuai TECH-SPEC §5.3. Simpan fixture respons jual dan buyback (potong ke ±200 titik terakhir agar kecil). — `FR-03` · M
  - *25 Okt 2026:* prototipe selesai (`scripts/prototype-logammulia.ts`), tetapi situs 503 maintenance ("mempersiapkan aplikasi versi terbaru"); fixture jual/buyback **tertunda** sampai situs kembali. Lihat TECH-SPEC §5.3.
- [x] **P0-10** **Makro:** verifikasi `xaus.com/api/v1/history` dan `/spot`, Frankfurter (`EUR/IDR`, `EUR/USD`), struktur XLS Pink Sheet World Bank (baris/kolom emas), dan cara mengambil histori JISDOR. Simpan fixture masing-masing. — `FR-05`–`FR-07` · M
- [x] **P0-11** Workflow `probe.yml` (WORKFLOWS §3.6; `workflow_dispatch`, input `source`) yang menjalankan `probe` untuk setiap sumber **dari runner GitHub** tanpa menulis data. Jalankan dan catat hasilnya; ini menjawab **Q-4** (perlu *self-hosted runner* atau tidak). — `NFR-04` · S
- [x] **P0-12** Dokumentasikan temuan riset di TECH-SPEC §5 (endpoint final Pegadaian, cara JISDOR, kolom XLS) dan catat keputusan baru di DECISIONS.md. — · S
  - *25 Okt 2026:* TECH-SPEC §5.1–5.6 dan §7 (V-06, V-10), PRD §6, DATA-MODEL §3.1/§4.3, tugas P1-03/P1-07/P2-04/P2-06/P2-09 diselaraskan dengan temuan; keputusan D-18–D-21. Bagian Logam Mulia (§5.3) diperbarui bersama P0-09.

## Kriteria selesai

- CI hijau di `main`; uji skema dan util lulus.
- Setiap sumber (UBS, Pegadaian, Logam Mulia, xaus, Frankfurter, World Bank, JISDOR) punya ≥ 1 fixture di `apps/scraper/test/fixtures/`.
- Hasil `probe.yml` dari runner GitHub tercatat untuk setiap sumber.
- Q-2 dan Q-4 terjawab; Q-1 punya temuan awal.

## Status (25 Okt 2026)

**Tugas:** 10 dari 12 selesai.

| Tugas | Status | Yang tersisa |
| --- | --- | --- |
| P0-01 | ⏳ | Dicek lewat API GitHub: repo publik ✅, **belum ada ruleset** untuk `main`, **belum ada LICENSE**. Ruleset diatur pemilik repo di *Settings → Rules* (blokir force-push + penghapusan, tanpa wajib PR, D-17); LICENSE MIT bisa ditambahkan lewat PR |
| P0-09 | ⏳ tertahan | Logam Mulia 503 maintenance sejak 25 Okt 2026. Prototipe siap; ambil fixture jual/buyback dan jalankan `probe.yml source=logammulia` setelah situs kembali |

**Kriteria selesai:**

| Kriteria | Status |
| --- | --- |
| CI hijau di `main`; uji skema dan util lulus | ✅ |
| Setiap sumber punya ≥ 1 fixture | ✅ untuk 6 sumber · ⚠️ Logam Mulia hanya fixture halaman maintenance, belum respons data |
| Hasil `probe.yml` dari runner GitHub tercatat untuk setiap sumber | ✅ (Logam Mulia tercatat sebagai 503 maintenance) |
| Q-2 dan Q-4 terjawab; Q-1 punya temuan awal | ✅ Q-2 (P0-07) · ✅ Q-4 (P0-11, kecuali Logam Mulia) · ✅ Q-1 temuan awal (P0-08) |

**G0:** terpenuhi untuk UBS Lifestyle, Pegadaian, xaus, JISDOR, World Bank, dan Frankfurter (opsi 1: fetch terbukti dari runner GitHub). **Belum** untuk Logam Mulia: kegagalannya bukan dari runner, sehingga opsi 2 (self-hosted runner atau terima kosong sesuai D-06) belum relevan sampai situs kembali dan bisa diuji.

**Dampak ke fase berikutnya:** Fase 1 dapat dimulai karena urutan kerjanya (P1-01 validate → P1-02 merge → P1-03 UBS → P1-04 workflow) tidak bergantung pada Logam Mulia; hanya **P1-06** yang menunggu P0-09. Fase 2 tidak terpengaruh. Bila Logam Mulia masih tutup ketika P1-06 tiba, catat di DECISIONS.md apakah menunggu atau menerima seri kosong (D-06).

## Gerbang keluar G0

Setiap sumber memenuhi salah satu:

1. Fetch terbukti berhasil dari runner GitHub, **atau**
2. Gagal dari runner GitHub, tetapi terdokumentasi dengan rencana: *self-hosted runner* Indonesia, atau (khusus Logam Mulia) diterima kosong sesuai D-06.

### Hasil probe dari runner GitHub (P0-11)

Run [`probe` #40160955522](https://github.com/hafidznrg/gold-price-tracker/actions/runs/40160955522), 25 Okt 2026 11.11 WIB (Minggu), `source = all`. Runner `ubuntu-latest` di AS (Cloudflare `loc=US`, colo DFW/IAD/LAX/MSP/SJC). Artifact `probe-{source}` berisi raw + `report.json`.

| Sumber | Hasil | HTTP | `data_date` | Catatan | G0 |
| --- | --- | --- | --- | --- | --- |
| UBS Lifestyle | ✅ | 200 · 200 | 2026-10-24 | Halaman 188 KB + grafik; titik terakhir = buyback 1 g | ✅ |
| Pegadaian | ✅ | 200 | 2026-10-24 | `/gold/prices/table` tanpa token, tidak diblokir dari AS | ✅ |
| Logam Mulia | ❌ | 503 | — | Halaman "Maintenance" (Akamai), sama seperti dari jaringan Indonesia — **bukan** blokir runner | ⏳ menunggu situs kembali (P0-09) |
| xaus | ✅ | 200 · 200 | 2026-10-23 | Penutupan Jumat (diambil Minggu) | ✅ |
| JISDOR | ✅ | 200 · 200 | 2026-10-23 | `GET` 10 hari + postback ekspor XLSX 30 hari dari runner berhasil | ✅ |
| World Bank | ✅ | 200 · 200 | 2026-09-01 | Tautan XLSX ditemukan dari halaman; kolom Gold ada | ✅ |
| Frankfurter | ✅ | 200 | 2026-10-23 | `v2/rates.csv` | ✅ |

**Q-4:** *self-hosted runner* Indonesia **tidak diperlukan** untuk enam sumber di atas. Untuk Logam Mulia belum bisa dinilai; jalankan ulang `probe.yml` dengan `source = logammulia` setelah situs kembali (1–2 kali, sesuai catatan risiko di bawah).

## Risiko dan catatan

- Endpoint Pegadaian bisa memerlukan header khusus atau token. Bila terlalu rapuh, tetapkan Playwright membaca DOM sebagai jalur utama.
- Jangan commit fixture berukuran besar; potong respons histori panjang.
- Jalankan `probe` Logam Mulia secukupnya (1–2 kali) agar tidak memicu pemblokiran sebelum pipeline jalan.
