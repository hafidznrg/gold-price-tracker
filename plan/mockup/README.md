# Mockup Web — acuan visual Fase 3–4

Mockup interaktif seluruh halaman web. Dipakai sebagai **acuan tampilan dan struktur** saat membangun `apps/web`; bukan kode produksi.

- **Lihat versi hidup:** <https://claude.ai/artifact/Ny1QXsGC6h3AT82mrpefrb> (kanvas Design, tekan Play untuk mencoba navigasi, tema, dan kontrol).
- **Sumber di folder ini:** satu file `*.dc.html` per halaman. File ini memerlukan runtime kanvas (`support.js`) untuk dirender, jadi baca sebagai referensi markup, bukan untuk dibuka langsung di browser.
- **Bila bertentangan:** PRD, DATA-MODEL, dan DECISIONS yang menang. Mockup mengatur tampilan, bukan aturan data (D-34).
- **Adegan mockup:** Jumat 30 Okt 2026, 21.10 WIB (setelah snapshot malam Pegadaian).
- **Revisi 17 Nov 2026:** diselaraskan dengan design system Momen Emas (D-50–D-62): nama dan logo baru, tema Terang bawaan + Navy, header/menu bawah/footer baru, skala tipografi, warna seri dan konvensi grafik. `Main.dc.html` (legacy) tidak diubah.
- **Revisi 17 Nov 2026:** diselaraskan dengan situs live (D-55, D-56, D-60, D-61): Kalkulator (harga beli bisa diubah, berat lain, pasangan buyback sah), Riwayat harga (isi celah bawaan, pita min–maks, panel 320 px, popover Sumber), Beranda (keterangan jenis harga, matriks 16 gramasi, popover Catatan), Spread (rentang kustom, akhiran pilihan, pasangan dinamis), Bandingkan (rentang, 12 gramasi, Sumber & catatan, penjelasan premi), Data (satu tombol "Unduh data", jumlah baris). Nama halaman "Riwayat harga" dipertahankan.
- **Revisi Fase 6 (17 Nov 2026):** sumber baru Galeri24 (jual **dan** buyback untuk Antam, UBS, Galeri24, Lotus Archi, plus buyback Antam non-Pegadaian), brand baru Lotus Archi (warna `--lotus`), dan Lotus Archi di Pegadaian (hanya jual). Semua halaman kecuali `Main.dc.html` (legacy) diperbarui; adegan tetap 30 Okt 2026.

## Cara membaca file `.dc.html`

| Bagian | Isi |
| --- | --- |
| `<helmet><style>` | Token tema (`.t-dark` = Navy, `.t-light` = Terang) sebagai CSS variable, font, kelas dasar, dan aturan responsif header/menu bawah/footer |
| Markup di dalam `<x-dc>` | Struktur halaman. `{{nama}}` = nilai dari `renderVals()`; `<sc-for>` = perulangan; `<sc-if>` = kondisi |
| `<script type="text/x-dc">` | `renderVals()` membangkitkan **data ilustrasi** (random walk ber-seed) dan path SVG grafik. Jangan disalin ke produksi; produksi memakai ECharts (D-05) dan data dari `public/data/*.json` |

## Halaman

