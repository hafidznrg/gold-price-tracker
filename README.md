# Gold Price Tracker

Platform untuk melihat pergerakan historis harga emas batangan di Indonesia: **harga jual toko**, **harga buyback**, dan **spread** untuk Antam, UBS, dan Galeri24, dibandingkan dengan harga emas dunia (XAU/USD) dan kurs USD/IDR.

Data dikumpulkan otomatis setiap hari oleh GitHub Actions dari logammulia.com, pegadaian.co.id, dan ubslifestyle.com, disimpan sebagai CSV di repository ini (*git-as-database*), lalu disajikan sebagai situs statis di Vercel.

> **Status:** Fase 1 (pipeline harga ritel). Ketiga sumber ritel dijalankan otomatis setiap hari; notifikasi, karantina, dan backfill sudah aktif; observasi 7 hari menuju gerbang G1 sedang berjalan. Rencana lengkap di [`plan/`](./plan/README.md).

## Dokumentasi

| Dokumen | Isi |
| --- | --- |
| [plan/README.md](./plan/README.md) | Indeks rencana dan urutan fase |
| [plan/PRD.md](./plan/PRD.md) | Kebutuhan produk |
| [plan/TECH-SPEC.md](./plan/TECH-SPEC.md) | Spesifikasi teknis |
| [plan/DATA-MODEL.md](./plan/DATA-MODEL.md) | ERD, kamus data, aturan merge |
| [plan/WORKFLOWS.md](./plan/WORKFLOWS.md) | GitHub Actions dan deploy |
| [plan/DECISIONS.md](./plan/DECISIONS.md) | Log keputusan |

## Operasional

Pipeline berjalan sendiri lewat GitHub Actions. Bagian ini untuk saat ada yang perlu dicek atau diperbaiki. Detail lengkap ada di [WORKFLOWS.md](./plan/WORKFLOWS.md).

### Jadwal

| Workflow | Kapan | Isi |
| --- | --- | --- |
| `scrape-retail` | 10.25 & 13.25 WIB (jendela `day`: UBS Lifestyle, Logam Mulia); 19.05 & 21.05 WIB (jendela `evening`: Pegadaian) | Slot pertama `primary`; slot kedua `retry` hanya untuk sumber yang belum sukses |
| `ci` | Setiap push kode (bukan `data/**`) dan PR | Lint, typecheck, test |
| `backfill`, `quarantine`, `probe`, `notify-test` | Manual | Lihat di bawah |

Cron GitHub sering terlambat berjam-jam (26–31 Okt 2026: ±6 jam). Run tetap menilai data terhadap **tanggal slot**, bukan jam saat run berjalan (D-27). Setiap run yang mengubah data membuat commit `data: …` dari `github-actions[bot]`, jadi `git pull` dulu sebelum bekerja di lokal.

### Menjalankan scrape manual

Actions → **scrape-retail** → *Run workflow*:

- `sources`: kosong = semua sumber aktif (Pegadaian dilewati sebelum 18.45 WIB), atau daftar dipisah koma, mis. `pegadaian`.
- `force`: jalankan walau sumber itu sudah sukses hari ini.

Dari terminal:

```bash
gh workflow run scrape-retail.yml -f sources=pegadaian
```

Di lokal (`--root` harus absolut, karena `pnpm --filter` berjalan dari folder paket):

```bash
pnpm --filter scraper start plan --workflow scrape-retail --event workflow_dispatch --root "$PWD"
pnpm --filter scraper start scrape --source ubslifestyle --root "$PWD" --out "$PWD/out/ubslifestyle"
pnpm --filter scraper start merge --in "$PWD/out" --root "$PWD" --dry-run true
```

`scrape` tidak pernah menulis ke `data/`. `merge --dry-run true` hanya mencetak path yang akan berubah.

### Membaca hasil run

| File | Isi |
| --- | --- |
| `data/meta/status.json` | Kondisi terakhir per sumber: `last_status`, `last_data_date`, `consecutive_failures`. Tempat pertama untuk dicek |
| `data/meta/runs/{yyyy}.jsonl` | Satu baris per sumber per run: status, `error_code`/`error_message`, `data_date`, jumlah insert/update/sama/ditahan/ditolak, path raw |
| `data/meta/revisions/{yyyy}.jsonl` | Setiap nilai yang berubah: `old_value` → `new_value`, `reason` (`source_changed`, `quarantine_approved`, …) |
| `data/raw/{source}/{yyyy-mm}/` | Respons mentah (gzip) untuk diagnosis; hanya ditulis bila isinya berubah |
| Step summary run di Actions | Tabel ringkas per sumber |

