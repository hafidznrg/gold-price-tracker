# Fixture Logam Mulia

Riset P0-09, prototipe `apps/scraper/scripts/prototype-logammulia.ts` (Playwright + `playwright-extra` + stealth, headless). Temuan di [TECH-SPEC §5.3](../../../../../plan/TECH-SPEC.md#53-logam-mulia--antam-logammuliats).

| File | Isi | Asli? |
| --- | --- | --- |
| `maintenance-503-2026-10-25.html` | Respons `GET https://www.logammulia.com/id`, 25 Okt 2026 10.33 WIB: HTTP 503, `Server: AkamaiGHost`, judul `Maintenance`, iframe ke halaman pemberitahuan di S3 ("layanan operasional tutup sementara karena kami sedang mempersiapkan aplikasi versi terbaru") | Asli, utuh |
| `maintenance-503-2026-10-25.log.json` | Log prototipe untuk run di atas (status, durasi, token tidak ditemukan) | Asli |

| `harga-emas-2026-10-26-text.txt` | Teks tampilan `https://logammulia.com/harga-emas` versi baru, 26 Okt 2026 09.55 WIB (Playwright + stealth, sebelum dihentikan — D-24): "Terakhir diperbarui: Senin, 26 Oktober 2026 \| 07:58 WIB", tabel Emas Batangan 12 gramasi (Harga Dasar / +PPh 0,25%), perak, Gift Series, produk tematik | Asli (teks saja) |

**Situs versi baru (26 Okt 2026):** endpoint lama tidak ada lagi; API `api.logammulia.com` terenkripsi; tanpa stealth dijawab Akamai "Access Denied". Lihat TECH-SPEC §5.3 dan D-24.

**Tidak ada** fixture respons endpoint jual (`/data-base-price/gold_eai/sell`) dan buyback (`/data-base-price/gold/buy`): seluruh domain sedang maintenance saat riset. Ambil dengan prototipe setelah situs kembali, potong ke ±200 titik terakhir, lalu perbarui tabel ini.