| File | Rute | Kebutuhan | Fase | Isi utama |
| --- | --- | --- | --- | --- |
| `Main-v2.dc.html` | `/` | FR-20, FR-26 | 4, 6 | **Acuan beranda sejak D-43.** Tombol status "Diperbarui …" yang bisa dibuka, 5 kartu ringkas di hero (Antam, UBS, Galeri24, Lotus Archi, Tabungan Emas; ⓘ untuk catatan sumber), baris spot ringkas, matriks Bandingkan per gramasi (5 kolom, 16 gramasi 0,05–1.000 g dengan "—" bila sumber tidak punya; jual/buyback/Spread, per keping/per gram, penanda termurah + legenda, popover Catatan); kartu memuat keterangan jenis harga, grafik tren 1 g 7H–1T + statistik, edukasi + FAQ (termasuk dua harga buyback Antam di Galeri24), tema terang default |
| `Main.dc.html` | `/` (sebelum D-43) | FR-20, FR-26 | 3 | Kartu spot dunia (XAU/USD, JISDOR, Rp/gram spot, premi Antam), chip umur data per sumber, filter Semua / Emas fisik / Tabungan emas, kartu per brand (jual, buyback, spread, perubahan, sparkline 30 hari), tabel semua gramasi dengan tab per sumber × brand (Logam Mulia 12 gramasi, buyback hanya 1 g) dan pilihan tahun produksi UBS |
| `Explorer.dc.html` | `/explorer` | FR-21, FR-24, FR-25, FR-27, FR-28, FR-35 | 3–4, 6 | Panel series aktif + tambah series (produk, brand termasuk Lotus Archi, sumber termasuk Galeri24, gramasi, jenis harga; contoh seri buyback Galeri24 sejak Feb 2024), mode nilai, agregasi (harga penutupan periode), isi celah (aktif bawaan), pita min–maks, pilihan rentang + kustom, grafik multi-series dengan tooltip, seri yang mulai belakangan, dan celah berarsir (24–25 Okt 2026), navigator rentang, kartu nilai terakhir, popover Sumber, ringkasan rentang (Awal/Akhir/Terendah/Tertinggi). Panel 320 px di kiri |
| `Spread.dc.html` | `/spread` | FR-22, FR-29 | 3–4, 6 | Pemilih pasangan beli di A → jual ke B (hanya pasangan sah, akhiran "· tanpa buyback"/"· produksi 2026", rentang 7H–Semua + kustom, popover Sumber; termasuk Galeri24 dan buyback Antam non-Pegadaian, dengan catatan kapan yang normal berlaku), KPI (spread hari ini, rata-rata, tersempit, titik impas), band jual–buyback, spread % (Antam LM vs Tabungan Emas), bar spread % per gramasi, kartu emas fisik vs tabungan, kartu pasangan lintas sumber |
| `Data.dc.html` | `/data` | FR-23 | 3, 6 | Hanya unduhan: kartu per seri (harga ritel termasuk Galeri24 dan Antam non-Pegadaian, serta pembanding dunia) dengan **data terakhir** (tanggal/jam, nilai terakhir, umur), rentang awal–akhir, jumlah baris, dan satu tombol "Unduh data" (pilihan CSV/JSON). Status sumber, API, dan kamus kolom sengaja tidak ditampilkan |
| `Bandingkan.dc.html` | `/bandingkan` | FR-30, FR-33 | 4, 6 | Pilihan gramasi (12 chip) dan mode (per gram / indeks), rentang 7H–Semua + kustom, grafik 7 seri (termasuk Galeri24 dan Lotus Archi dari sumber Galeri24; Pegadaian bergaris putus), tabel hari ini diurutkan dari per gram termurah, premi Antam vs spot sejak 2010 + penjelasan komponen premi |
| `Kalkulator.dc.html` | `/kalkulator` | FR-31 | 4, 6 | Form beli (tanggal, sumber termasuk Galeri24 dan Lotus Archi, gramasi 0,5–1.000 g + Berat lain, jumlah, total harga beli yang bisa diubah) dan jual (hanya pasangan buyback sah, tanpa harga di label; Galeri24 normal dan non-Pegadaian), hasil untung/rugi + CAGR + titik impas, grafik buyback sejak tanggal beli dengan area untung |
| `Kelipatan.dc.html` | `/kelipatan` | FR-32 | 4 | Judul kelipatan + CAGR otomatis, pilihan tahun dasar dan agregasi, opsi garis Antam LM, grafik log ×1/×2/×5…, anotasi peristiwa, garis putus ke titik spot hari ini, tabel tahunan dengan sumber yang dipakai (resolusi frekuensi DATA-MODEL §6.3) |

Belum dimockup: halaman **Kualitas data** (`/kualitas`, FR-36, Fase 5) dan tata letak ponsel terpisah. Semua halaman dibuat fluid (tumpuk di bawah ±640 px, tabel lebar bergulir horizontal) dan harus lolos NFR-09 di 360 px.

## Token desain (design system Momen Emas, D-50–D-62)

Sumber acuan: artifact design system <https://claude.ai/artifact/DRfn5KsJiX5HK2Ts99b5Ww>; nilai persisnya sama dengan `apps/web/app/globals.css`. Nama produk **Momen Emas**, tagline "Temukan momen terbaik membeli emas".

**Tema:** Terang (bawaan, `.t-light`) dan Navy (`.t-dark`), tombol tema di header (HP: di menu "Lainnya"). Kelas tema dipasang di akar lewat `{{themeClass}}`; `renderVals()` memakai tema terang bila belum dipilih.

**Tipografi:** Instrument Serif 400 untuk judul dan angka besar, Inter 400/500/600/700 untuk UI. Angka selalu `font-variant-numeric: tabular-nums`. Hanya skala ini yang dipakai:

