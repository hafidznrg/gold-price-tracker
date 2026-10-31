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

## Catatan data

Harga adalah milik masing-masing penerbit (PT Antam Tbk, PT Pegadaian, PT Untung Bersama Sejahtera). Proyek ini non-komersial dan **bukan rekomendasi investasi**; harga resmi selalu mengacu ke situs penerbit.
