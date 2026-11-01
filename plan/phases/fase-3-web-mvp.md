# Fase 3 — Web MVP dan rilis publik

| | |
| --- | --- |
| **Tujuan** | Menayangkan situs statis dengan halaman inti (Hari ini, Explorer, Spread, Data) di Vercel |
| **Bergantung pada** | G1 untuk rilis; pengembangan bisa dimulai lebih awal memakai fixture dan data yang sudah terkumpul |
| **Perkiraan usaha** | 5–7 hari |
| **Gerbang keluar** | **G3 — rilis publik** |

> **Acuan visual:** [mockup/](../mockup/) — tata letak, token desain, dan konvensi tampilan setiap halaman. Angka di mockup ilustrasi; aturan data tetap mengikuti DATA-MODEL dan DECISIONS.

## Ruang lingkup

**Masuk:** proyek Next.js, `build-data`, komponen grafik, empat halaman P0, URL state, atribusi dan disclaimer, deploy Vercel, smoke test.

**Tidak masuk:** mode nilai, agregasi, Bandingkan, Kalkulator, grafik kelipatan, premi (Fase 4).

## Tugas

### Fondasi web

- [x] **P3-01** Next.js (App Router, SSG/static export) di `apps/web`, Tailwind + shadcn/ui, tema terang/gelap, layout responsif mulai 360 px, navigasi antar halaman. — `NFR-09` · M
  - *1 Nov 2026:* Next 16 (static export, Turbopack), React 19, Tailwind v4 + shadcn (`components/ui/button`). Token tema mockup → kelas Tailwind (`bg-surface`, `text-muted`, `text-antam`, `rounded-card`, `max-w-content`, …), tema gelap default + terang (`data-theme`, tanpa kedip), Instrument Serif + Inter. `SiteHeader` (slot `status`), `SiteNav`, `ThemeToggle`, `SiteFooter` (disclaimer + PPh 22), `PageIntro`; halaman `/`, `/explorer`, `/spread`, `/data` masih placeholder. Penyimpangan: chip "Data … WIB" di header menunggu `meta.json`; nav pindah baris sendiri di layar sempit. **Catatan lockfile:** setiap `pnpm add` menghapus `integrity` entri `xlsx` di `pnpm-lock.yaml` → kembalikan sebelum commit, cek dengan `pnpm install --frozen-lockfile`.
- [x] **P3-02** `scripts/build-data.ts`: dari CSV menghasilkan `latest.json`, `series/{source}-{brand}.json` (dengan kolom `variant`), `meta.json`, dan salinan CSV (TECH-SPEC §8). Dijalankan di `prebuild`. Uji unit untuk format output. — `FR-23`, `NFR-08` · M
  - *1 Nov 2026:* logika murni `lib/build/*` (`buildOutputs`) + I/O `scripts/build-data.ts`. Keluaran: `series/{source}-{brand}.json` (Tabungan Emas di `pegadaian-pegadaian.json`, nilai per 0,01 g), `latest.json` (perubahan, spread %, sparkline 30 hari, `highlights` dalam satuan tampilan), `meta.json` (katalog, status, events, `downloads`), `csv/*`, `macro/*` bila ada. Data nyata: 57 series, ±1,1 MB. `data/macro/` masih kosong → `spot = null`. File `derived/*` belum (Fase 4).
- [x] **P3-03** Lapisan akses data bertipe (dari `packages/schema`): katalog series, loader JSON, format rupiah `id-ID`, label sumber. — · S
  - *1 Nov 2026:* `lib/data/` (tipe, `fetch*` klien, `read*` saat build, kunci series `logammulia:antam:gold_bar::1`, `perGramPrice`, label sumber/brand, token warna) dan `lib/format.ts` (`formatRupiah`, `formatPct`, `formatChange`, `formatDataAge`, …).
- [x] **P3-04** Komponen `<TimeSeriesChart>` berbasis ECharts: multi-series, `dataZoom`, tooltip Rp, celah untuk hari tanpa data, responsif, warna konsisten per brand. — `FR-21` · M
  - *1 Nov 2026:* `components/charts/`: `TimeSeriesChart` (multi-series, `dataZoom`, celah berarsir `gaps`, garis putus, `band`, log, rentang terkontrol), `SpreadBandChart`, `BarChart` (SVG), `Sparkline` (SVG). ECharts di-*tree-shake* dan dimuat lewat `import()`; warna dibaca dari CSS variable dan dibangun ulang saat tema berganti.

### Halaman P0

- [x] **P3-05** **Hari ini** (`/`): kartu per brand (jual, buyback, spread, perubahan vs kemarin untuk 1 g) + kartu Tabungan Emas per gram, filter Semua / Emas fisik / Tabungan emas, tabel semua gramasi dengan sparkline 30 hari; umur data per sumber. — `FR-20` · M
  - *1 Nov 2026:* `app/page.tsx` (statis) + `components/today-board.tsx` (filter, kartu, tabel) + `lib/today.ts`. Kartu spot dunia "Belum tersedia" selama `spot = null`; perubahan null → "—"; `SourceStamp` di tiap kartu dan tabel; tab tabel per sumber × brand dari `meta.catalog` (bawaan UBS Lifestyle seperti mockup), pemilih tahun produksi UBS muncul bila ≥ 2 varian. Gramasi Tabungan Emas di tabel = konstanta tampilan `SAVINGS_WEIGHTS` (katalog hanya 0,01 g).