| Peran | Ukuran |
| --- | --- |
| Judul halaman (serif) | 46/1,05 (HP 38) |
| Judul besar (serif) | 38 |
| Judul seksi (serif) | 32/1,15 (HP 26) |
| Angka besar (serif) | 60 (HP 44) |
| Tagline (serif miring) | 22 |
| Inter | 20/600 · 18/600 · 16 · 14 · 12 |
| Eyebrow | 12/600 kapital, `letter-spacing .16em` |
| Label kecil 2xs | 11/600 kapital, `letter-spacing .12em` |

Miring hanya untuk "Emas" di wordmark dan tagline; aksen emas di judul memakai warna, bukan miring. Pengecualian yang menyalin aplikasi: angka harga di kartu/KPI 30 px (`price-card.tsx`).

**Warna** (CSS variable):

| Token | Navy (`.t-dark`) | Terang (`.t-light`) | Pemakaian |
| --- | --- | --- | --- |
| `--bg` | `#0F1A2B` | `#F7F5F0` | Latar halaman |
| `--surface` / `--surface2` | `#16233A` / `#1D2C46` | `#FFFFFF` / `#F0EFEA` | Kartu, footer / isian, sel tooltip, kotak catatan |
| `--hero` | `#14223A` | `#EFECE4` | Latar hero beranda |
| `--line` / `--grid` | `#2B3B57` / `#213049` | `#E1DFD8` / `#ECEAE4` | Garis tepi / gridline horizontal grafik (1 px) |
| `--text` / `--muted` / `--faint` | `#EDEAE3` / `#ABB0B8` / `#8E96A3` | `#15171C` / `#55575E` / `#686A71` | Teks, label sumbu 12 px `--faint` (lolos kontras AA) |
| `--gold` | `#DDB563` | `#8A6618` | Aksen, wordmark "Emas", tautan |
| `--gold-strong` | `#DDB563` | `#7D5C14` | Teks emas di atas `--goldsoft` atau `--hero` (menu/chip/segmen aktif, tanggal dan tagline beranda, label nilai terbaik) |
| `--gold-glint` | `#F0CF7E` | `#A67C1E` | Penanda penting di grafik (dengan cincin `--surface`) |
| `--goldsoft` / `--goldline` | `rgba(221,181,99,.13)` / `rgba(221,181,99,.38)` | `rgba(176,132,40,.12)` / `rgba(138,102,24,.35)` | Latar aktif, sorotan nilai terbaik, band/area di grafik / garis tepi emas |
| `--up` / `--down` | `#6CC59A` / `#F28C6C` | `#1E7A4E` / `#B4442A` | Naik / turun, selalu bersama ▲/▼ dan tanda +/− |
| `--antam` | `#E6C27A` | `#A67C1E` | Seri Antam (juga spread Antam LM) |
| `--ubs` | `#7EA8FF` | `#2F64D6` | Seri UBS |
| `--g24` | `#D8603C` | `#9C3220` | Seri Galeri24 |
| `--tab` | `#5FD0B8` | `#0F7F6C` | Tabungan Emas |
| `--spot` | `#EDEAE3` | `#15171C` | Seri non-brand (XAU/USD, Rp/gram spot, kurs, premi, garis Kelipatan) |
| `--navy` | `#0F1A2B` | `#0F1A2B` | Navy tetap, untuk elemen merek |
| `--logo-bar-top` / `--logo-bar-base` | `#F1D18A` / `#D6AA52` | `#A67C1E` / `#A67C1E` | Batang logo (gradasi di Navy, rata di Terang) |
| `--logo-arrow-start` / `--logo-arrow-end` | `#B4842E` / `#F0CF7E` | `#7A5A14` / `#7A5A14` | Panah logo |
| `--btn` / `--btntext` | `#EDEAE3` / `#0F1A2B` | `#15171C` / `#FFFFFF` | Tombol/segmen terpilih |
| `--lotus` | `#C59BF0` | `#7A4BB5` | Lotus Archi (Fase 6). **Belum di design system** (hanya ada di mockup); kontras terhadap `--surface` 6,98:1 (Navy) / 6,00:1 (Terang), terhadap `--bg` 7,75:1 / 5,51:1 |

**Bentuk:** radius kartu 22 px, kartu kecil 18 px, kontrol 12 px, isian 10 px, pil 999 px. Lebar konten maks. 1240 px, padding samping 32 px (18 px di HP). Target sentuh ≥ 44 px (menu bawah dan tombol HP). Fokus: outline 2 px `--gold`, offset 2 px.

