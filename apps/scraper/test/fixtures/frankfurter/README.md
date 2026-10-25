# Fixture Frankfurter (kurs acuan ECB)

Diambil 25 Okt 2026 dari `GET https://api.frankfurter.dev/v2/rates.csv?base=EUR&quotes=IDR,USD&from=1999-01-01&to=2026-10-24&providers=ecb` — satu respons CSV memuat seluruh histori (14.242 baris = 7.121 tanggal × 2 kuotasi, 1999-01-04 → 2026-10-23, tanpa celah). Riset P0-10; temuan di [TECH-SPEC §5.6](../../../../../plan/TECH-SPEC.md#56-backfill-makro-sekali-jalan).

| File | Isi | Asli? |
| --- | --- | --- |
| `rates-eur-idr-usd-1999-head.csv` | Header + 20 baris pertama (10 tanggal Jan 1999) | Asli (dipotong) |
| `rates-eur-idr-usd-2026-tail.csv` | Header + 20 baris terakhir (10 tanggal Okt 2026) | Asli (dipotong) |

`usd_idr_ecb` = baris `IDR` ÷ baris `USD` pada tanggal yang sama; mis. 2026-10-23: 20268.06 ÷ 1.1193 ≈ 18107,80.
