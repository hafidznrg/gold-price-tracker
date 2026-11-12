# trigger — pemicu Cloudflare Workers (D-45, D-46)

Cron GitHub Actions di repo ini rutin terlambat 4,5–10 jam. Worker ini memegang semua slot utama:
ia memanggil `workflow_dispatch` tepat waktu (Cron Triggers, paket Free) dengan input `schedule` =
kunci slot di `SCHEDULES`/`WATCHDOG_SCHEDULES`, sehingga `plan`/`watchdog` memperlakukannya seperti
run terjadwal. Cron GitHub tinggal cadangan berslot retry (04.15, 09.15, 19.15, 16.45 hari kerja,
dan watchdog 23.15 WIB).

| Cron Worker (UTC)        | WIB                                | Dispatch                                                         |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------------- |
| `5 2,5,6,12,15,16 * * *` | 09.05, 12.05, 13.05, 19.05, 22.05, 23.05 | `scrape-retail` primary/retry siang, `watchdog` siang, `scrape-retail` primary/retry malam, `watchdog` semua |
| `40 9 * * MON-FRI`       | 16.40 hari kerja                   | `scrape-macro` primary                                           |

Hari-minggu memakai nama hari: di Cloudflare `1` = Minggu, bukan Senin.

## Deploy (sekali)

1. **Token GitHub.** github.com → Settings → Developer settings → Fine-grained tokens → Generate:
   Repository access = hanya `gold-price-tracker`; Permissions → Actions = **Read and write**
   (Metadata read-only otomatis). Pilih masa berlaku, lalu catat tanggal kedaluwarsanya.
2. **Login Cloudflare** (akun gratis), dari folder ini:

   ```bash
   corepack pnpm dlx wrangler login
   ```

3. **Simpan secret** (ditanyakan interaktif, tidak tersimpan di repo):

   ```bash
   corepack pnpm dlx wrangler secret put GITHUB_TOKEN
   ```

   Opsional, kabar Telegram bila dispatch gagal: `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID`
   (nilai sama dengan secret GitHub repo).

4. **Deploy:**

   ```bash
   corepack pnpm dlx wrangler deploy
   ```

Cek: dashboard Cloudflare → Workers → `gold-price-trigger` → Settings → Trigger events (2 cron) dan
Logs. Di GitHub, run dari Worker berjudul `scrape-retail (cron 5 2 * * *)` dan seterusnya.

Saat token kedaluwarsa, dispatch gagal (HTTP 401): buat token baru lalu ulangi langkah 3.
