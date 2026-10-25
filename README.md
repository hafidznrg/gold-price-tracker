# Gold Price Tracker

Platform untuk melihat pergerakan historis harga emas batangan di Indonesia: **harga jual toko**, **harga buyback**, dan **spread** untuk Antam, UBS, dan Galeri24, dibandingkan dengan harga emas dunia (XAU/USD) dan kurs USD/IDR.

Data dikumpulkan otomatis setiap hari oleh GitHub Actions dari logammulia.com, pegadaian.co.id, dan ubslifestyle.com, disimpan sebagai CSV di repository ini (*git-as-database*), lalu disajikan sebagai situs statis di Vercel.

> **Status:** Fase 0 (fondasi & validasi sumber) hampir selesai — monorepo, skema, CI, dan riset sumber beres; Logam Mulia menunggu situsnya kembali dari maintenance. Berikutnya Fase 1 (pipeline harga ritel). Rencana lengkap di [`plan/`](./plan/README.md).

## Dokumentasi

| Dokumen | Isi |
| --- | --- |
| [plan/README.md](./plan/README.md) | Indeks rencana dan urutan fase |
| [plan/PRD.md](./plan/PRD.md) | Kebutuhan produk |
| [plan/TECH-SPEC.md](./plan/TECH-SPEC.md) | Spesifikasi teknis |
| [plan/DATA-MODEL.md](./plan/DATA-MODEL.md) | ERD, kamus data, aturan merge |
| [plan/WORKFLOWS.md](./plan/WORKFLOWS.md) | GitHub Actions dan deploy |
| [plan/DECISIONS.md](./plan/DECISIONS.md) | Log keputusan |

## Catatan data

Harga adalah milik masing-masing penerbit (PT Antam Tbk, PT Pegadaian, PT Untung Bersama Sejahtera). Proyek ini non-komersial dan **bukan rekomendasi investasi**; harga resmi selalu mengacu ke situs penerbit.
