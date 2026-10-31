import {
  addDaysIso,
  isInCatalog,
  PriceRow,
  priceRowKey,
  type CatalogItem,
  type ErrorCode,
  type PriceSource,
  type QuarantineReason,
} from '@gold/schema';
import type { ParseResult } from '../sources/types';
import { classify, indexByKey, seriesKey, type Candidate } from './upsert';

// TECH-SPEC §7 — gerbang kualitas harga ritel. Tingkat run (V-01, V-03, V-04) menggagalkan
// seluruh sumber; V-06 menandai `stale`; tingkat baris (V-02, V-05) menahan baris ke karantina;
// V-11 menahan seluruh batch (D-15). Fungsi murni.

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
  /** Tanggal Jakarta saat run. */
  today: string;
}

export interface HeldBatch {
  reason_code: QuarantineReason;
  rows: Candidate[];
}

export type ValidateResult =
  | { outcome: 'failed'; error_code: ErrorCode; error_message: string }
  | { outcome: 'stale'; reason: string }
  | { outcome: 'ok'; rows: Candidate[]; held: HeldBatch[] };

const fail = (error_code: ErrorCode, error_message: string): ValidateResult => ({
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
function checkMinRows(source: PriceSource, rows: readonly Candidate[]): string | null {
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
      return rows.length >= MIN_ROWS.logammulia
        ? null
        : `V-04: ${rows.length} gramasi (minimal ${MIN_ROWS.logammulia})`;
  }
}

/** V-06 (semua sumber ritel): tanggal data = hari ini dan sumber tidak menandai dirinya basi. */
function checkFreshness(input: ValidateInput): string | null {
  const { parsed, today } = input;
  if (parsed.stale) return parsed.stale;
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
  const runLevel = checkSpread(rows) ?? checkMinRows(source, rows);
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
