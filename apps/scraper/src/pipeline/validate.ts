import {
  addDaysIso,
  isInCatalog,
  macroRowKey,
  MacroRow,
  PriceRow,
  priceRowKey,
  type CatalogItem,
  type ErrorCode,
  type Frequency,
  type MacroSource,
  type PriceSource,
  type QuarantineReason,
  type Series,
} from '@gold/schema';
import type { ParseResult } from '../sources/types';
import {
  classify,
  classifyMacro,
  indexByKey,
  indexMacroByKey,
  seriesKey,
  type Candidate,
  type MacroCandidate,
} from './upsert';

// TECH-SPEC §7 — gerbang kualitas harga ritel. Tingkat run (V-01, V-03, V-04) menggagalkan
// seluruh sumber; V-06 menandai `stale`; tingkat baris (V-02, V-05) menahan baris ke karantina;
// V-11 menahan seluruh batch (D-15). Bagian makro (V-08–V-10) ada di bawah. Fungsi murni.

export const MAX_PRICE_JUMP = 0.1;
export const MAX_HISTORY_REVISIONS = 20;

/** V-04: jumlah baris minimum per sumber. */
export const MIN_ROWS = { ubslifestyle: 13, pegadaian: 5, logammulia: 12 } as const;
/** Brand yang wajib ada di Pegadaian (D-20). */
export const PEGADAIAN_BRANDS = ['antam', 'ubs', 'galeri24'] as const;

export interface ValidateInput {
  source: PriceSource;
  parsed: ParseResult<PriceRow>;
  catalog: readonly CatalogItem[];
  /** Semua baris sumber ini yang sudah ada di `data/prices/{source}/`. */
  existing: readonly PriceRow[];
  /** Tanggal Jakarta sasaran run (D-27). */
  today: string;
  /** D-42: terima tanggal data dalam [`today` − 1, max(`today`, `runDate`)]. */
  acceptPreviousDay?: boolean;
  /** Tanggal Jakarta saat run benar-benar berjalan (default `today`). */
  runDate?: string;
}

export interface HeldBatch<R = Candidate> {
  reason_code: QuarantineReason;
  rows: R[];
}

export type ValidateFailed = { outcome: 'failed'; error_code: ErrorCode; error_message: string };

export type ValidateResult =
  | ValidateFailed
  | { outcome: 'stale'; reason: string }
  | { outcome: 'ok'; rows: Candidate[]; held: HeldBatch[] };

const fail = (error_code: ErrorCode, error_message: string): ValidateFailed => ({
  outcome: 'failed',
  error_code,
  error_message,
});

