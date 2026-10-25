import { isIsoDate, jakartaDate, parseRupiah, parseWeight } from '@gold/schema';
import * as XLSX from 'xlsx';

// Pemeriksaan bentuk respons per sumber (P0-11). Fungsi murni: menerima body mentah
// dan `today` (tanggal Jakarta), sehingga bisa diuji dengan fixture riset P0-07–P0-10.
// Ini bukan parser produksi — parser + validasi V-xx ditulis di Fase 1–2.

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface CheckResult {
  checks: Check[];
  /** Tanggal data terbaru menurut sumber, bila bisa ditentukan. */
  dataDate: string | null;
}

class Checks {
  readonly list: Check[] = [];
  add(name: string, ok: boolean, detail = ''): boolean {
    this.list.push({ name, ok, detail });
    return ok;
  }
  /** Jalankan `fn`; exception dicatat sebagai pemeriksaan gagal. */
  try<T>(name: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      this.add(name, false, err instanceof Error ? err.message : String(err));
      return undefined;
    }
  }
}

const text = (b: Buffer | string) => (typeof b === 'string' ? b : b.toString('utf8'));
const strip = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Sel-sel setiap `<tr>` dalam potongan HTML. */
export function tableRows(html: string): string[][] {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => strip(c[1]!)),
  );
}

