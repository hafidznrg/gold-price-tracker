# Fase 4 — Analitik dan fleksibilitas

| | |
| --- | --- |
| **Tujuan** | Melengkapi v1: kontrol analitik yang fleksibel, perbandingan antar brand dan tempat jual, kalkulator untung/rugi, grafik kelipatan emas Rp vs US$ vs kurs, dan premi Antam vs spot |
| **Bergantung pada** | G2 (data makro), G3 (web tayang) |
| **Perkiraan usaha** | 5–7 hari |
| **Gerbang keluar** | **G4** |

> **Acuan visual:** [mockup/](../mockup/) — tata letak, token desain, dan konvensi tampilan setiap halaman. Angka di mockup ilustrasi; aturan data tetap mengikuti DATA-MODEL dan DECISIONS.

## Ruang lingkup

**Masuk:** semua FR P1, ditambah FR-04 (tabel gramasi Antam LM, P2) bila waktu memungkinkan.

**Tidak masuk:** perintah `reparse` dan halaman kualitas data (Fase 5).

## Tugas

### Kontrol analitik (Explorer & Spread)

- [x] **P4-01** Mode nilai: nominal Rp, per gram, indeks (=100 di awal periode), % perubahan. — `FR-27` · M
  - *7 Nov 2026:* parameter URL `m=gram|idx|pct` (tanpa = nominal); indeks dan % ubah berbasis titik pertama tiap series yang terlihat di rentang (`lib/explorer.ts`). Kartu ringkasan tetap nominal harian (per gram bila mode per gram).
- [x] **P4-02** Agregasi harian / mingguan / bulanan dengan nilai penutupan periode, opsional pita min–maks. — `FR-28` · M
  - *7 Nov 2026:* `agg=w|m` (tanpa = harian), nilai penutupan periode; pita min–maks `band=1` hanya untuk mingguan/bulanan. Celah ditampilkan bila satu minggu/bulan penuh kosong.
- [x] **P4-03** Opsi *forward-fill* berlabel; default tetap menampilkan celah. — `FR-35` · S
  - *7 Nov 2026:* `ffill=1`; titik terisi berlabel "isi dari <tanggal>" di tooltip dan catatan kaki, arsiran celah disembunyikan. Salinan klien `lib/forward-fill.ts` diuji setara dengan `derive.ts` (`@gold/schema` tidak masuk bundel klien).
- [ ] **P4-04** Pasangan spread bebas: jual dari sumber A vs buyback dari sumber B (mis. beli UBS di Pegadaian, jual ke UBS Lifestyle). — `FR-29` · M

### Halaman baru

- [x] **P4-05** **Bandingkan** (`/bandingkan`): Antam vs UBS vs Galeri24 vs Tabungan Emas pada berat sama; Antam LM vs Antam Pegadaian; mode per gram atau indeks. — `FR-30` · M
  - *8 Nov 2026:* `/bandingkan` (`components/bandingkan-board.tsx`, `lib/bandingkan.ts`): enam series tetap (LM Antam, Pegadaian Antam, UBS Lifestyle, Pegadaian UBS, Pegadaian Galeri24, Tabungan Emas = per gram × berat), gramasi = yang dijual ≥ 2 series fisik; UBS memakai variant tahun produksi berjalan, cadangan variant kosong. URL: `w` (bawaan 1), `m=idx`, `r` (bawaan 1T). Deviasi mockup: tambah `RangeControl` (indeks butuh titik awal), tanpa label nilai di ujung garis (tooltip).
- [ ] **P4-06** **Kalkulator** (`/kalkulator`): input tanggal beli, sumber beli, gramasi, jumlah, sumber jual → nilai sekarang, untung/rugi (Rp dan %), titik impas, grafik dengan penanda tanggal beli. — `FR-31` · M

### Spot dunia dan premi

- [x] **P4-07** Perluas `build-data`: `macro/*.json`, `derived/gold-idr-gram.json`, `derived/annual.json`, `derived/premium-antam.json`, isi `spot.json` di `latest.json`; memakai `derive.ts` dari P2-11. — `FR-34` · S
  - *7 Nov 2026:* `macro/*.json` dan spot di `latest.json` sudah ada sejak Fase 3. Baru: `lib/build/derived.ts` → `derived/gold-idr-gram.json` (±50 KB), `derived/annual.json` (±8 KB, Rp/gram tahunan diturunkan per bulan seperti D-37; 1996 = 29.187,62), `derived/premium-antam.json` (±62 KB, premi %). Ditulis hanya bila data makro ada.
