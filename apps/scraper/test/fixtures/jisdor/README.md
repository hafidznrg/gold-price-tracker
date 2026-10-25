# Fixture JISDOR (Bank Indonesia)

Diambil 25 Okt 2026 dari `https://www.bi.go.id/id/statistik/informasi-kurs/jisdor/default.aspx` (SharePoint / ASP.NET WebForms), `fetch` biasa + User-Agent proyek. Riset P0-10; temuan di [TECH-SPEC §5.5](../../../../../plan/TECH-SPEC.md#55-usdidr-jisdor-jisdorts).

| File | Isi | Asli? |
| --- | --- | --- |
| `page-2026-10-25.html.gz` | Respons `GET` halaman: tabel 10 hari kerja terakhir (23 Okt → 12 Okt 2026). Nilai `__VIEWSTATE` (±230 KB base64) diganti `[dipotong-fixture]` | Asli, satu atribut dipotong |
| `export-trimmed-2013-2026.xlsx` | Respons postback `ButtonExport` untuk 20/05/2013–24/10/2026 (asli 3.251 baris data, 78 KB): baris judul + header + 5 baris pertama + 5 terakhir; sel tetap teks (`"5/20/2013 12:00:00 AM"`, `"9.760,00"`) | Asli, dipotong dan ditulis ulang dengan SheetJS |

Nilai acuan: 2013-05-20 = 9.760; 2026-10-23 = 18.069.