| Status | Arti |
| --- | --- |
| `success` | Data ditulis |
| `partial` | Data ditulis, sebagian baris ditahan ke karantina |
| `stale` | Sumber belum memperbarui harga untuk tanggal slot; tidak menulis. Dianggap gagal hanya di hari yang diharapkan menurut `update_calendar`, dan Issue baru dibuka di slot `retry` |
| `failed` | Fetch, parse, atau validasi gagal; tidak menulis. Lihat `error_code` |

```bash
jq '.pegadaian' data/meta/status.json
```

```bash
tail -n 5 data/meta/runs/2026.jsonl | jq -c '{source, slot, status, data_date, error_message}'
```

### Saat ada Issue `pipeline-failure`

Kegagalan membuka satu Issue per sumber (label `pipeline-failure` dan `source:{id}`) dan mengirim pesan Telegram. Kegagalan berikutnya menambah komentar di Issue yang sama, dan Issue **ditutup otomatis** saat sumber itu sukses lagi.

1. Buka tautan run di Issue, lalu baca baris sumber di step summary dan `error_message` di `data/meta/runs/`.
2. Tindakan per `error_code`:
   - Tanpa `error_code` (`stale`): sumber terlambat update. Biasanya pulih sendiri di slot berikutnya; bila perlu, jalankan scrape manual nanti.
   - `FETCH_HTTP`, `FETCH_TIMEOUT`: situs bermasalah atau sedang maintenance. Tunggu, lalu jalankan manual.
   - `BLOCKED`: diblokir proteksi bot (paling mungkin Logam Mulia, D-26). Cek dengan workflow **probe**; bila terus terjadi, pertimbangkan *self-hosted runner*.
   - `PARSE_ERROR`, `SCHEMA_INVALID`: struktur situs berubah. Ambil raw dari `data/raw/`, perbarui parser, fixture, dan uji, lalu jalankan manual.
   - `VALIDATION_FAILED`: data tidak masuk akal (mis. buyback ≥ jual, gramasi kurang). Periksa raw sebelum mengubah aturan, dan catat perubahan aturan di DECISIONS.md.
3. Issue `Pipeline gagal: merge` berarti data run itu tidak ter-commit (mis. push ditolak). Jalankan ulang run tersebut.

Untuk menguji jalur notifikasi tanpa menyentuh data (mis. setelah mengganti secret Telegram): Actions → **notify-test** → `failed` (buka Issue + Telegram), lalu `recovered` (tutup Issue).

### Karantina

Baris yang mencurigakan ditahan dan tidak ditulis: harga berubah lebih dari 10% dari nilai terakhir (`PRICE_JUMP`), gramasi di luar `config/catalog.yml` (`UNKNOWN_ITEM`), atau lebih dari 20 revisi histori dalam satu run (`MASS_REVISION`). Batch disimpan di `data/quarantine/{source}/{tanggal}-{run_id}.json`, dan Issue `quarantine` + Telegram menyebut path file-nya.

1. Buka file batch dan bandingkan barisnya dengan situs sumber.
2. Untuk `UNKNOWN_ITEM` yang memang gramasi baru, tambahkan gramasi itu ke `config/catalog.yml` lewat commit biasa terlebih dulu.
3. Actions → **quarantine** → isi `path` (dari Issue), `decision` (`approve` atau `reject`), dan `note`.
   - `approve`: baris divalidasi ulang (kecuali aturan pemicunya), ditulis ke CSV, dan dicatat sebagai revisi `quarantine_approved`.
   - `reject`: baris dibuang.
   - Keduanya memindahkan file ke `data/quarantine/_resolved/{source}/` beserta keputusan, pengambil keputusan, dan catatan. Issue ditutup bila tidak ada batch pending lagi untuk sumber itu.

### Backfill histori

Actions → **backfill** → pilih `job`, opsional `from`/`to` (`YYYY-MM-DD`). Selalu jalankan dulu dengan `dry_run` (default): merge berjalan di runner tanpa commit, ringkasan diff tampil di step summary, dan diff lengkap ada di artifact `backfill-diff`. Bila diff sudah benar, jalankan lagi dengan `dry_run` dimatikan.

| Job | Isi | Status |
| --- | --- | --- |
| `ubs-history` | Buyback 1 g UBS dari grafik sejak Nov 2023, `variant` kosong (D-28) | Sudah dijalankan 31 Okt 2026 |
| `logammulia-archive` | Harga dasar + buyback 1 g Antam sejak 2010, dari arsip lokal (`--input`, hanya dari terminal, D-29) | Sudah diimpor 31 Okt 2026 |
| `pegadaian-savings` | Tabungan Emas Pegadaian (jual + buyback per 0,01 g), 360 hari terakhir dari grafik (D-30); bisa diulang untuk menambal hari terlewat | Sudah dijalankan 31 Okt 2026 |
| `worldbank`, `xaus`, `ecb`, `jisdor`, `annual-fx` | Seri makro | Fase 2 |

