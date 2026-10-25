# Fixture UBS Lifestyle

Diambil 25 Okt 2026 08.41 WIB (Minggu) dari runner lokal (Indonesia), User-Agent proyek. Riset P0-07; temuan lengkap di [TECH-SPEC §5.1](../../../../../plan/TECH-SPEC.md#51-ubs-lifestyle-ubslifestylets).

| File | Isi | Asli? |
| --- | --- | --- |
| `page-2026-10-25-sunday.html.gz` | Halaman penuh `GET /harga-buyback-hari-ini/` (188 KB, gzip seperti arsip `data/raw/`). Hari Minggu: tanggal di halaman `25 October 2026`, tetapi harga = data Sabtu 24 Okt | Asli |
| `table-2026-10-25.html` | Potongan blok `div.table-product-wrapper` dari halaman di atas, dibungkus HTML minimal. Satu tabel "Tahun 2026", 13 pecahan | Asli (dipotong) |
| `table-multiyear-synthetic.html` | Tabel 2026 asli + tabel "Tahun 2025" **sintetis** (buyback −1%, harga beli `-`) untuk menguji banyak tahun produksi (D-08) dan sel tanpa harga | Sintetis sebagian |
| `chart-interval-1095-2026-10-25.json` | Respons `POST /wp-admin/admin-ajax.php` `action=get_harga_emas_hari_ini&path=ajax/chart_interval/GOLD/1095`, dipotong ke 30 titik terakhir (asli 543 titik, 2023-11-20 → 2026-10-24) | Asli (dipotong) |
| `chart-range-empty.json` | Respons `path=ajax/chart_range/GOLD/{from}/{to}` — selalu `data: []` | Asli |

Tabel 1 g pada 24 Okt 2026: harga beli Rp2.483.400, buyback Rp2.288.000. Titik terakhir grafik `[1792800000000, 2288000, 2288000, 2288000, 2277000]` (2026-10-24T00:00Z) = buyback 1 g.