## Kerangka halaman (header, menu bawah, footer)

Sama di semua halaman, hanya item aktif yang berbeda; menyalin `site-header.tsx`, `site-nav.tsx`, `bottom-nav.tsx`, `brand-mark.tsx`, `theme-toggle.tsx`, `site-footer.tsx`, dan `data-status-chip.tsx` di `apps/web`. Aturan responsif ditulis sebagai kelas CSS di `<helmet><style>` (gaya sebaris tidak bisa memuat media query).

- **Header (≥ 640 px):** logo "Batang Berpanah" 26 px (SVG sebaris, warna dari token `--logo-*`, celah memakai `--bg`) + wordmark "Momen" serif warna teks dan "*Emas*" serif miring warna emas 20 px; di ≥ 1536 px ada baris kecil "Antam · UBS · Galeri24". Tab navigasi (Hari ini, Riwayat harga, Spread, Bandingkan, Kalkulator, Kelipatan, Data) berbentuk pil, tinggi 40 px (36 px di ≥ 1280 px); tab aktif berlatar `--goldsoft`, teks `--gold-strong` 600, `aria-current="page"`. Di ≥ 1280 px satu baris (merek, tab, status); di bawahnya dua baris. Chip status data ("● Data 30 Okt 2026 · 21.10 WIB") dan tombol tema 40×40 px (ikon bulan di Terang, matahari di Navy; `role="switch"`).
- **HP (< 640 px):** header satu baris 55 px (logo 22 px + wordmark 18 px + chip tanggal), tab dan tombol tema disembunyikan; menu bawah tetap setinggi 64 px dengan ikon + label: Hari ini, Riwayat, Spread, Bandingkan, Lainnya. "Lainnya" membuka panel berisi Kalkulator, Kelipatan, Data, dan sakelar "Mode gelap".
- **Footer:** latar `--surface`, empat bagian: merek (logo + wordmark ke beranda, tagline serif miring "Temukan momen terbaik membeli emas", deskripsi singkat, tombol repo GitHub), "Jelajahi" (semua halaman), "Sumber data" dalam dua daftar (Harga emas Indonesia: Logam Mulia, UBS Lifestyle, Galeri24, Pegadaian; Pembanding dunia dan kurs), dan "Catatan" di kotak `--surface2` ("Bukan rekomendasi investasi." tebal, catatan PPh 22, Harga Dasar Logam Mulia, harga dunia indikatif). Baris bawah: © 2026 Momen Emas, lisensi kode MIT, stempel build. Desktop 4 kolom, tablet 2×2, HP bertumpuk.
- **`<title>`:** beranda "Momen Emas · Temukan momen terbaik membeli emas"; halaman lain "<Halaman> · Momen Emas" (Riwayat harga, Spread, Bandingkan, Kalkulator, Kelipatan, Data).
- **Beranda:** eyebrow tanggal dan tagline 22 px serif miring memakai `--gold-strong` di atas `--hero`; lead ditutup "Bukan rekomendasi investasi."

## Konvensi tampilan

- **Warna arah, bukan baik/buruk:** hijau = naik, merah = turun (konvensi pasar Indonesia). Pengecualian: untung/rugi di Kalkulator. Spread memakai emas (netral).
- **Nilai terbaik di tabel** (termurah, buyback tertinggi, spread terkecil): latar `--goldsoft`, tebal, label `--gold-strong`; tidak pernah memakai warna naik/turun.
- **Grafik:** warna brand hanya untuk brand (Antam, UBS, Galeri24, Lotus Archi, Tabungan Emas); seri non-brand (XAU/USD, Rp/gram spot, kurs, premi, garis Kelipatan) memakai `--spot` solid, lalu `--spot` putus-putus, lalu `--muted` solid; `--gold` tidak pernah menjadi warna seri. Spread Antam LM memakai `--antam`. Garis utama 2,2 px; putus-putus 1,8 px pola "5 4" untuk buyback, brand yang dijual di Pegadaian, dan garis acuan. Garis acuan (rata-rata, impas, modal) `--muted`. Penanda penting `--gold-glint` dengan cincin `--surface`. Hanya gridline horizontal (`--grid`, 1 px); label sumbu 12 px `--faint`. Band dan area (jual–buyback, area untung) `--goldsoft`. Legenda memakai contoh garis dan nama seri lengkap.
- **Garis:** solid = harga jual / sumber resmi; putus-putus = buyback (Explorer, Spread, Kalkulator) atau harga di Pegadaian (Bandingkan).
- **Data kosong ditampilkan jujur:** buyback batangan Pegadaian (termasuk Lotus Archi) = "—" / "Tidak ditampilkan sumber" (D-07); buyback Galeri24 kini ditampilkan untuk semua gramasinya (Antam punya dua: normal dan non-Pegadaian, hanya buyback); buyback Logam Mulia selain 1 g = "—" (D-26); celah hari tanpa data = area berarsir + label, bukan garis tersambung (FR-35); seri yang lebih pendek mulai dari tanggal pertamanya.
- **Atribusi** sumber + waktu update di setiap tampilan harga; disclaimer dan catatan PPh 22 di footer (FR-26).