Backfill tidak menimpa nilai yang sama, mencatat nilai yang berbeda sebagai revisi `source_changed`, dan tidak mengubah `status.json`.

### Menambah sumber baru

1. **Riset:** tambahkan target di `apps/scraper/src/probe/targets.ts`, lalu jalankan workflow **probe** untuk memastikan sumber bisa diakses dari runner GitHub. Simpan fixture di `apps/scraper/test/fixtures/{source}/` beserta README-nya, dan catat temuan di TECH-SPEC §5.
2. **Skema:** tambahkan id ke `SCRAPER_IDS` (dan `PRICE_SOURCES` untuk harga ritel) di `packages/schema/src/enums.ts`, serta gramasinya di `config/catalog.yml`.
3. **Modul:** buat `apps/scraper/src/sources/{id}.ts` sesuai kontrak `SourceScraper` (`fetchRaw` + `parse` murni), daftarkan di `src/sources/index.ts`, dan tambahkan `MIN_ROWS` di `src/pipeline/validate.ts`. Uji parser dengan fixture.
4. **Konfigurasi:** tambahkan entri di `config/sources.yml` dengan `enabled: false`, lalu uji dengan run manual `sources={id}`. Setelah hasilnya benar, ubah ke `enabled: true`. Pilih `schedule_window` sesuai jam sumber memperbarui harga.
5. Catat keputusan yang tidak terlihat dari kode di `plan/DECISIONS.md`.

### Secrets dan variables

| Nama | Jenis | Dipakai oleh |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Secret | `notify` (tanpa keduanya Telegram dilewati; Issue tetap jalan) |
| `SCRAPER_USER_AGENT` | Variable | Scraper HTTP |

`GITHUB_TOKEN` bawaan cukup untuk commit data dan Issue.

## Situs web

Situs statis (`apps/web`, Next.js static export): Hari ini, Explorer, Spread, Bandingkan, Kalkulator, Kelipatan, dan Data. Alamat: <https://gold.hafidznrg.my.id> (Vercel, dibangun ulang otomatis setiap ada commit data).

```bash
pnpm --filter web exec tsx scripts/build-data.ts  # CSV di data/ -> JSON di apps/web/public/data
pnpm --filter web exec next dev -p 3100         # dev server di http://localhost:3100
pnpm --filter web build        # build produksi ke apps/web/out (menjalankan build-data lebih dulu)
pnpm --filter web e2e          # smoke test Playwright terhadap out/ (butuh build; pertama kali: pnpm --filter web exec playwright install chromium)
```

Atur `NEXT_PUBLIC_SITE_URL` saat build agar tag Open Graph memakai domain yang benar.

## API statis

Data yang dipakai situs juga bisa diambil langsung. Semua file dibuat saat build dari CSV di `data/` dan disajikan sebagai file statis di `https://gold.hafidznrg.my.id/data/` (selanjutnya `{BASE}`). Tidak ada server, kunci API, maupun batas permintaan, tetapi juga tidak ada header CORS khusus: pemakaian dari skrip, spreadsheet, atau server aman, sedangkan `fetch` dari halaman web lain bisa diblokir browser.

