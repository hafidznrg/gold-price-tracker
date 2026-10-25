# Fixture Logam Mulia

Riset P0-09, prototipe `apps/scraper/scripts/prototype-logammulia.ts` (Playwright + `playwright-extra` + stealth, headless). Temuan di [TECH-SPEC §5.3](../../../../../plan/TECH-SPEC.md#53-logam-mulia--antam-logammuliats).

| File | Isi | Asli? |
| --- | --- | --- |
| `maintenance-503-2026-10-25.html` | Respons `GET https://www.logammulia.com/id`, 25 Okt 2026 10.33 WIB: HTTP 503, `Server: AkamaiGHost`, judul `Maintenance`, iframe ke halaman pemberitahuan di S3 ("layanan operasional tutup sementara karena kami sedang mempersiapkan aplikasi versi terbaru") | Asli, utuh |
| `maintenance-503-2026-10-25.log.json` | Log prototipe untuk run di atas (status, durasi, token tidak ditemukan) | Asli |

**Belum ada** fixture respons endpoint jual (`/data-base-price/gold_eai/sell`) dan buyback (`/data-base-price/gold/buy`): seluruh domain sedang maintenance saat riset. Ambil dengan prototipe setelah situs kembali, potong ke ±200 titik terakhir, lalu perbarui tabel ini.
