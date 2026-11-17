# Fixture Galeri24

Diambil 17 Nov 2026 ±08.39 WIB (Selasa) dari jaringan lokal (Indonesia) dengan `curl` biasa + User-Agent proyek, tanpa cookie/token. Riset dan temuan: [research/galeri24.md](../../../../../plan/research/galeri24.md) (P6-01, P6-01b).

| File | Endpoint | Isi | Asli? |
| --- | --- | --- | --- |
| `page-data-2026-11-17.json` | `GET /api/gold-prices/page-data?take=1000&date=2026-11-17` | `{ count: 111, results }`, 19 vendor, semua `date = 2026-11-17`, `status = "1"`. Target: Antam 9, UBS 10, Galeri24 11, Lotus Archi 6, Antam non-Pegadaian 9 gramasi. `updatedAt` brand target 16 Nov 14.37–14.40 UTC (21.37–21.40 WIB) | Asli, utuh |
| `harga-emas-2026-11-17.html.gz` | `GET /harga-emas` | Halaman Nuxt 3 dengan `<script id="__NUXT_DATA__">` (±51 KB, format devalue, `data.goldPrice`). Jalur fallback P6-04 | Asli, utuh (gzip) |
| `page-data-edge-synthetic.json` | — | Salinan `page-data` dengan: ANTAM 1 g `date = 2026-11-16` (tanggal campur brand wajib), Galeri24 0,5 g `buybackPrice = "0"`, Lotus Archi dihapus (brand opsional hilang), satu baris UBS 1 g `status = "3"` harga 9.999.000 (harus diabaikan) | **Sintetis** |
| `history-take5-2026-11-17.json` | `GET /api/gold-prices?take=5` | Halaman pertama histori: `{ count: 178157, next: "…/gold-prices?take=5&page=2", previous: null, results }` | Asli, utuh |
| `history-sample-2026-11-17.json` | `GET /api/gold-prices?take=10000&page=1` dan `page=18` | Hanya lima kode vendor target, tanggal 2026-11-17, 2026-11-16 (revisi intraday: dua entri `status = 1` per gramasi), 2026-11-07 (Antam 250–1000 g hanya `status = 3`), 2024-03-19, dan 2024-02-01 (tanggal tertua) | Asli, **dipotong** (filter vendor + tanggal) |

Nilai acuan 1 g, 17 Nov 2026 (jual / buyback): Galeri24 2.456.000 / 2.312.000 · Antam 2.560.000 / 2.286.000 · UBS 2.480.000 / 2.286.000 · Lotus Archi 2.471.000 / 2.286.000 · Antam non-Pegadaian 2.464.000 / 2.178.000.

Catatan:

- `page-data` dengan `date=2026-11-16` mengembalikan respons **identik byte demi byte** dengan `date=2026-11-17`: server mengabaikan parameter `date`.
- Rumus V-12 `sellingPrice = ceil(price × (1 + margin/100) / 1000) × 1000` cocok untuk semua baris target di `page-data-2026-11-17.json`.