/** V-01: bentuk baris lengkap (kolom yang diisi merge diberi nilai sementara), kunci unik. */
function checkSchema(rows: readonly Candidate[]): string | null {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = priceRowKey(row);
    if (keys.has(key)) return `kunci duplikat ${key}`;
    keys.add(key);
    const result = PriceRow.safeParse({
      ...row,
      scraped_at: '2000-01-01T00:00:00Z',
      run_id: 'local-validate',
      origin: 'scrape',
    });
    if (!result.success) {
      return `${row.brand} ${row.weight_g} g ${row.date}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    }
  }
  return null;
}

/** V-03: buyback < jual pada baris yang sama. */
function checkSpread(rows: readonly Candidate[]): string | null {
  const bad = rows.find(
    (r) => r.sell_price !== null && r.buyback_price !== null && !(r.buyback_price < r.sell_price),
  );
  return bad
    ? `V-03: buyback ${bad.buyback_price} ≥ jual ${bad.sell_price} (${bad.brand} ${bad.variant} ${bad.weight_g} g)`
    : null;
}

/** Tahun produksi terbaru di tabel UBS = "tahun berjalan" untuk V-04 dan D-19. */
export function newestVariant(rows: readonly Pick<Candidate, 'variant'>[]): string | null {
  const variants = rows.map((r) => r.variant).filter((v) => /^\d{4}$/.test(v));
  return variants.length === 0 ? null : variants.sort().at(-1)!;
}

/** V-04: jumlah baris ≥ minimum. */
function checkMinRows(
  source: PriceSource,
  rows: readonly Candidate[],
  note?: string,
): string | null {
  switch (source) {
    case 'ubslifestyle': {
      const variant = newestVariant(rows);
      const n = rows.filter((r) => r.variant === variant).length;
      return n >= MIN_ROWS.ubslifestyle
        ? null
        : `V-04: ${n} pecahan untuk tahun ${variant ?? '?'} (minimal ${MIN_ROWS.ubslifestyle})`;
    }
    case 'pegadaian': {
      const short = PEGADAIAN_BRANDS.map(
        (b) => [b, rows.filter((r) => r.brand === b).length] as const,
      ).filter(([, n]) => n < MIN_ROWS.pegadaian);
      return short.length === 0
        ? null
        : `V-04: ${short.map(([b, n]) => `${b} ${n} gramasi`).join(', ')} (minimal ${MIN_ROWS.pegadaian} per brand)`;
    }
    case 'logammulia':
      // `note` = fallback 1 g saat tabel gagal dibaca (FR-04): sengaja hanya satu baris 1 g.
      return (note && rows.length === 1 && rows[0]!.weight_g === 1) ||
        rows.length >= MIN_ROWS.logammulia
        ? null
        : `V-04: ${rows.length} gramasi (minimal ${MIN_ROWS.logammulia})`;
  }
}

/** V-06 (semua sumber ritel): tanggal data = hari ini dan sumber tidak menandai dirinya basi. */
function checkFreshness(input: ValidateInput): string | null {
  const { parsed, today } = input;
  if (parsed.stale) return parsed.stale;
  if (input.acceptPreviousDay && parsed.dataDate) {
    const from = addDaysIso(today, -1);
    const runDate = input.runDate ?? today;
    const to = runDate > today ? runDate : today;
    if (parsed.dataDate >= from && parsed.dataDate <= to) return null;
    return `tanggal data ${parsed.dataDate} di luar ${from} … ${to}`;
  }
  if (parsed.dataDate !== today)
    return `tanggal data ${parsed.dataDate ?? '?'} ≠ hari ini ${today}`;
  return null;
}

/** Nilai terakhir (tanggal < `date`) per seri, untuk V-05. */
function lastValues(existing: readonly PriceRow[]) {
  const bySeries = new Map<string, PriceRow[]>();
  for (const r of existing) {
    const k = seriesKey(r);
    bySeries.set(k, [...(bySeries.get(k) ?? []), r]);
  }
  for (const rows of bySeries.values()) rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return (row: Candidate): PriceRow | undefined =>
    bySeries
      .get(seriesKey(row))
      ?.filter((r) => r.date < row.date)
      .at(-1);
}

const jumped = (prev: number | null, next: number | null) =>
  prev !== null && next !== null && Math.abs(next / prev - 1) > MAX_PRICE_JUMP;

export function validate(input: ValidateInput): ValidateResult {
  const { source, parsed, catalog, existing, today } = input;
  const rows = parsed.rows;

  const schema = checkSchema(rows);
  if (schema) return fail('SCHEMA_INVALID', `V-01: ${schema}`);
  const runLevel = checkSpread(rows) ?? checkMinRows(source, rows, parsed.note);
  if (runLevel) return fail('VALIDATION_FAILED', runLevel);

  const stale = checkFreshness(input);
  if (stale) return { outcome: 'stale', reason: stale };

  const previous = lastValues(existing);
  const unknown: Candidate[] = [];
  const jumps: Candidate[] = [];
  const passed: Candidate[] = [];
  for (const row of rows) {
    if (!isInCatalog(catalog, row)) {
      unknown.push(row); // V-02
      continue;
    }
    const prev = previous(row);
    if (
      prev &&
      (jumped(prev.sell_price, row.sell_price) || jumped(prev.buyback_price, row.buyback_price))
    ) {
      jumps.push(row); // V-05
      continue;
    }
    passed.push(row);
  }

  const held: HeldBatch[] = [];
  if (unknown.length > 0) held.push({ reason_code: 'UNKNOWN_ITEM', rows: unknown });
  if (jumps.length > 0) held.push({ reason_code: 'PRICE_JUMP', rows: jumps });

  // V-11: revisi histori (tanggal < kemarin) dalam jumlah besar → tahan seluruh batch.
  const index = indexByKey(existing);
  const yesterday = addDaysIso(today, -1);
  const historyRevisions = passed.filter(
    (r) => r.date < yesterday && classify(index, r).kind === 'update',
  ).length;
  if (historyRevisions > MAX_HISTORY_REVISIONS) {
    return {
      outcome: 'ok',
      rows: [],
      held: [...held, { reason_code: 'MASS_REVISION', rows: passed }],
    };
  }
  return { outcome: 'ok', rows: passed, held };
}

/**
 * Validasi ulang baris karantina sebelum `approve` (WORKFLOWS §3.5): aturan baris dan V-03
 * diperiksa lagi terhadap data sekarang, kecuali aturan yang memicu karantina itu. V-02 tetap
 * berlaku untuk `UNKNOWN_ITEM`: tambahkan item ke `config/catalog.yml` dulu, lalu setujui.
 * Mengembalikan daftar pelanggaran (kosong = boleh disetujui).
 */
export function revalidateHeld(
  reason: QuarantineReason,
  rows: readonly Candidate[],
  catalog: readonly CatalogItem[],
  existing: readonly PriceRow[],
): string[] {
  const problems: string[] = [];
  const schema = checkSchema(rows);
  if (schema) problems.push(`V-01: ${schema}`);
  const previous = lastValues(existing);
  for (const row of rows) {
    const label = `${row.brand} ${row.variant ? `${row.variant} ` : ''}${row.weight_g} g ${row.date}`;
    const spread = checkSpread([row]);
    if (spread) problems.push(spread);
    if (!isInCatalog(catalog, row)) problems.push(`V-02: ${label} tidak ada di katalog`);
    if (reason !== 'PRICE_JUMP') {
      const prev = previous(row);
      if (
        prev &&
        (jumped(prev.sell_price, row.sell_price) || jumped(prev.buyback_price, row.buyback_price))
      ) {
        problems.push(`V-05: ${label} berubah > ${MAX_PRICE_JUMP * 100}% dari ${prev.date}`);
      }
    }
  }
  return problems;
}

/**
 * Gerbang untuk backfill (WORKFLOWS §3.4): V-01 dan V-03 tingkat run, V-02 menahan baris
 * `UNKNOWN_ITEM`. V-04/V-06 (cakupan & kesegaran hari ini), V-05 (lonjakan antarbaris histori
 * memang terjadi), dan V-11 (backfill memang mengisi histori) tidak berlaku; diff dry run
 * menggantikan tinjauannya. Selisih dengan baris yang ada dicatat merge sebagai REVISION.
 */
export function validateBackfill(
  rows: readonly Candidate[],
  catalog: readonly CatalogItem[],
): ValidateResult {
  if (rows.length === 0) return fail('VALIDATION_FAILED', 'tidak ada baris dalam rentang');
  const schema = checkSchema(rows);
  if (schema) return fail('SCHEMA_INVALID', `V-01: ${schema}`);
  const spread = checkSpread(rows);
  if (spread) return fail('VALIDATION_FAILED', spread);
  const unknown = rows.filter((r) => !isInCatalog(catalog, r));
  return {
    outcome: 'ok',
    rows: rows.filter((r) => isInCatalog(catalog, r)),
    held: unknown.length > 0 ? [{ reason_code: 'UNKNOWN_ITEM', rows: unknown }] : [],
  };
}

// ── Makro (TECH-SPEC §7: V-08 s.d. V-10) ────────────────────────────────────

/** V-08: kurs USD/IDR berubah ≤ ±5% per hari. */
export const MAX_FX_JUMP = 0.05;
/** V-09: emas XAU/USD berubah ≤ ±8% per hari. */
export const MAX_GOLD_JUMP = 0.08;

/** Ambang lonjakan per seri: V-09 untuk emas, V-08 untuk semua seri kurs. */
const MACRO_MAX_JUMP: Record<Series, number> = {
  xau_usd_oz: MAX_GOLD_JUMP,
  usd_idr_jisdor: MAX_FX_JUMP,
  usd_idr_ecb: MAX_FX_JUMP,
  usd_idr_annual: MAX_FX_JUMP,
};

/**
 * V-08/V-09 hanya untuk frekuensi `D`: ambangnya "per hari". Rata-rata bulanan (`M`) dan
 * tahunan (`A`) wajar bergerak lebih jauh antarperiode (kurs 1997 → 1998: 2.909 → 10.014
 * Rp/US$, +244%), sehingga ambang harian akan menahan data yang benar. Baris `D` dibandingkan
 * dengan nilai `D` terakhir seri yang sama berapa pun jarak harinya (akhir pekan, libur),
 * sama seperti V-05 terhadap nilai terakhir seri.
 */
const checkedForJump = (frequency: Frequency) => frequency === 'D';

/** Toleransi 1e-9 agar batas tepat (mis. 4.000 → 4.320 = +8%) tidak jatuh karena derau float. */
const macroJumped = (series: Series, prev: number, next: number) =>
  Math.abs(next / prev - 1) > MACRO_MAX_JUMP[series] + 1e-9;

const seriesOf = (r: { series: string; frequency: string }) => `${r.series}|${r.frequency}`;

/** V-01 makro: bentuk baris lengkap dan kunci unik. */
function checkMacroSchema(rows: readonly MacroCandidate[]): string | null {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = macroRowKey(row);
    if (keys.has(key)) return `kunci duplikat ${key}`;
    keys.add(key);
    const result = MacroRow.safeParse({
      ...row,
      scraped_at: '2000-01-01T00:00:00Z',
      run_id: 'local-validate',
      origin: 'scrape',
    });
    if (!result.success) {
      return `${key}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    }
  }
  return null;
}

