# Fixture Hartadinata / EMASKU (hrtagold.id)

Riset: [research/hartadinata.md](../../../../../plan/research/hartadinata.md) §2–§3 (P7-01). Probe: `checkHrtaGold` di `apps/scraper/src/probe/checks.ts`.

| File | Isi | Asli? |
| --- | --- | --- |
| `price-daily-2026-11-21.json` | `GET https://hrtagold.id/api/v1/brandings/price/daily`, diambil 21 Nov 2026 ±08.30 WIB dari terminal lokal dengan `curl` biasa + User-Agent proyek, satu request. Seri `Gold` (17 gramasi, 0,1 g sampai 1.000 g) dan `Prime` (25/50/100 g); `updated_date` dan `created_at` 2026-11-21T08:12:26+07:00. Gold 1 g: jual 2.258.000, buyback 2.122.000 | Asli, utuh |
| `price-daily-edge-synthetic.json` | Kasus tepi: hanya seri `Prime` (tanpa `Gold`), satu `price` 0, satu `buyback_price` ≥ `price`, `updated_date` kemarin (20 Nov) | Sintetis |

Catatan: tanpa tanggal per baris; `updated_date` (WIB) berlaku untuk seluruh tabel. Hanya `Gold` wajib; `Prime` opsional.
