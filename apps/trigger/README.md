# trigger — pemicu Cloudflare Workers (D-45)

Cron GitHub Actions di repo ini rutin terlambat 4,5–10 jam. Worker ini memanggil
`workflow_dispatch` tepat waktu (Cron Triggers, paket Free) dengan input `schedule` = cron GitHub
yang ditiru, sehingga `plan`/`watchdog` memperlakukannya seperti run terjadwal. Cron GitHub tetap
aktif sebagai cadangan.

| Cron Worker (UTC) | WIB | Workflow · cron yang ditiru |
| --- | --- | --- |
| `25 3,6 * * *` | 10.25, 13.25 | `scrape-retail` · `25 3` primary, `25 6` retry |
| `5 12,14 * * *` | 19.05, 21.05 | `scrape-retail` · `5 12` primary, `5 14` retry |
| `40 9,11 * * 1-5` | 16.40, 18.40 hari kerja | `scrape-macro` · `40 9` primary, `40 11` retry |
| `50 9,16 * * *` | 16.50, 23.50 | `watchdog` · `50 9` ritel siang, `50 16` semua sumber |

## Deploy (sekali)

1. **Token GitHub.** github.com → Settings → Developer settings → Fine-grained tokens → Generate:
   Repository access = hanya `gold-price-tracker`; Permissions → Actions = **Read and write**
   (Metadata read-only otomatis). Pilih masa berlaku, lalu catat tanggal kedaluwarsanya.
2. **Login Cloudflare** (akun gratis), dari folder ini:

   ```bash
   pnpm dlx wrangler login
   ```

3. **Simpan secret** (ditanyakan interaktif, tidak tersimpan di repo):

   ```bash
   pnpm dlx wrangler secret put GITHUB_TOKEN
   ```

   Opsional, kabar Telegram bila dispatch gagal: `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID`
   (nilai sama dengan secret GitHub repo).

4. **Deploy:**

   ```bash
   pnpm dlx wrangler deploy
   ```

Cek: dashboard Cloudflare → Workers → `gold-price-trigger` → Settings → Triggers (4 cron) dan
Logs. Di GitHub, run dari Worker berjudul `scrape-retail (cron 25 3 * * *)` dan seterusnya.

Saat token kedaluwarsa, dispatch gagal (HTTP 401): buat token baru lalu ulangi langkah 3.