- [x] **P3-06** **Explorer** (`/explorer`): pemilih series (brand × sumber × gramasi × jenis harga), kontrol rentang 7H–Semua + kustom, semua state di URL via `nuqs`. — `FR-21`, `FR-24`, `FR-25` · L
  - *1 Nov 2026:* `app/explorer/page.tsx` (`NuqsAdapter` + `Suspense`) + `components/explorer-board.tsx` + `lib/explorer.ts` (diuji); pemuatan seri dipindah ke `components/use-series-files.ts` (dipakai juga Spread). Format URL: `?s=logammulia-antam-1-sell,pegadaian-pegadaian-0.01-buyback&r=3B` (`{source}-{brand}-{weight}-{sell|buyback}`, maks. 8; `r` = preset atau `YYYY-MM-DD..YYYY-MM-DD`; `s` kosong = 5 series bawaan mockup, `s=-` = tanpa series). Pemulihan URL setelah reload terbukti di browser. Mode nilai, agregasi, dan isi celah ditunda ke Fase 4.
- [x] **P3-07** **Spread** (`/spread`): area band jual–buyback, line spread %, bar spread % per gramasi hari ini. — `FR-22` · M
  - *1 Nov 2026:* `app/spread/page.tsx` + `components/spread-board.tsx` + `lib/spread.ts` (diuji). Pemilih pasangan beli di A → jual ke B (hanya brand dan produk sama; FR-29 penuh di Fase 4), KPI (hari ini, rata-rata, tersempit, titik impas), band jual–buyback dengan celah berarsir, spread % Antam LM vs Tabungan Emas, bar spread % per gramasi dari `latest` (tanpa buyback → "—"), kartu emas fisik vs tabungan. Buyback UBS menyambung varian 2026 + backfill `''` (2026 menang). Tanpa state URL.
- [x] **P3-08** **Data** (`/data`): kartu unduhan CSV/JSON per seri (harga ritel dan pembanding dunia), masing-masing dengan data terakhir (tanggal/jam, nilai terakhir, umur) dari `meta.json`. Tanpa kamus kolom, status sumber, dan dokumentasi API (D-34). — `FR-23` · S
  - *1 Nov 2026:* `app/data/page.tsx` dari `meta.downloads`: kartu per seri dengan data terakhir (tanggal/jam, nilai, umur) dan tombol CSV/JSON; kartu batangan Pegadaian berisi baris per brand; bagian pembanding dunia menampilkan keadaan kosong selama `data/macro/` kosong. Komponen bersama: `Segmented`, `RangeControl` (+ `rangeToDates`), `DataAge`, chip "Data … WIB" di header.
- [x] **P3-09** Atribusi sumber dan waktu update di setiap tampilan harga, disclaimer "bukan rekomendasi investasi", penjelasan PPh 22 pada buyback. — `FR-26` · S
  - *1 Nov 2026 (sebagian):* `SourceStamp` + `sourceStampText` siap; disclaimer dan PPh 22 sudah di footer. Dipasang di tiap tampilan harga bersama P3-05–P3-07. Temuan: `source_updated_at` Pegadaian = waktu terbit entri harga (`idHarga`/`id`, ±10.06–10.30 WIB), bukan jam snapshot ±18.32 (D-25) → stempel menulis "harga terbit …". UBS hanya tanggal (D-19).
  - *1 Nov 2026:* audit selesai: `SourceStamp` di Hari ini, Explorer, Spread; waktu update per kartu di Data; disclaimer + PPh 22 di footer. Dicek oleh smoke test (footer).

### Rilis

- [ ] **P3-10** Proyek Vercel sesuai WORKFLOWS §7: root `apps/web`, file di luar root disertakan, Node 22, *Ignored Build Step*, domain (jawab **Q-5**). — `NFR-01` · S
- [ ] **P3-11** Smoke test Playwright di CI (setiap halaman render, filter URL dipulihkan saat reload) + audit Lighthouse mobile. — `NFR-08`, `NFR-09` · S
  - *1 Nov 2026 (sebagian):* `e2e/smoke.spec.ts` (11 tes: render 4 halaman tanpa error konsol/halaman/4xx, tanpa geser horizontal di 360 px, Explorer pulih dari URL setelah reload dan URL ikut berubah saat rentang diganti, 404) terhadap `out/` lewat `scripts/serve-out.mjs` (port 4317); jalan di job `check` `ci.yml` setelah `pnpm --filter web build`. **Sisa:** audit Lighthouse mobile.
- [ ] **P3-12** Checklist rilis: meta tag/OG image, favicon, halaman 404, README repo menautkan situs. — · S
  - *1 Nov 2026 (sebagian):* metadata per halaman, Open Graph + Twitter card (`app/opengraph-image.tsx`, statis), `app/icon.svg`, 404 sesuai gaya situs, bagian "Situs web" + "Lisensi" di README. **Sisa:** URL situs nyata (`NEXT_PUBLIC_SITE_URL`, fallback sementara `gold-price-tracker.vercel.app`) dan tautan di README setelah P3-10.

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