- [x] **P4-08** **Grafik kelipatan** (`/kelipatan`): sumbu Y log berlabel ×1, ×2, ×5, ×10…; tiga garis (emas Rp/gram, emas US$/oz, kurs) diindeks ke tahun dasar; pilihan tahun dasar dan agregasi (rata-rata tahunan atau penutupan akhir tahun); titik spot hari ini bergaris putus; anotasi peristiwa dari `config/events.yml` (`markLine`); subjudul kelipatan + CAGR otomatis; label kelipatan di ujung garis; opsi garis Antam LM sejak 2010. — `FR-32` · L
  - *8 Nov 2026:* `/kelipatan` (`components/kelipatan-board.tsx`, `lib/kelipatan.ts`). URL: `b` (tahun dasar 1996/2000/2005/2010/2015/2020, bawaan 1996), `a=end` (penutupan akhir tahun; bawaan rata-rata), `lm=1` (garis Antam LM, diindeks ke 2010 bila tahun dasar < 2010). `annual.json` mendapat `year_end` (resolusi D → M → A; kurs 1996–1998 = nilai tahunan WDI, ditandai "bukan penutupan") dan `antam_lm` (12,6 KB). Peristiwa dari `meta.json` (`events.yml`) lewat `markLine`. Basis 1996, rata-rata, 2026 s.d. 6 Nov: **×86,4 / ×11,64 / ×7,48** (P2-12: ×86,6 / ×11,63 / ×7,47); titik spot 6 Nov: **×81,1 / ×10,5 / ×7,72** (referensi ×80 / ×10,3 / ×7,7). Uji identitas Rp/gram ≈ US$ × kurs (< 1%) untuk setiap tahun, kedua agregasi. Deviasi mockup: tabel memuat semua tahun sejak tahun dasar (kotak gulir).
- [x] **P4-09** **Premi Antam vs spot**: grafik premi % dari waktu ke waktu di halaman Bandingkan, dengan penjelasan komponen premi (ongkos cetak, margin, pajak). — `FR-33` · M
  - *8 Nov 2026:* `components/premium-section.tsx` dari `derived/premium-antam.json` + kartu komponen premi dan catatan spot indikatif (GC=F). Riwayat harian baru sejak 6 Nov 2021 (spot harian xaus 5 tahun).
  - *8 Nov 2026:* premi bulanan Jan 2010 – Okt 2021 (`monthly` di `premium-antam.json`, `buildPremiumAntamMonthly`), garis tipis terpisah dari harian (D-38). Rentang 10,1–24,3%.

### Data dan sumber tambahan

- [ ] **P4-10** Dokumentasi API statis di README repo (bukan di halaman Data, D-34): daftar endpoint, format, contoh pemakaian di spreadsheet. — `FR-34` · S
- [ ] **P4-11** *(P2)* Scrape tabel harga Antam LM per gramasi dengan sesi browser yang sama; bila gagal, tetap simpan 1 g. — `FR-04` · M
- [ ] **P4-12** Perluas smoke test dan uji unit untuk halaman dan perhitungan baru. — `NFR-10` · S

## Kriteria selesai

- Semua FR P1 (FR-27 s.d. FR-35) terpenuhi dan teruji.
- Grafik kelipatan untuk 1996 → kini menghasilkan angka yang konsisten dengan cek silang P2-12.
- Semua state halaman baru tersimpan di URL.

## Gerbang keluar G4

- Daftar FR P1 di PRD tercentang semua.
- NFR-08 tetap terpenuhi setelah penambahan halaman (bundle ECharts di-*tree-shake*, data dimuat per halaman).

## Risiko dan catatan

- Agregasi dan mode indeks mudah salah di batas rentang; uji dengan rentang yang memotong celah data.
- Tekankan di UI bahwa harga spot xaus indikatif dan premi adalah estimasi.
