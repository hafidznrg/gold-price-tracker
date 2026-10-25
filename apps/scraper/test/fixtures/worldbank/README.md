# Fixture World Bank Pink Sheet

Sumber: `CMO-Historical-Data-Monthly.xlsx` rilis 2 Okt 2026 (586 KB), ditautkan dari https://www.worldbank.org/en/research/commodity-markets. Riset P0-10; temuan di [TECH-SPEC §5.6](../../../../../plan/TECH-SPEC.md#56-backfill-makro-sekali-jalan).

| File | Isi | Asli? |
| --- | --- | --- |
| `cmo-monthly-trimmed-2026-10.xlsx` | Sheet `Monthly Prices` saja: 6 baris judul/header asli (termasuk "Updated on October 02, 2026", nama kolom, satuan), 12 bulan 1996 dan 3 bulan terakhir (2026M07–M09), **semua 89 kolom** agar pencarian kolom "Gold" teruji | Asli, dipotong dan ditulis ulang dengan SheetJS (sheet lain dibuang) |

Nilai acuan: Gold 1996M01 = 399, 2026M09 = 4319 ($/troy oz, bilangan bulat).
