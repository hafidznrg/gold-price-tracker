# Mockup Web — acuan visual Fase 3–4

Mockup interaktif seluruh halaman web. Dipakai sebagai **acuan tampilan dan struktur** saat membangun `apps/web`; bukan kode produksi.

- **Lihat versi hidup:** <https://claude.ai/artifact/Ny1QXsGC6h3AT82mrpefrb> (kanvas Design, tekan Play untuk mencoba navigasi, tema, dan kontrol).
- **Sumber di folder ini:** satu file `*.dc.html` per halaman. File ini memerlukan runtime kanvas (`support.js`) untuk dirender, jadi baca sebagai referensi markup, bukan untuk dibuka langsung di browser.
- **Bila bertentangan:** PRD, DATA-MODEL, dan DECISIONS yang menang. Mockup mengatur tampilan, bukan aturan data (D-34).
- **Adegan mockup:** Jumat 30 Okt 2026, 21.10 WIB (setelah snapshot malam Pegadaian).

## Cara membaca file `.dc.html`

| Bagian | Isi |
| --- | --- |
| `<helmet><style>` | Token tema (`.t-dark`, `.t-light`) sebagai CSS variable, font, kelas dasar |
| Markup di dalam `<x-dc>` | Struktur halaman. `{{nama}}` = nilai dari `renderVals()`; `<sc-for>` = perulangan; `<sc-if>` = kondisi |
| `<script type="text/x-dc">` | `renderVals()` membangkitkan **data ilustrasi** (random walk ber-seed) dan path SVG grafik. Jangan disalin ke produksi; produksi memakai ECharts (D-05) dan data dari `public/data/*.json` |

## Halaman

| File | Rute | Kebutuhan | Fase | Isi utama |
| --- | --- | --- | --- | --- |
| `Main.dc.html` | `/` | FR-20, FR-26 | 3 | Kartu spot dunia (XAU/USD, JISDOR, Rp/gram spot, premi Antam), chip umur data per sumber, filter Semua / Emas fisik / Tabungan emas, kartu per brand (jual, buyback, spread, perubahan, sparkline 30 hari), tabel semua gramasi dengan tab per sumber × brand (Logam Mulia 12 gramasi, buyback hanya 1 g) dan pilihan tahun produksi UBS |
| `Explorer.dc.html` | `/explorer` | FR-21, FR-24, FR-25, FR-27, FR-28, FR-35 | 3–4 | Panel series aktif + tambah series (produk, brand, sumber, gramasi, jenis harga), mode nilai, agregasi, isi celah, pilihan rentang + kustom, grafik multi-series dengan tooltip, seri yang mulai belakangan, dan celah berarsir (24–25 Okt 2026), navigator rentang, tautan konfigurasi (URL), ringkasan rentang |
| `Spread.dc.html` | `/spread` | FR-22, FR-29 | 3–4 | Pemilih pasangan beli di A → jual ke B, KPI (spread hari ini, rata-rata, tersempit, titik impas), band jual–buyback, spread % (Antam LM vs Tabungan Emas), bar spread % per gramasi, kartu emas fisik vs tabungan, kartu pasangan lintas sumber |
| `Data.dc.html` | `/data` | FR-23 | 3 | Hanya unduhan: kartu per seri (harga ritel dan pembanding dunia) dengan **data terakhir** (tanggal/jam, nilai terakhir, umur) dan tombol CSV/JSON. Status sumber, API, dan kamus kolom sengaja tidak ditampilkan |
| `Bandingkan.dc.html` | `/bandingkan` | FR-30, FR-33 | 4 | Pilihan gramasi dan mode (per gram / indeks), grafik 6 seri (Pegadaian bergaris putus), tabel hari ini diurutkan dari per gram termurah, premi Antam vs spot sejak 2010 + penjelasan komponen premi |
| `Kalkulator.dc.html` | `/kalkulator` | FR-31 | 4 | Form beli (tanggal, sumber, gramasi, jumlah) dan jual, hasil untung/rugi + CAGR + titik impas, grafik buyback sejak tanggal beli dengan area untung |
| `Kelipatan.dc.html` | `/kelipatan` | FR-32 | 4 | Judul kelipatan + CAGR otomatis, pilihan tahun dasar dan agregasi, opsi garis Antam LM, grafik log ×1/×2/×5…, anotasi peristiwa, garis putus ke titik spot hari ini, tabel tahunan dengan sumber yang dipakai (resolusi frekuensi DATA-MODEL §6.3) |

Belum dimockup: halaman **Kualitas data** (`/kualitas`, FR-36, Fase 5) dan tata letak ponsel terpisah. Semua halaman dibuat fluid (tumpuk di bawah ±640 px, tabel lebar bergulir horizontal) dan harus lolos NFR-09 di 360 px.

## Token desain

**Tipografi:** Instrument Serif (judul, angka besar Kalkulator) + Inter 400/500/600/700 (UI, angka). Angka selalu `font-variant-numeric: tabular-nums`. Label kecil kapital: 11–12 px, `letter-spacing .12–.16em`.

**Warna** (CSS variable; tema gelap default, tombol tema di header):