Semua file dibangun ulang setiap ada commit data (sekali sehari per sumber, lihat [Jadwal](#jadwal)). Tidak ada jaminan versi selain `schema_version` di `latest.json` dan `meta.json`: bentuk file boleh bertambah kolom/kunci, dan perubahan yang memutus kompatibilitas menaikkan versi mayor.

| Endpoint | Isi | Diperbarui |
| --- | --- | --- |
| `{BASE}/latest.json` | Harga terbaru, perubahan, dan sparkline per seri; spot emas; status sumber | Harian |
| `{BASE}/meta.json` | Katalog sumber, seri, rentang data, peristiwa, dan daftar file untuk diunduh | Harian |
| `{BASE}/series/{file}.json` | Seri harian satu sumber × brand × produk, mis. `logammulia-antam`, `pegadaian-galeri24`, `ubslifestyle-ubs` (daftar lengkap di `meta.json`) | Harian |
| `{BASE}/macro/{series}.json` | Seri makro mentah: `xau_usd_oz`, `usd_idr_jisdor`, `usd_idr_ecb`, `usd_idr_annual` | Harian (`annual`: tahunan) |
| `{BASE}/derived/gold-idr-gram.json` | Emas spot dalam Rp/gram (US$/oz × kurs ÷ 31,1035) | Harian |
| `{BASE}/derived/annual.json` | Agregat tahunan emas, kurs, Antam 1 g, dan Rp/gram sejak 1996 | Harian |
| `{BASE}/derived/premium-antam.json` | Premi Antam 1 g terhadap spot (harian dan bulanan) | Harian |
| `{BASE}/csv/{file}.csv` | CSV lengkap untuk setiap `series/` dan `macro/` di atas, mis. `csv/logammulia-antam.csv`, `csv/xau_usd_oz.csv` | Harian |

Baris data berbentuk tuple (array) dengan urutan kolom yang tertera di properti `fields`, supaya file kecil. Harga dalam rupiah per keping (bukan per gram) kecuali disebut lain; `null` berarti sumber tidak menampilkan harga itu.

| File | `fields` | Contoh |
| --- | --- | --- |
| `series/*.json` | `date, variant, w, sell, buyback` (`w` = gram, `variant` = tahun produksi UBS atau kosong) | `["2026-11-07","",1,2545000,2350000]` |
| `macro/*.json` | `date, frequency, value, source` (`frequency`: `D` harian, `M` bulanan, `A` tahunan) | `["1996-01-01","M",399,"worldbank"]` |
| `derived/gold-idr-gram.json` | `date, idr_gram, xau_usd_oz, usd_idr, fx` (`fx` = indeks ke `fx_series`) | `["2021-11-05",839606.56,1816.8,14374,0]` |
| `derived/premium-antam.json` | `rows`: `date, pct, spot_date`; `monthly`: `month, pct, gold_frequency, days` | `["2021-11-08",12.5527,"2021-11-05"]` |

`derived/annual.json` berbentuk objek: `{ "until": "2026-11-06", "rows": [{ "year": 1996, "gold_usd": { "value": 387.58, ... }, "usd_idr": {...}, "antam_lm": null, "idr_gram": {...} }] }`.

Contoh potongan `series/logammulia-antam.json`:

```json
{"file":"logammulia-antam","source":"logammulia","brand":"antam","product":"gold_bar","location":"jakarta",
 "fields":["date","variant","w","sell","buyback"],
 "rows":[["2010-01-04","",1,408000,null],["2010-01-05","",1,410000,null]]}
```

### Memakai di spreadsheet

**Google Sheets.** `IMPORTDATA` hanya membaca CSV, jadi pakai endpoint `csv/`:

```
=IMPORTDATA("https://gold.hafidznrg.my.id/data/csv/logammulia-antam.csv")
=IMPORTDATA("https://gold.hafidznrg.my.id/data/csv/xau_usd_oz.csv")
```

Kolom CSV: `date, source, brand, product, variant, weight_g, location, sell_price, buyback_price, ...` (harga) dan `date, series, frequency, value, unit, ...` (makro). Alternatif lain: CSV mentah per tahun di GitHub, mis. `https://raw.githubusercontent.com/hafidznrg/gold-price-tracker/main/data/prices/logammulia/2026.csv` dan `.../main/data/macro/xau_usd_oz.csv`. Untuk JSON, pakai Apps Script (Extensions → Apps Script), lalu panggil `=GOLD_LATEST()` di sel:

```js
function GOLD_LATEST() {
  const j = JSON.parse(UrlFetchApp.fetch('https://gold.hafidznrg.my.id/data/series/logammulia-antam.json').getContentText());
  return j.rows.slice(-30).map((r) => [r[0], r[3], r[4]]); // tanggal, jual, buyback
}
```

**Excel (Power Query).** Data → Get Data → From Other Sources → From Web, isi URL JSON (mis. `.../data/series/logammulia-antam.json`). Di editor, klik `rows` → *To Table* → *Expand* kolomnya, lalu beri nama kolom sesuai `fields`. Untuk CSV, pakai From Text/CSV dengan URL file `csv/` yang sama.

Data tetap milik masing-masing penerbit (lihat [Catatan data](#catatan-data)); bila dipakai ulang, sebutkan sumber aslinya dan proyek ini, dan jangan menganggapnya rekomendasi investasi.

## Lisensi

Kode berlisensi [MIT](./LICENSE). Data harga adalah milik masing-masing penerbit (lihat Catatan data di bawah).

## Catatan data

Harga adalah milik masing-masing penerbit (PT Antam Tbk, PT Pegadaian, PT Untung Bersama Sejahtera). Proyek ini non-komersial dan **bukan rekomendasi investasi**; harga resmi selalu mengacu ke situs penerbit.
