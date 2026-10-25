# Fase 2 — Data makro: emas dunia dan kurs

| | |
| --- | --- |
| **Tujuan** | Menyediakan seri XAU/USD dan USD/IDR sejak 1996 serta seri turunan Rp/gram spot, sebagai dasar grafik kelipatan dan premi harga lokal |
| **Bergantung pada** | G0 (bisa berjalan paralel dengan Fase 1; memakai `validate`/`merge` dari P1-01/P1-02) |
| **Perkiraan usaha** | 3–4 hari |
| **Gerbang keluar** | **G2** |

## Ruang lingkup

**Masuk:** skema makro, scraper harian xaus dan JISDOR, workflow makro, backfill World Bank / xaus / ECB / JISDOR / kurs tahunan 1996–1998, modul perhitungan turunan, cek silang.

**Tidak masuk:** visualisasi (Fase 4).

## Tugas

### Skema dan penyimpanan

- [ ] **P2-01** Tambah aturan V-08 s.d. V-10 ke `validate.ts` untuk `MacroRow` (V-08/V-09 tingkat baris → karantina). — `FR-10` · S
- [ ] **P2-02** Perluas `merge.ts` untuk `data/macro/{series}.csv` (kunci `date + series + frequency`, aturan upsert yang sama) dan penulisan `data/macro/spot.json`. — `FR-12`, `FR-16` · S

### Pengambilan harian

- [ ] **P2-03** Scraper `xaus.ts`: upsert penutupan **10 hari terakhir** dari `/api/v1/history` ke `xau_usd_oz` (`D`), tanpa hari berjalan; spot ke `data/macro/spot.json`. Tolak respons `stale: true`. — `FR-05` · S
- [ ] **P2-04** Scraper `jisdor.ts`: upsert 10 hari terakhir ke `usd_idr_jisdor` (`D`) dari tabel `GET` halaman BI (10 hari kerja; TECH-SPEC §5.5). Fallback: Frankfurter harian ke `usd_idr_ecb` (seri terpisah, tidak menimpa JISDOR). — `FR-06` · M
- [ ] **P2-05** Workflow `scrape-macro.yml` (WORKFLOWS §3.3): cron `40 9 * * 1-5`, `plan` memilih `xaus`, `jisdor`, dan `worldbank` bila rata-rata bulan lalu belum ada (tanggal ≥ 5), `concurrency: data-write`. — `FR-09`, `NFR-02` · S

### Backfill

Semua backfill dijalankan lewat `backfill.yml` (dibuat di P1-13): pertama `dry_run: true` untuk memeriksa diff, lalu `false`.

- [ ] **P2-06** `backfill/worldbank.ts`: XLSX Pink Sheet bulanan (URL dari tautan halaman, kolom `Gold` lewat nama; TECH-SPEC §5.6) → `xau_usd_oz` (`M`) 1996 → bulan lalu. — `FR-07` · M
- [ ] **P2-07** `backfill/xaus.ts`: histori harian 5 tahun → `xau_usd_oz` (`D`). — `FR-07` · S
- [ ] **P2-08** `backfill/ecb.ts`: Frankfurter `rates.csv` → `usd_idr_ecb` = EUR/IDR ÷ EUR/USD, 4 Jan 1999 → kini (harian; satu request `v2/rates.csv`, TECH-SPEC §5.6). — `FR-07` · S
- [ ] **P2-09** `backfill/jisdor.ts`: postback ekspor XLSX, 20 Mei 2013 → kini, satu request (TECH-SPEC §5.5). — `FR-07` · M
- [ ] **P2-10** `backfill/annual-fx.ts`: kurs USD/IDR tahunan 1996–1998 dari sumber resmi terverifikasi (jawab **Q-3**); catat sumbernya di DECISIONS.md. — `FR-07` · S

### Turunan dan verifikasi

- [ ] **P2-11** Modul turunan `packages/schema/src/derive.ts` sesuai DATA-MODEL §6: rumus, *as-of join* dengan toleransi (kurs ≤ d; premi memakai spot < d), resolusi frekuensi untuk agregat tahunan (D ≥ 80% → M → A) dengan seri sumber tercatat, *forward-fill* berpenanda. Uji unit untuk setiap aturan. — `FR-32`, `FR-33` · M
- [ ] **P2-12** Skrip cek silang `scripts/check-macro.ts`: hitung kelipatan 1996 → kini untuk emas Rp/gram, emas US$/oz, dan kurs; cocokkan dengan grafik referensi (×80, ×10,3, ×7,7 per 23 Okt 2026, rata-rata tahunan); hitung premi Antam di 3 tanggal acak. — `G2` · S
- [ ] **P2-13** Isi `config/events.yml`: Krisis 1998, Puncak 2011, dan peristiwa lain yang relevan. — `FR-32` · S

## Kriteria selesai

- `data/macro/` berisi `xau_usd_oz`, `usd_idr_jisdor`, `usd_idr_ecb`, `usd_idr_annual` dengan cakupan sesuai tabel backfill.
- Workflow makro berjalan terjadwal dan hijau minimal 5 hari kerja.
- Semua fungsi turunan teruji.

## Gerbang keluar G2

- Setiap tahun 1996 → kini punya nilai emas US$/oz dan kurs (tahunan, bulanan, atau harian).
- Identitas kelipatan berlaku: kelipatan Rp/gram ≈ kelipatan US$/oz × kelipatan kurs (selisih < 1%, sisa pembulatan).
- Hasil cek silang mendekati grafik referensi; perbedaan dijelaskan (mis. beda sumber kurs atau metode rata-rata).
- Premi Antam di tanggal sampel bernilai positif dan masuk akal.

## Risiko dan catatan

- xaus.com indikatif (histori dari Yahoo Finance); tandai di UI bahwa ini bukan harga patokan LBMA.
- Kurs ECB dan JISDOR ditetapkan di jam berbeda; simpan terpisah dan tandai sambungan seri di 2013.
- File XLSX World Bank bisa berubah tata letak antar rilis; parse berdasarkan nama kolom, bukan posisi.
