# trigger — pemicu Cloudflare Workers (D-45, D-46)

Cron GitHub Actions di repo ini rutin terlambat 4,5–10 jam. Worker ini memegang semua slot utama:
ia memanggil `workflow_dispatch` tepat waktu (Cron Triggers, paket Free) dengan input `schedule` =
kunci slot di `SCHEDULES`/`WATCHDOG_SCHEDULES`, sehingga `plan`/`watchdog` memperlakukannya seperti
run terjadwal. Cron GitHub tinggal cadangan berslot retry (04.15, 09.15, 16.45 hari kerja,
dan watchdog 23.15 WIB).

| Cron Worker (UTC)                 | WIB                                                     | Dispatch                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20 1,2,4,6,9,10,12,16 * * *` | 08.20, 09.20, 11.20, 13.20, 16.20, 17.20, 19.20, 23.20 | `scrape-retail` (08.20 percobaan awal Logam Mulia; 09.20, 11.20, 13.20, 16.20 retry; 19.20 sapuan primary), `scrape-macro` primary Senin–Jumat 16.20 (Worker menyaring hari), `watchdog` 17.20 (day + midday) dan 23.20 (semua); D-67 |

Setelah `crons` di `wrangler.toml` berubah, Worker harus di-deploy ulang (langkah 4 di bawah).

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
Logs. Di GitHub, run dari Worker berjudul `scrape-retail (cron 20 2 * * *)` dan seterusnya.

Saat token kedaluwarsa, dispatch gagal (HTTP 401): buat token baru lalu ulangi langkah 3.