## Pemetaan ke data nyata

Semua angka di mockup **ilustrasi**. Saat membangun, pakai data dan ID dari DATA-MODEL:

| Di mockup | Di data |
| --- | --- |
| Tabungan Emas Pegadaian, ditampilkan per gram | `source=pegadaian`, `brand=pegadaian`, `product=gold_savings`, `weight_g=0.01`; harga disimpan per 0,01 g (D-30). Tampilan per gram = harga ÷ `weight_g` |
| Waktu update per sumber | Dari `source_updated_at` / `status.json`. Pegadaian = waktu terbit harga (`idHarga`/`id`, mis. ±10.06–10.30 WIB), ditampilkan "harga terbit …"; jam snapshot ±18.32 di mockup tidak dipakai (D-25); UBS Lifestyle tidak punya jam yang dapat dipercaya, tampilkan tanggal saja (D-19); Logam Mulia dari "Terakhir diperbarui" (D-26) |
| Logam Mulia: "Harga dasar", 12 gramasi, buyback hanya 1 g | D-24/D-26: `sell_price` = Harga Dasar tanpa PPh 0,25%, `buyback_price` hanya 1 g |
| Cakupan histori (Explorer apa adanya) | Antam LM 1 g jual sejak Jan 2010 & buyback sejak Nov 2015 (arsip, D-29), celah 24–25 Okt 2026; buyback UBS 1 g sejak Nov 2023 dengan celah sumber, `variant=''` (D-28); Tabungan Emas 360 hari (D-30); sisanya sejak 26 Okt 2026. Seri pendek mulai dari tanggal pertamanya. Grafik 1 tahun di Bandingkan/Spread masih ilustrasi |
| Galeri24 (sumber) | `source=galeri24`; brand `antam`/`ubs`/`galeri24`/`lotusarchi`, jual dan buyback. Histori sejak 1 Feb 2024 dengan celah sumber (semua brand 9–13 Mar 2024 dan 25–29 Apr 2024; Antam juga 25 Jun–1 Agt 2025). Terbit sekali sehari, ditampilkan "harga terbit <tanggal>" |
| Buyback Antam non-Pegadaian | Seri terpisah di `source=galeri24`, `brand=antam`, `variant=non_pegadaian`, hanya buyback, lebih rendah ±1–1,5% dari buyback normal (keping yang dibeli di luar Pegadaian/Galeri24) |
| Lotus Archi di Pegadaian | `source=pegadaian`, `brand=lotusarchi`, hanya jual, sejak Okt 2026 |
| Seri UBS buyback backfill vs harian | Dua seri berbeda (`variant=''` vs `variant=YYYY`); tampilan menyambungkannya secara eksplisit (D-28) |
| Kunci series di URL Explorer (`lm.antam.1.sell`, …) | Contoh saja; format final ditentukan saat P3-06 |
| Angka kelipatan Kelipatan (×80, ×10,3, ×7,7) | Dihitung dari data nyata lewat `derive.ts` (D-31); kurs 1996–1998 dari WDI, 1996 = 2.342,30 (D-33). Mockup memakai kurs 2026 ±18.000 (JISDOR 23 Okt 2026 = 18.069, TECH-SPEC §5.5), sejalan dengan target cek silang P2-12 |
| Kurs dan Rp/gram spot di Hari ini | Mockup: JISDOR 18.069 → spot ±Rp2.396.500/g, premi Antam ±4,8%. Contoh `spot.json` di DATA-MODEL §3.3 (16.310) hanya ilustrasi format |
| Spot dunia | Histori xaus = futures GC=F, spot = gold-api.com; keduanya diberi label indikatif (D-21) |
| Tab dan kolom tabel Hari ini | Dari `config/catalog.yml`; jangan hardcode daftar gramasi |
