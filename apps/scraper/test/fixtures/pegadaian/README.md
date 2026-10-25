# Fixture Pegadaian

Diambil 25 Okt 2026 ±08.50 WIB (Minggu) dari jaringan lokal (Indonesia) dengan `curl` biasa + User-Agent proyek (tanpa header/token tambahan). Riset P0-08; temuan lengkap di [TECH-SPEC §5.2](../../../../../plan/TECH-SPEC.md#52-pegadaian-pegadaiants).

| File | Endpoint | Isi | Asli? |
| --- | --- | --- | --- |
| `prices-table-2026-10-25-sunday.json` | `GET /gold/prices/table` | Harga emas batangan, 10 vendor × 25–29 gramasi. `tglBerlaku` = `2026-10-24` (Sabtu) walau diambil hari Minggu | Asli, utuh |
| `prices-table-edge-synthetic.json` | — | Salinan di atas dengan: Galeri 24 hanya 3 gramasi berharga (uji V-04), UBS 2,5 g berharga Rp6.170.000 (gramasi di luar katalog, uji V-02), ANTAM `tglBerlaku` = `2026-10-23` (tanggal campur) | **Sintetis** |
| `vendors-2026-10-25.json` | `GET /gold/prices/vendors?isRequest=true` | 3 vendor yang ditampilkan di tabel halaman: ANTAM, Galeri 24, UBS | Asli, utuh |
| `tabungan-2026-10-25.json` | `GET /gold/prices` | Harga Tabungan Emas per 0,01 g (`hargaJual` = harga beli konsumen, `hargaBeli` = buyback), `tglBerlaku` = `2026-10-25` | Asli, utuh — di luar cakupan v1 |
| `chart-tabungan-7d-2026-10-25.json` | `GET /gold/prices/chart` | Grafik Tabungan Emas, dipotong ke interval 7 hari (asli: 7/30/90/180/360 hari, jual & beli) | Asli (dipotong) — di luar cakupan v1 |

Nilai acuan (tabel halaman, "Diperbarui 24 Oktober 2026"), 1 g: Galeri 24 Rp2.467.000 · ANTAM Rp2.579.000 · UBS Rp2.491.000. Tidak ada buyback untuk emas batangan (`hargaBeli: null` di semua baris).
