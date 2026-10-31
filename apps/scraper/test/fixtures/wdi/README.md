# Fixture World Bank WDI (kurs resmi tahunan)

Diambil 1 Nov 2026 dari `GET https://api.worldbank.org/v2/country/IDN/indicator/PA.NUS.FCRF?format=json&date=1996:1998&per_page=50` (indikator *Official exchange rate, LCU per US$, period average*; sumber WDI = IMF IFS, `lastupdated` 2026-10-08). Riset P2-10 / Q-3; keputusan di [DECISIONS D-33](../../../../../plan/DECISIONS.md).

| File | Isi | Asli? |
| --- | --- | --- |
| `pa-nus-fcrf-idn-1996-1998.json` | Respons utuh: `[meta, [observasi 1998, 1997, 1996]]` | Asli |

Nilai acuan: 1996 = 2342,296…; 1997 = 2909,38; 1998 = 10013,6225 (Rp/US$). Pembanding OECD MEI (`DF_FINMARK`, `IDN.A.CC`): 2327,09 / 2883,51 / 10249,23.