| Token | Gelap | Terang | Pemakaian |
| --- | --- | --- | --- |
| `--bg` | `#0E0F12` | `#F4F4F1` | Latar halaman |
| `--surface` / `--surface2` | `#16181D` / `#1D2027` | `#FFFFFF` / `#F0EFEA` | Kartu / isian, sel tooltip |
| `--line` / `--grid` | `#2A2E37` / `#22252D` | `#E1DFD8` / `#ECEAE4` | Garis tepi / gridline grafik |
| `--text` / `--muted` / `--faint` | `#EDEAE3` / `#ABABA4` / `#8E9097` | `#15171C` / `#55575E` / `#686A71` | Teks (semua lolos kontras AA) |
| `--gold` | `#DDB563` | `#8A6618` | Aksen, tab aktif, spread, premi |
| `--up` / `--down` | `#6CC59A` / `#F28C6C` | `#1E7A4E` / `#B4442A` | Naik / turun, selalu bersama ▲/▼ dan tanda +/− |
| `--antam` / `--ubs` / `--g24` / `--tab` | `#DDB563` / `#7EA8FF` / `#EE8A60` / `#5FD0B8` | `#B8892B` / `#2F64D6` / `#C4562E` / `#0F7F6C` | Warna seri per brand; Tabungan Emas = `--tab` |

**Bentuk:** radius kartu 18–22 px, kontrol 10–12 px, chip/pil 999 px. Lebar konten maks. 1240 px, padding samping 32 px (18 px di ponsel). Target sentuh ≥ 44 px.

## Konvensi tampilan

- **Warna arah, bukan baik/buruk:** hijau = naik, merah = turun (konvensi pasar Indonesia). Pengecualian: untung/rugi di Kalkulator. Spread memakai emas (netral).
- **Garis:** solid = harga jual / sumber resmi; putus-putus = buyback (Explorer) atau harga di Pegadaian (Bandingkan).
- **Data kosong ditampilkan jujur:** buyback batangan Pegadaian = "—" / "Tidak ditampilkan sumber" (D-07); buyback Logam Mulia selain 1 g = "—" (D-26); celah hari tanpa data = area berarsir + label, bukan garis tersambung (FR-35); seri yang lebih pendek mulai dari tanggal pertamanya.
- **Atribusi** sumber + waktu update di setiap tampilan harga; disclaimer dan catatan PPh 22 di footer (FR-26).

## Pemetaan ke data nyata

Semua angka di mockup **ilustrasi**. Saat membangun, pakai data dan ID dari DATA-MODEL:

| Di mockup | Di data |
| --- | --- |
| Tabungan Emas Pegadaian, ditampilkan per gram | `source=pegadaian`, `brand=pegadaian`, `product=gold_savings`, `weight_g=0.01`; harga disimpan per 0,01 g (D-30). Tampilan per gram = harga ÷ `weight_g` |
| Waktu update per sumber | Dari `source_updated_at` / `status.json`. Pegadaian = waktu terbit harga (`idHarga`/`id`, mis. ±10.06–10.30 WIB), ditampilkan "harga terbit …"; jam snapshot ±18.32 di mockup tidak dipakai (D-25); UBS Lifestyle tidak punya jam yang dapat dipercaya, tampilkan tanggal saja (D-19); Logam Mulia dari "Terakhir diperbarui" (D-26) |
| Logam Mulia: "Harga dasar", 12 gramasi, buyback hanya 1 g | D-24/D-26: `sell_price` = Harga Dasar tanpa PPh 0,25%, `buyback_price` hanya 1 g |
| Cakupan histori (Explorer apa adanya) | Antam LM 1 g jual sejak Jan 2010 & buyback sejak Nov 2015 (arsip, D-29), celah 24–25 Okt 2026; buyback UBS 1 g sejak Nov 2023 dengan celah sumber, `variant=''` (D-28); Tabungan Emas 360 hari (D-30); sisanya sejak 26 Okt 2026. Seri pendek mulai dari tanggal pertamanya. Grafik 1 tahun di Bandingkan/Spread masih ilustrasi |
| Seri UBS buyback backfill vs harian | Dua seri berbeda (`variant=''` vs `variant=YYYY`); tampilan menyambungkannya secara eksplisit (D-28) |
| Kunci series di URL Explorer (`lm.antam.1.sell`, …) | Contoh saja; format final ditentukan saat P3-06 |
| Angka kelipatan Kelipatan (×80, ×10,3, ×7,7) | Dihitung dari data nyata lewat `derive.ts` (D-31); kurs 1996–1998 dari WDI, 1996 = 2.342,30 (D-33). Mockup memakai kurs 2026 ±18.000 (JISDOR 23 Okt 2026 = 18.069, TECH-SPEC §5.5), sejalan dengan target cek silang P2-12 |
| Kurs dan Rp/gram spot di Hari ini | Mockup: JISDOR 18.069 → spot ±Rp2.396.500/g, premi Antam ±4,8%. Contoh `spot.json` di DATA-MODEL §3.3 (16.310) hanya ilustrasi format |
| Spot dunia | Histori xaus = futures GC=F, spot = gold-api.com; keduanya diberi label indikatif (D-21) |
| Tab dan kolom tabel Hari ini | Dari `config/catalog.yml`; jangan hardcode daftar gramasi |