export interface ValidateMacroInput {
  rows: readonly MacroCandidate[];
  /** Semua baris seri-seri yang disentuh batch ini di `data/macro/`. */
  existing: readonly MacroRow[];
  /** Tanggal Jakarta saat run. */
  today: string;
}

export type ValidateMacroResult =
  ValidateFailed | { outcome: 'ok'; rows: MacroCandidate[]; held: HeldBatch<MacroCandidate>[] };

/**
 * Baris batch yang melompat (V-08/V-09). Batch dan data lama digabung per seri+frekuensi
 * menurut tanggal (baris batch menggantikan baris lama berkunci sama); tiap baris batch
 * dibandingkan dengan pendahulu terakhir yang diterima: baris lama, atau baris batch yang
 * lolos. Baris yang melompat tidak menjadi pendahulu, jadi satu lonjakan tidak menahan hari
 * berikutnya, sedangkan pergeseran level permanen menahan semua hari sesudahnya sampai disetujui.
 */
function findMacroJumps(
  rows: readonly MacroCandidate[],
  existing: readonly MacroRow[],
): Set<MacroCandidate> {
  const batchKeys = new Set(rows.map(macroRowKey));
  type Point = { date: string; value: number; candidate: MacroCandidate | null };
  const bySeries = new Map<string, Point[]>();
  const push = (r: { series: string; frequency: string }, p: Point) =>
    bySeries.set(seriesOf(r), [...(bySeries.get(seriesOf(r)) ?? []), p]);
  for (const r of existing) {
    if (!batchKeys.has(macroRowKey(r))) push(r, { date: r.date, value: r.value, candidate: null });
  }
  for (const r of rows) push(r, { date: r.date, value: r.value, candidate: r });

  const jumps = new Set<MacroCandidate>();
  for (const points of bySeries.values()) {
    points.sort((a, b) => (a.date < b.date ? -1 : 1));
    let last: number | null = null;
    for (const p of points) {
      const c = p.candidate;
      if (
        c &&
        checkedForJump(c.frequency) &&
        last !== null &&
        macroJumped(c.series, last, p.value)
      ) {
        jumps.add(c);
        continue;
      }
      last = p.value;
    }
  }
  return jumps;
}

