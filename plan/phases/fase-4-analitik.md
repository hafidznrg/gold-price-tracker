# Fase 4 — Analitik dan fleksibilitas

| | |
| --- | --- |
| **Tujuan** | Melengkapi v1: kontrol analitik yang fleksibel, perbandingan antar brand dan tempat jual, kalkulator untung/rugi, grafik kelipatan emas Rp vs US$ vs kurs, dan premi Antam vs spot |
| **Bergantung pada** | G2 (data makro), G3 (web tayang) |
| **Perkiraan usaha** | 5–7 hari |
| **Gerbang keluar** | **G4** |

## Ruang lingkup

**Masuk:** semua FR P1, ditambah FR-04 (tabel gramasi Antam LM, P2) bila waktu memungkinkan.

**Tidak masuk:** perintah `reparse` dan halaman kualitas data (Fase 5).

## Tugas

### Kontrol analitik (Explorer & Spread)

- [ ] **P4-01** Mode nilai: nominal Rp, per gram, indeks (=100 di awal periode), % perubahan. — `FR-27` · M
- [ ] **P4-02** Agregasi harian / mingguan / bulanan dengan nilai penutupan periode, opsional pita min–maks. — `FR-28` · M
- [ ] **P4-03** Opsi *forward-fill* berlabel; default tetap menampilkan celah. — `FR-35` · S
- [ ] **P4-04** Pasangan spread bebas: jual dari sumber A vs buyback dari sumber B (mis. beli UBS di Pegadaian, jual ke UBS Lifestyle). — `FR-29` · M

### Halaman baru

- [ ] **P4-05** **Bandingkan** (`/bandingkan`): Antam vs UBS vs Galeri24 pada gramasi sama; Antam LM vs Antam Pegadaian; mode per gram atau indeks. — `FR-30` · M
- [ ] **P4-06** **Kalkulator** (`/kalkulator`): input tanggal beli, sumber beli, gramasi, jumlah, sumber jual → nilai sekarang, untung/rugi (Rp dan %), titik impas, grafik dengan penanda tanggal beli. — `FR-31` · M

### Spot dunia dan premi

- [ ] **P4-07** Perluas `build-data`: `macro/*.json`, `derived/gold-idr-gram.json`, `derived/annual.json`, `derived/premium-antam.json`, isi `spot.json` di `latest.json`; memakai `derive.ts` dari P2-11. — `FR-34` · S
- [ ] **P4-08** **Grafik kelipatan** (`/kelipatan`): sumbu Y log berlabel ×1, ×2, ×5, ×10…; tiga garis (emas Rp/gram, emas US$/oz, kurs) diindeks ke tahun dasar; pilihan tahun dasar dan agregasi (rata-rata tahunan atau penutupan akhir tahun); titik spot hari ini bergaris putus; anotasi peristiwa dari `config/events.yml` (`markLine`); subjudul kelipatan + CAGR otomatis; label kelipatan di ujung garis; opsi garis Antam LM sejak 2010. — `FR-32` · L
- [ ] **P4-09** **Premi Antam vs spot**: grafik premi % dari waktu ke waktu di halaman Bandingkan, dengan penjelasan komponen premi (ongkos cetak, margin, pajak). — `FR-33` · M

### Data dan sumber tambahan

- [ ] **P4-10** Dokumentasi API statis di halaman Data: daftar endpoint, format, contoh pemakaian di spreadsheet. — `FR-34` · S
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
