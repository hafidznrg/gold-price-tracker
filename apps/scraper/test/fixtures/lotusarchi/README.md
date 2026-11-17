# Fixture Lotus Archi (lotusarchi.com)

Riset: [research/lotusarchi.md](../../../../../plan/research/lotusarchi.md) §3 (P6-01, P6-09). Parser: `apps/scraper/src/sources/lotusarchi.ts`.

Kedua respons diambil 17 Nov 2026 ±19.53–20.06 WIB dengan `curl` biasa + User-Agent proyek (tanpa Origin/Referer), satu kali per endpoint.

| File | Endpoint | Isi | Asli? |
| --- | --- | --- | --- |
| `harga-display-2026-11-17.json` | `GET https://api.lotusarchi.com/harga-display` | `{data:[{id, produk, type, harga}]}`, 20 baris: emas `0,1 gr` … `100 gr` (+ `0,5 gr WB`, `Paper Gold …`) dan `Silver …`. `harga` = harga jual per keping. **Tanpa tanggal.** 1 gr = 2.397.000 | Asli, utuh |
| `harga-gold-2026-11-17.json` | `GET https://lotusarchi.com/wp-json/la/v1/harga-gold` | `{data:[{harga_id, harga_emas, buyback_emas, tanggal}]}`: harga dasar dan buyback **per gram** per tanggal, terbaru dulu. Aslinya 518 baris sejak 2025-02-27 (43 KB); di sini 30 baris terbaru (17 Nov hingga sekitar 20 Okt 2026) | Asli, dipangkas |

Catatan:

- Tabel HTML di `/pricing/` (`QTY (GR) | HARGA JUAL`) adalah salinan **tersembunyi dan basi** (1 gr 2.591.000 saat harga sebenarnya 2.397.000). Tabel yang tampil di browser diisi JavaScript dari `harga-display`. Fixture HTML lama dihapus; baris bertanggal di halaman juga tidak dipakai.
- `harga-gold` memuat tanggal ganda (revisi): di fixture `2026-10-28` punya `harga_id` 503 (2.453.000) dan 504 (2.455.000). Parser memakai `harga_id` terbesar.
- 17 Nov 2026: `harga-display` "1 gr" = `harga_emas` 2.397.000 tanggal 2026-11-17, buyback 2.249.000.
