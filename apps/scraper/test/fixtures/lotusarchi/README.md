# Fixture Lotus Archi (lotusarchi.com)

Diambil 17 Nov 2026 ±08.39 WIB dari jaringan lokal (Indonesia) dengan `curl` biasa + User-Agent proyek. Riset: [research/lotusarchi.md](../../../../../plan/research/lotusarchi.md) (P6-01).

| File | Endpoint | Isi | Asli? |
| --- | --- | --- | --- |
| `pricing-2026-11-17.html.gz` | `GET https://lotusarchi.com/pricing/` | HTTP 200 dari Cloudflare (`server: cloudflare`, `cf-cache-status: DYNAMIC`, colo SIN), tanpa halaman tantangan. ±170 KB. Tabel `QTY (GR) \| HARGA JUAL` dan baris bertanggal | Asli, utuh (gzip) |

Catatan:

- Halaman memuat **dua** baris bertanggal: `16 NOVEMBER 2026 || Gold Price /gram : Rp 2.406.000 || Buyback Price : Rp 2.258.000` dan `01 AGUSTUS 2026 || … Rp 2.459.000 || … Rp 2.280.000`. Bulan dalam bahasa Indonesia, huruf besar. Parser P6-09 harus memilih baris yang benar (tanggal terbaru), bukan baris pertama yang cocok begitu saja.
- Pukul 08.39 WIB 17 Nov, halaman masih bertanggal 16 Nov.
- Akses dari runner GitHub (AS) belum terbukti oleh fixture ini; lihat hasil probe P6-01.
