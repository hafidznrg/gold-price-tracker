/**
 * P2-12 / G2 — cek silang data makro terhadap grafik referensi (read-only terhadap data/).
 *
 *   pnpm --filter scraper check:macro [--root <folder>] [--until 2026-10-23] [--seed 1996]
 *
 * Kode keluar 1 bila: ada tahun 1996 → kini tanpa emas/kurs, identitas kelipatan melebihi 1%,
 * atau premi Antam sampel tidak positif. Selisih terhadap grafik referensi hanya dilaporkan
 * (perlu dijelaskan, bukan kegagalan).
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { isIsoDate, premiumAntamSeries, goldIdrGramSeries } from '@gold/schema';
import {
  annualTable,
  antamSellSeries,
  endpointMultiples,
  IDENTITY_TOLERANCE,
  isPlausiblePremium,
  median,
  missingYears,
  multiples,
  premiumSampleAt,
  REFERENCE,
  REFERENCE_FLAG,
  relDiff,
  sample,
} from '../src/check/macro';
import { loadConfig } from '../src/config';
import { readMacro, readPrices } from '../src/pipeline/store';

const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    until: { type: 'string', default: REFERENCE.asOf },
    seed: { type: 'string', default: '1996' },
    samples: { type: 'string', default: '3' },
  },
});
const root = path.resolve(
  values.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
);
const until = values.until!;
if (!isIsoDate(until)) throw new Error(`--until harus YYYY-MM-DD: ${until}`);
const endYear = Number(until.slice(0, 4));

const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
const num = (x: number, d = 0) =>
  x.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
const src = (p: { series: string; frequency: string } | null) =>
  p ? `${p.series}/${p.frequency}` : '-';

const config = await loadConfig(root);
const rows = (await Promise.all(config.macroSeries.map((s) => readMacro(root, s.id)))).flat();
const table = annualTable(rows, config.macroSeries, until);
let failed = false;

console.log(`Cek silang makro · root ${root} · sampai ${until}\n`);

// 1. Cakupan tahun (G2 butir 1)
const missing = missingYears(table, REFERENCE.baseYear, endYear);
console.log(
  `[1] Cakupan ${REFERENCE.baseYear}-${endYear}: ${missing.length === 0 ? 'lengkap' : `KOSONG ${missing.join(', ')}`}`,
);
if (missing.length > 0) failed = true;
console.log(
  '    tahun  emas US$/oz   sumber          kurs IDR/US$  sumber            Rp/gram (bulan)',
);
for (const r of table.filter((t) =>
  [1996, 1997, 1998, 1999, 2012, 2013, 2020, endYear].includes(t.year),
)) {
  console.log(
    `    ${r.year}  ${r.goldUsd ? num(r.goldUsd.value, 1).padStart(10) : '-'.padStart(10)}   ${src(r.goldUsd).padEnd(14)}  ${r.usdIdr ? num(r.usdIdr.value, 1).padStart(10) : '-'.padStart(10)}    ${src(r.usdIdr).padEnd(16)}  ${r.goldIdr ? `${num(r.goldIdr.value)} (${r.goldIdr.months})` : '-'}`,
  );
}

// 2. Kelipatan dan identitas (G2 butir 2, 3)
const m = multiples(table, REFERENCE.baseYear, endYear);
console.log(
  `\n[2] Kelipatan ${REFERENCE.baseYear} → ${endYear} (rata-rata tahunan; ${endYear} sampai ${until})`,
);
if (!m) {
  console.log('    tidak dapat dihitung (tahun dasar/akhir tidak lengkap)');
  failed = true;
} else {
  const line = (label: string, v: number, ref: number) => {
    const d = relDiff(v, ref);
    const flag = Math.abs(d) > REFERENCE_FLAG ? '  <- selisih > 5%, jelaskan' : '';
    console.log(
      `    ${label.padEnd(12)} x${v.toFixed(2).padStart(6)}   referensi x${ref}   selisih ${pct(d)}${flag}`,
    );
  };
  line('Rp/gram', m.goldIdrGram, REFERENCE.goldIdrGram);
  line('US$/oz', m.goldUsdOz, REFERENCE.goldUsdOz);
  line('USD/IDR', m.usdIdr, REFERENCE.usdIdr);
  const ok = m.residual < IDENTITY_TOLERANCE;
  console.log(
    `    identitas: x${m.goldUsdOz.toFixed(3)} (US$/oz) * x${m.usdIdr.toFixed(3)} (kurs) = x${m.product.toFixed(3)} vs Rp/gram x${m.goldIdrGram.toFixed(3)} -> sisa ${(m.residual * 100).toFixed(2)}% ${ok ? 'OK' : 'GAGAL (>= 1%)'}`,
  );
  if (!ok) failed = true;
  const a = table.find((r) => r.year === REFERENCE.baseYear);
  console.log(
    `    Rp/gram ${REFERENCE.baseYear} tidak ada di data (harga Antam mulai 2010): diturunkan per bulan dari xau_usd_oz x usd_idr / 31,1034768 (${a?.goldIdr?.months ?? 0} bulan).`,
  );
}

// 2b. Titik akhir (ujung kanan grafik referensi): nilai harian terakhir terhadap rata-rata 1996
const e = endpointMultiples(table, REFERENCE.baseYear, rows, config.macroSeries, until);
console.log(`
[2b] Titik akhir terhadap rata-rata ${REFERENCE.baseYear}`);
if (!e) {
  console.log('    belum ada emas harian di data (backfill xaus belum ter-commit): dilewati');
} else {
  console.log(
    `    ${e.date}: emas US$${num(e.xau_usd_oz, 1)}/oz, kurs ${num(e.usd_idr, 1)} (${e.usd_idr_series})`,
  );
  for (const [label, v, ref] of [
    ['Rp/gram', e.goldIdrGram, REFERENCE.goldIdrGram],
    ['US$/oz', e.goldUsdOz, REFERENCE.goldUsdOz],
    ['USD/IDR', e.usdIdr, REFERENCE.usdIdr],
  ] as const) {
    console.log(
      `    ${label.padEnd(12)} x${v.toFixed(2).padStart(6)}   referensi x${ref}   selisih ${pct(relDiff(v, ref))}`,
    );
  }
  const ok = e.residual < IDENTITY_TOLERANCE;
  console.log(
    `    identitas: sisa ${(e.residual * 100).toFixed(2)}% ${ok ? 'OK' : 'GAGAL (>= 1%)'}`,
  );
  if (!ok) failed = true;
}

// 3. Premi Antam (G2 butir 4)
const antam = antamSellSeries(await readPrices(root, 'logammulia')).filter((p) => p.date <= until);
console.log(
  `\n[3] Premi Antam 1 g (harga jual vs Rp/gram spot hari kerja sebelumnya) · ${antam.length} tanggal harga`,
);
const picks = sample(antam, Number(values.samples), Number(values.seed));
for (const p of picks) {
  const s = premiumSampleAt(p.date, p.value, rows, config.macroSeries);
  if (!s) {
    console.log(`    ${p.date}  Rp${num(p.value)}  tidak ada spot (emas/kurs) dalam toleransi`);
    failed = true;
    continue;
  }
  const good = isPlausiblePremium(s.premium);
  if (s.premium <= 0) failed = true;
  console.log(
    `    ${p.date}  jual Rp${num(p.value)}  spot Rp${num(s.spot_idr_gram)} (US$${num(s.xau_usd_oz, 1)} x ${num(s.usd_idr, 1)}, ${s.basis === 'D' ? `penutupan ${s.spot_date}` : `rata-rata bulan ${s.spot_date}, proksi`})  premi ${pct(s.premium)}${good ? '' : '  <- di luar 0-20%'}`,
  );
}
const dailyPremiums = premiumAntamSeries(
  (await readPrices(root, 'logammulia')).filter((r) => r.date <= until),
  goldIdrGramSeries(rows, config.macroSeries),
);
if (dailyPremiums.length > 0) {
  const v = dailyPremiums.map((p) => p.value);
  console.log(
    `    seluruh tanggal ber-spot harian: ${dailyPremiums.length} (${dailyPremiums[0]!.date} -> ${dailyPremiums.at(-1)!.date}); median ${pct(median(v))}, min ${pct(Math.min(...v))}, maks ${pct(Math.max(...v))}, positif ${((v.filter((x) => x > 0).length / v.length) * 100).toFixed(1)}%`,
  );
} else {
  console.log(
    '    belum ada spot emas harian di data (jalankan backfill xaus): sampel memakai proksi bulanan.',
  );
}

console.log(`\nHasil: ${failed ? 'GAGAL' : 'lulus'}`);
process.exit(failed ? 1 : 0);
