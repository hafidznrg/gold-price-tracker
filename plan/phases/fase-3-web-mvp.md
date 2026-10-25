# Fase 3 — Web MVP dan rilis publik

| | |
| --- | --- |
| **Tujuan** | Menayangkan situs statis dengan halaman inti (Hari ini, Explorer, Spread, Data) di Vercel |
| **Bergantung pada** | G1 untuk rilis; pengembangan bisa dimulai lebih awal memakai fixture dan data yang sudah terkumpul |
| **Perkiraan usaha** | 5–7 hari |
| **Gerbang keluar** | **G3 — rilis publik** |

## Ruang lingkup

**Masuk:** proyek Next.js, `build-data`, komponen grafik, empat halaman P0, URL state, atribusi dan disclaimer, deploy Vercel, smoke test.

**Tidak masuk:** mode nilai, agregasi, Bandingkan, Kalkulator, grafik kelipatan, premi (Fase 4).

## Tugas

### Fondasi web

- [ ] **P3-01** Next.js (App Router, SSG/static export) di `apps/web`, Tailwind + shadcn/ui, tema terang/gelap, layout responsif mulai 360 px, navigasi antar halaman. — `NFR-09` · M
- [ ] **P3-02** `scripts/build-data.ts`: dari CSV menghasilkan `latest.json`, `series/{source}-{brand}.json` (dengan kolom `variant`), `meta.json`, dan salinan CSV (TECH-SPEC §8). Dijalankan di `prebuild`. Uji unit untuk format output. — `FR-23`, `NFR-08` · M
- [ ] **P3-03** Lapisan akses data bertipe (dari `packages/schema`): katalog series, loader JSON, format rupiah `id-ID`, label sumber. — · S
- [ ] **P3-04** Komponen `<TimeSeriesChart>` berbasis ECharts: multi-series, `dataZoom`, tooltip Rp, celah untuk hari tanpa data, responsif, warna konsisten per brand. — `FR-21` · M

### Halaman P0

- [ ] **P3-05** **Hari ini** (`/`): kartu per brand (jual, buyback, spread, perubahan vs kemarin untuk 1 g) + tabel semua gramasi dengan sparkline 30 hari; umur data per sumber. — `FR-20` · M
- [ ] **P3-06** **Explorer** (`/explorer`): pemilih series (brand × sumber × gramasi × jenis harga), kontrol rentang 7H–Semua + kustom, semua state di URL via `nuqs`. — `FR-21`, `FR-24`, `FR-25` · L
- [ ] **P3-07** **Spread** (`/spread`): area band jual–buyback, line spread %, bar spread % per gramasi hari ini. — `FR-22` · M
- [ ] **P3-08** **Data** (`/data`): unduh CSV/JSON, kamus kolom, tabel status sumber dari `data/meta/status.json`. — `FR-23` · S
- [ ] **P3-09** Atribusi sumber dan waktu update di setiap tampilan harga, disclaimer "bukan rekomendasi investasi", penjelasan PPh 22 pada buyback. — `FR-26` · S

### Rilis

- [ ] **P3-10** Proyek Vercel sesuai WORKFLOWS §7: root `apps/web`, file di luar root disertakan, Node 22, *Ignored Build Step*, domain (jawab **Q-5**). — `NFR-01` · S
- [ ] **P3-11** Smoke test Playwright di CI (setiap halaman render, filter URL dipulihkan saat reload) + audit Lighthouse mobile. — `NFR-08`, `NFR-09` · S
- [ ] **P3-12** Checklist rilis: meta tag/OG image, favicon, halaman 404, README repo menautkan situs. — · S

## Kriteria selesai

- Empat halaman P0 tayang dan memakai data nyata.
- Setiap konfigurasi Explorer bisa dibagikan lewat URL dan dipulihkan persis.
- Commit data dari bot memicu deploy otomatis; commit yang tidak relevan tidak memicu build.

## Gerbang keluar G3 — rilis publik

- Data ritel terkumpul **≥ 14 hari** (Logam Mulia sudah berisi histori panjang).
- Semua FR P0 web (FR-20 s.d. FR-26) terpenuhi.
- LCP < 2,5 dtk di mobile; tidak ada error konsol; layout utuh di 360 px; kontras AA.

## Risiko dan catatan

- Seri Logam Mulia panjang (±5.000 titik); kirim per sumber × brand agar halaman Hari ini tidak memuat histori penuh.
- Static export Next.js tidak mendukung fitur server; semua komputasi di build atau browser — sesuai prinsip "statis sebisa mungkin".