function sliceTable(html: string, openTagStart: string): string | null {
  const start = html.indexOf(openTagStart);
  if (start === -1) return null;
  const end = html.indexOf('</table>', start);
  return end === -1 ? null : html.slice(start, end);
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

function freshness(c: Checks, label: string, date: string | null, today: string, maxDays: number) {
  if (!date) return c.add(`${label} diketahui`, false, 'tanggal tidak ditemukan');
  const age = daysBetween(date, today);
  return c.add(`${label} ≤ ${maxDays} hari`, age >= 0 && age <= maxDays, `${date} (${age} hari)`);
}

// ── UBS Lifestyle (TECH-SPEC §5.1) ──────────────────────────────────────────

export function checkUbsLifestyle(
  page: Buffer | string,
  chart: Buffer | string,
  today: string,
): CheckResult {
  const c = new Checks();
  const html = text(page);
  const table = sliceTable(html, '<table');
  let oneGramBuyback: number | undefined;
  if (c.add('tabel harga ada', table !== null)) {
    const rows = tableRows(table!);
    const year = rows.flat().find((cell) => /^Tahun \d{4}$/.test(cell));
    c.add('label "Tahun YYYY"', year !== undefined, year ?? '');
    const priced = rows.filter((r) => /Gram$/i.test(r[0] ?? ''));
    c.add('≥ 13 pecahan (V-04)', priced.length >= 13, `${priced.length} pecahan`);
    c.try('harga terbaca, beli > buyback (V-03)', () => {
      for (const [w, beli, jual] of priced) {
        if (!(parseRupiah(beli!) > parseRupiah(jual!))) throw new Error(`${w}: ${beli} ≤ ${jual}`);
      }
      c.add('harga terbaca, beli > buyback (V-03)', true, `${priced.length} baris`);
    });
    const one = priced.find((r) => c.try('berat terbaca', () => parseWeight(r[0]!)) === 1);
    oneGramBuyback = one ? c.try('buyback 1 g', () => parseRupiah(one[2]!)) : undefined;
  }

  let dataDate: string | null = null;
  c.try('endpoint grafik: JSON [{data: [[ts, a, …]]}]', () => {
    const series = JSON.parse(text(chart)) as { data: number[][] }[];
    const last = series[0]?.data.at(-1);
    if (!last || typeof last[0] !== 'number') throw new Error('data kosong');
    dataDate = new Date(last[0]).toISOString().slice(0, 10); // ts = 00:00 UTC tanggal harga
    c.add('endpoint grafik: JSON [{data: [[ts, a, …]]}]', true, `${series[0]!.data.length} titik`);
    c.add(
      'titik terakhir grafik = buyback 1 g (D-19)',
      last[1] === oneGramBuyback,
      `grafik ${last[1]} vs tabel ${oneGramBuyback}`,
    );
  });
  freshness(c, 'data_date', dataDate, today, 3);
  return { checks: c.list, dataDate };
}

// ── Pegadaian (TECH-SPEC §5.2) ──────────────────────────────────────────────

export const PEGADAIAN_VENDORS = {
  '00005201808001': 'antam',
  '00005201808002': 'ubs',
  '00005202003010': 'galeri24',
} as const;

export function checkPegadaian(body: Buffer | string, today: string): CheckResult {
  const c = new Checks();
  let dataDate: string | null = null;
  c.try('JSON valid', () => {
    const json = JSON.parse(text(body)) as {
      responseCode?: string;
      data?: {
        idVendor: string;
        tglBerlaku: string;
        hargaMuliaDetails: { berat: number; hargaJual: number; hargaBeli: number | null }[];
      }[];
    };
    c.add('responseCode = 2000000100', json.responseCode === '2000000100', json.responseCode ?? '');
    const data = json.data ?? [];
    const dates = new Set<string>();
    for (const [code, brand] of Object.entries(PEGADAIAN_VENDORS)) {
      const v = data.find((x) => x.idVendor === code);
      if (!c.add(`vendor ${brand} (${code}) ada`, v !== undefined)) continue;
      const priced = v!.hargaMuliaDetails.filter((d) => d.hargaJual > 0);
      c.add(`${brand} ≥ 5 gramasi (V-04)`, priced.length >= 5, `${priced.length} gramasi`);
      dates.add(v!.tglBerlaku);
    }
    c.add('tglBerlaku sama untuk semua brand', dates.size === 1, [...dates].join(', '));
    const withBuyback = data
      .flatMap((v) => v.hargaMuliaDetails)
      .filter((d) => d.hargaBeli !== null);
    c.add(
      'buyback tersedia? (Q-1, informatif)',
      true,
      `${withBuyback.length} gramasi ber-hargaBeli`,
    );
    dataDate = [...dates].sort().at(-1) ?? null;
  });
  freshness(c, 'tglBerlaku', dataDate, today, 3);
  return { checks: c.list, dataDate };
}

// ── Logam Mulia (TECH-SPEC §5.3) ────────────────────────────────────────────

export interface LogamMuliaRaw {
  homeStatus: number;
  homeTitle: string;
  token: string | null;
  sell?: Buffer | string;
  buyback?: Buffer | string;
}

export function checkLogamMulia(raw: LogamMuliaRaw, today: string): CheckResult {
  const c = new Checks();
  const maintenance = raw.homeStatus === 503 && /maintenance/i.test(raw.homeTitle);
  c.add('bukan halaman maintenance', !maintenance, `HTTP ${raw.homeStatus} "${raw.homeTitle}"`);
  if (!maintenance) c.add('HTTP 200', raw.homeStatus === 200, String(raw.homeStatus));
  if (!c.add('token CSRF ada', raw.token !== null)) return { checks: c.list, dataDate: null };

  let dataDate: string | null = null;
  for (const [name, body] of [
    ['jual', raw.sell],
    ['buyback', raw.buyback],
  ] as const) {
    c.try(`${name}: array [ts_ms, harga]`, () => {
      const points = JSON.parse(text(body ?? '')) as [number, number][];
      if (!Array.isArray(points) || points.length === 0) throw new Error('bukan array / kosong');
      const last = points.at(-1)!;
      const date = jakartaDate(last[0]);
      c.add(`${name}: array [ts_ms, harga]`, true, `${points.length} titik, terakhir ${date}`);
      if (name === 'jual') dataDate = date;
    });
  }
  freshness(c, 'titik terakhir (V-07)', dataDate, today, 3);
  return { checks: c.list, dataDate };
}

// ── xaus (TECH-SPEC §5.4) ───────────────────────────────────────────────────

export function checkXaus(
  history: Buffer | string,
  spot: Buffer | string,
  today: string,
): CheckResult {
  const c = new Checks();
  let dataDate: string | null = null;
  c.try('histori JSON', () => {
    const h = JSON.parse(text(history)) as {
      unit?: string;
      data_state?: { status?: string };
      points?: { d: string; c: number }[];
    };
    c.add('unit troy_oz', h.unit === 'troy_oz', h.unit ?? '');
    c.add(
      'data_state.status = fresh (V-10)',
      h.data_state?.status === 'fresh',
      h.data_state?.status ?? '',
    );
    const points = h.points ?? [];
    c.add('≥ 200 titik', points.length >= 200, `${points.length} titik`);
    c.add(
      'titik {d, c} valid',
      points.every((p) => isIsoDate(p.d) && p.c > 0),
    );
    dataDate = points.at(-1)?.d ?? null;
  });
  // Diambil akhir pekan/libur: penutupan terakhir bisa 3–4 hari lalu.
  freshness(c, 'penutupan terakhir', dataDate, today, 5);
  c.try('spot JSON', () => {
    const s = JSON.parse(text(spot)) as { stale?: boolean; spot_usd_oz?: number };
    c.add('spot stale = false (V-10)', s.stale === false, String(s.stale));
    c.add('spot_usd_oz > 0', (s.spot_usd_oz ?? 0) > 0, String(s.spot_usd_oz));
  });
  return { checks: c.list, dataDate };
}

// ── Frankfurter (TECH-SPEC §5.6) ────────────────────────────────────────────

export function checkFrankfurter(csv: Buffer | string, today: string): CheckResult {
  const c = new Checks();
  const lines = text(csv).trim().split('\n');
  c.add('header date,base,quote,rate', lines[0] === 'date,base,quote,rate', lines[0] ?? '');
  const rows = lines.slice(1).map((l) => l.split(','));
  const byDate = new Map<string, Set<string>>();
  for (const [date, , quote] of rows) {
    byDate.set(date!, (byDate.get(date!) ?? new Set()).add(quote!));
  }
  const incomplete = [...byDate].filter(([, q]) => !(q.has('IDR') && q.has('USD')));
  c.add(
    'setiap tanggal punya IDR dan USD',
    byDate.size > 0 && incomplete.length === 0,
    `${byDate.size} tanggal`,
  );
  const dataDate = [...byDate.keys()].sort().at(-1) ?? null;
  freshness(c, 'tanggal terakhir', dataDate, today, 5);
  return { checks: c.list, dataDate };
}

// ── JISDOR (TECH-SPEC §5.5) ─────────────────────────────────────────────────

const BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** `23 Oktober 2026` → `2026-10-23`. */
export function parseTanggalIndonesia(s: string): string {
  const m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(s.trim());
  const month = m ? BULAN.indexOf(m[2]!) + 1 : 0;
  if (!m || month === 0) throw new Error(`tanggal tidak dikenal: "${s}"`);
  const iso = `${m[3]}-${String(month).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  if (!isIsoDate(iso)) throw new Error(`tanggal tidak valid: "${s}"`);
  return iso;
}

export function checkJisdor(
  page: Buffer | string,
  exportXlsx: Buffer | null,
  today: string,
): CheckResult {
  const c = new Checks();
  const html = text(page);
  let dataDate: string | null = null;
  const table = sliceTable(html, '<table class="table table-striped');
  if (c.add('tabel JISDOR ada', table !== null)) {
    const rows = tableRows(table!);
    c.add('header Tanggal | Kurs', rows[0]?.join('|') === 'Tanggal|Kurs', rows[0]?.join('|') ?? '');
    const data = rows.slice(1);
    c.add('10 hari kerja terakhir', data.length === 10, `${data.length} baris`);
    c.try('tanggal & kurs terbaca', () => {
      const parsed = data.map(([d, k]) => [parseTanggalIndonesia(d!), parseRupiah(k!)] as const);
      dataDate =
        parsed
          .map(([d]) => d)
          .sort()
          .at(-1) ?? null;
      c.add('tanggal & kurs terbaca', true, `terakhir ${dataDate} = ${parsed[0]?.[1]}`);
    });
  }
  c.add('form ekspor ada (ButtonExport)', /\$ButtonExport/.test(html));
  freshness(c, 'tanggal terakhir', dataDate, today, 5);
  if (exportXlsx) {
    c.try('ekspor XLSX: NO | Tanggal | Kurs', () => {
      const wb = XLSX.read(exportXlsx);
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, {
        header: 1,
        raw: true,
        defval: null,
      });
      const head = rows.findIndex((r) => r[1] === 'Tanggal' && r[2] === 'Kurs');
      if (head === -1) throw new Error('header tidak ditemukan');
      const body = rows.slice(head + 1).filter((r) => r[1] !== null);
      c.add('ekspor XLSX: NO | Tanggal | Kurs', body.length > 0, `${body.length} baris`);
    });
  }
  return { checks: c.list, dataDate };
}

/** Tautan XLSX bulanan Pink Sheet dari halaman Commodity Markets (hash berubah tiap rilis). */
export function findPinkSheetUrl(html: string): string | null {
  return html.match(/https?:\/\/[^"'\s]+\/CMO-Historical-Data-Monthly\.xlsx/)?.[0] ?? null;
}

// ── World Bank (TECH-SPEC §5.6) ─────────────────────────────────────────────

export function checkWorldBank(
  page: Buffer | string,
  xlsx: Buffer | null,
  today: string,
): CheckResult {
  const c = new Checks();
  const url = findPinkSheetUrl(text(page));
  c.add('tautan CMO-Historical-Data-Monthly.xlsx', url !== null, url ?? '');
  if (!xlsx) return { checks: c.list, dataDate: null };
  let dataDate: string | null = null;
  c.try('sheet Monthly Prices + kolom Gold', () => {
    const ws = XLSX.read(xlsx).Sheets['Monthly Prices'];
    if (!ws) throw new Error('sheet "Monthly Prices" tidak ada');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    const header = rows.findIndex((r) => r.includes('Gold'));
    if (header === -1) throw new Error('kolom "Gold" tidak ada');
    const col = rows[header]!.indexOf('Gold');
    c.add('sheet Monthly Prices + kolom Gold', true, `kolom ${col}`);
    c.add(
      'satuan ($/troy oz)',
      rows[header + 1]?.[col] === '($/troy oz)',
      String(rows[header + 1]?.[col]),
    );
    const data = rows.filter((r) => typeof r[0] === 'string' && /^\d{4}M\d{2}$/.test(r[0]));
    const last = data.at(-1);
    c.add(
      'nilai terakhir numerik',
      typeof last?.[col] === 'number',
      `${last?.[0]} = ${last?.[col]}`,
    );
    if (typeof last?.[0] === 'string') dataDate = `${last[0].slice(0, 4)}-${last[0].slice(5)}-01`;
  });
  // Rilis ±tanggal 2 memuat bulan lalu → periode terakhir paling lama ±2 bulan.
  freshness(c, 'periode terakhir', dataDate, today, 75);
  return { checks: c.list, dataDate };
}
