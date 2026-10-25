# Fixture xaus.com

Diambil 25 Okt 2026 ±10.55 WIB (Minggu), `curl` biasa + User-Agent proyek, tanpa API key. Riset P0-10; temuan di [TECH-SPEC §5.4](../../../../../plan/TECH-SPEC.md#54-xauusd-xausts).

| File | Endpoint | Isi | Asli? |
| --- | --- | --- | --- |
| `history-last15-2026-10-25.json` | `GET /api/v1/history` | Penutupan harian XAU/USD; metadata utuh (`data_state`, `price_source: "yahoo finance (GC=F)"`), `points` dipotong ke 15 terakhir (asli 1.258 titik, 2021-10-25 → 2026-10-23) | Asli (dipotong) |
| `spot-compact-2026-10-25.json` | `GET /api/v1/spot?compact=1` | Spot (`spot_usd_oz` 3996.899902, `stale: false`, `price_source: "gold-api.com"`) | Asli, utuh |