/**
 * Gerbang scrape harian makro: V-01 tingkat run (`SCHEMA_INVALID`); V-08/V-09 tingkat baris
 * (karantina `PRICE_JUMP`); V-11 menahan seluruh batch bila revisi histori melebihi batas.
 * V-10 (respons basi) diperiksa terpisah lewat `checkXausFresh`.
 */
export function validateMacro(input: ValidateMacroInput): ValidateMacroResult {
  const { rows, existing, today } = input;
  const schema = checkMacroSchema(rows);
  if (schema) return fail('SCHEMA_INVALID', `V-01: ${schema}`);

  const jumps = findMacroJumps(rows, existing);
  const passed = rows.filter((r) => !jumps.has(r));
  const held: HeldBatch<MacroCandidate>[] =
    jumps.size > 0 ? [{ reason_code: 'PRICE_JUMP', rows: [...jumps] }] : [];

  const index = indexMacroByKey(existing);
  const yesterday = addDaysIso(today, -1);
  const historyRevisions = passed.filter(
    (r) => r.date < yesterday && classifyMacro(index, r).kind === 'update',
  ).length;
  if (historyRevisions > MAX_HISTORY_REVISIONS) {
    return {
      outcome: 'ok',
      rows: [],
      held: [...held, { reason_code: 'MASS_REVISION', rows: passed }],
    };
  }
  return { outcome: 'ok', rows: passed, held };
}

