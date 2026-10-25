# Fase 5 — Hardening dan portofolio

| | |
| --- | --- |
| **Tujuan** | Membuat pipeline tahan lama dan dapat direproduksi, lalu mengemas proyek sebagai portofolio data engineering |
| **Bergantung pada** | G4 |
| **Perkiraan usaha** | 3–5 hari |
| **Gerbang keluar** | **G5** |

## Ruang lingkup

**Masuk:** reparse dari arsip mentah, halaman kualitas data, monitor kesegaran, kontrol ukuran repo, keamanan dependensi, dokumentasi, studi kasus.

**Tidak masuk:** fitur pengguna baru.

## Tugas

### Keandalan dan reproducibility

- [ ] **P5-01** Perintah `reparse --source X --from DATE`: bangun ulang baris CSV dari `data/raw/` dengan parser terbaru. Uji reproducibility: reparse seluruh arsip = CSV yang ada (kecuali baris `backfill`). — `FR-14`, `NFR-06` · M
- [ ] **P5-02** Monitor kesegaran: perintah `freshness` + workflow `freshness.yml` (WORKFLOWS §3.7) dengan Issue `stale-source` dan `pipeline-silent`. — `FR-17`, `NFR-02` · S
- [ ] **P5-03** Kontrol ukuran repo: laporan ukuran `data/` di CI; bila mendekati batas NFR-07, arsipkan `data/raw/` tahunan ke GitHub Release. — `NFR-07` · S
- [ ] **P5-04** Keamanan: Dependabot, *secret scanning*, pin action pihak ketiga ke SHA, izin workflow minimum. — · S

### Kualitas data

- [ ] **P5-05** Halaman **Kualitas data** (`/kualitas`) dari `quality.json`: heatmap kelengkapan per sumber per bulan (definisi DATA-MODEL §7), riwayat run, karantina terbuka, revisi terbaru, daftar insiden. — `FR-36` · M
- [ ] **P5-06** Tindak lanjut **Q-1** (buyback Antam/Galeri24 di Pegadaian): putuskan sumber dan catat di DECISIONS.md; bila ada sumber baru, buat sebagai modul scraper baru. — `D-07` · S

### Dokumentasi dan portofolio

- [ ] **P5-07** README repo final: diagram arsitektur, cara kerja pipeline, kamus data, aturan validasi, cara menjalankan lokal, badge status workflow dan umur data. — `NFR-05` · M
- [ ] **P5-08** Finalisasi DECISIONS.md dan perbarui PRD/TECH-SPEC agar sesuai implementasi nyata. — · S
- [ ] **P5-09** Studi kasus portofolio (halaman `/tentang` atau tulisan blog): masalah, arsitektur, keputusan penting dan alasannya, metrik kualitas data (kelengkapan %, insiden terdeteksi otomatis, waktu pemulihan), pelajaran, tangkapan layar. — `G-5` · M

## Kriteria selesai

- Reparse terbukti mereproduksi data.
- Halaman Kualitas data tayang dengan angka nyata.
- Dokumentasi memungkinkan orang lain menjalankan proyek dari nol dalam < 30 menit.

## Gerbang keluar G5

- Semua FR P0 dan P1 terpenuhi; FR P2 yang tidak dikerjakan tercatat sebagai backlog.
- Pipeline berjalan ≥ 30 hari dengan kelengkapan UBS Lifestyle dan Pegadaian ≥ 95% hari kerja.
- Studi kasus dan README siap dibagikan ke rekruter atau reviewer.

## Backlog setelah v1

- Brand lain (Lotus Archi, King Halim, dll.) sebagai modul scraper baru.
- Harga intraday bila sumber berubah lebih dari sekali sehari.
- Alert harga (mis. spread di bawah ambang).
- Migrasi CSV → DuckDB saat build bila query makin berat.