/**
 * V-10 (xaus): respons basi → run gagal `STALE_SOURCE`. Histori basi bila
 * `data_state.status` ≠ `"fresh"` (status hilang = `null` juga basi); spot basi bila
 * `stale` bukan `false`. Argumen yang tidak diberikan (`undefined`) tidak diperiksa.
 */
export function checkXausFresh(input: {
  historyStatus?: string | null;
  spotStale?: boolean | null;
}): ValidateFailed | null {
  const { historyStatus, spotStale } = input;
  if (historyStatus !== undefined && historyStatus !== 'fresh') {
    return fail(
      'STALE_SOURCE',
      `V-10: histori data_state.status = ${JSON.stringify(historyStatus)}`,
    );
  }
  if (spotStale !== undefined && spotStale !== false) {
    return fail('STALE_SOURCE', 'V-10: spot stale = true');
  }
  return null;
}

/**
 * Validasi ulang batch makro sebelum `approve` (WORKFLOWS §3.5): V-01, dan V-08/V-09 terhadap
 * data sekarang kecuali untuk batch `PRICE_JUMP` (aturan pemicunya).
 */
export function revalidateHeldMacro(
  reason: QuarantineReason,
  rows: readonly MacroCandidate[],
  existing: readonly MacroRow[],
): string[] {
  const problems: string[] = [];
  const schema = checkMacroSchema(rows);
  if (schema) problems.push(`V-01: ${schema}`);
  if (reason !== 'PRICE_JUMP') {
    for (const row of findMacroJumps(rows, existing)) {
      problems.push(
        `V-08/V-09: ${row.series} ${row.date} berubah > ${MACRO_MAX_JUMP[row.series] * 100}% dari nilai sebelumnya`,
      );
    }
  }
  return problems;
}

/**
 * Gerbang backfill makro (WORKFLOWS §3.4): V-01 tingkat run, plus seri dan penyedia baris harus
 * sama dengan job. V-08/V-09 tidak berlaku (lonjakan antarhari memang terjadi di histori: 1998,
 * 2008, 2020) dan V-11 tidak berlaku (backfill memang mengisi histori); diff dry run menggantikan
 * tinjauannya. Selisih dengan baris yang ada dicatat merge sebagai REVISION.
 */
export function validateBackfillMacro(
  rows: readonly MacroCandidate[],
  expected: { series: Series; source: MacroSource },
): ValidateMacroResult {
  if (rows.length === 0) return fail('VALIDATION_FAILED', 'tidak ada baris dalam rentang');
  const schema = checkMacroSchema(rows);
  if (schema) return fail('SCHEMA_INVALID', `V-01: ${schema}`);
  const stray = rows.find((r) => r.series !== expected.series || r.source !== expected.source);
  if (stray) {
    return fail(
      'VALIDATION_FAILED',
      `baris ${stray.date} bertipe ${stray.series}/${stray.source}, job ini menulis ${expected.series}/${expected.source}`,
    );
  }
  return { outcome: 'ok', rows: [...rows], held: [] };
}
