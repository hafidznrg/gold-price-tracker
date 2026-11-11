import { COMPARE_DEFS, type CompareDef, type TodayCells } from './bandingkan';
import { weightKey } from './data';
import { spreadPct } from './spread';

// Logika murni "Bandingkan per gramasi" dan "Tren harga jual 1 gram" di beranda (D-43).

export type MatrixMode = 'jual' | 'buyback' | 'spread';
export type MatrixUnit = 'keping' | 'gram';

function pick(ids: readonly string[]): CompareDef[] {
  return ids.flatMap((id) => COMPARE_DEFS.filter((d) => d.id === id));
}

/** Kolom matriks (urut mockup): Antam LM, Antam Pegadaian, UBS, Galeri24. */
export const MATRIX_COLS: readonly CompareDef[] = pick([
  'lm-antam',
  'pg-antam',
  'ubsl-ubs',
  'pg-g24',
]);

export const BEST_LABEL: Record<MatrixMode, string> = {
  jual: 'termurah',
  buyback: 'tertinggi',
  spread: 'terkecil',
};
export const MATRIX_HINT: Record<MatrixMode, string> = {
  jual: 'Harga jual termurah di tiap gramasi ditandai.',
  buyback: 'Buyback tertinggi di tiap gramasi ditandai.',
  spread: 'Selisih jual-beli terkecil di tiap gramasi ditandai.',
};

export interface MatrixCell {
  /** Rupiah (jual/buyback) atau persen (spread); null = tidak ditampilkan sumber. */
  value: number | null;
  best: boolean;
}
export interface MatrixRow {
  w: number;
  cells: MatrixCell[];
}

/** Gramasi emas fisik yang punya harga jual di sedikitnya satu kolom, urut naik. */
export function matrixWeights(cells: TodayCells): number[] {
  const set = new Set<number>();
  for (const d of MATRIX_COLS) {
    for (const [k, c] of Object.entries(cells[d.id] ?? {})) {
      if (k !== 'linear' && c.sell !== null) set.add(Number(k));
    }
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Baris matriks. Per gram = nilai ÷ berat (spread persen tidak terpengaruh satuan). Sel terbaik
 * hanya ditandai bila baris punya ≥ 2 nilai: jual terendah, buyback tertinggi, spread terkecil.
 */
export function buildMatrix(cells: TodayCells, mode: MatrixMode, unit: MatrixUnit): MatrixRow[] {
  return matrixWeights(cells).map((w) => {
    const vals = MATRIX_COLS.map((d) => {
      const c = cells[d.id]?.[weightKey(w)];
      if (!c) return null;
      const div = unit === 'gram' ? w : 1;
      if (mode === 'jual') return c.sell === null ? null : c.sell / div;
      if (mode === 'buyback') return c.buyback === null ? null : c.buyback / div;
      return spreadPct(c.sell, c.buyback);
    });
    const avail = vals.filter((v): v is number => v !== null);
    const best =
      avail.length < 2 ? null : mode === 'buyback' ? Math.max(...avail) : Math.min(...avail);
    return { w, cells: vals.map((v) => ({ value: v, best: v !== null && v === best })) };
  });
}

// ---------------------------------------------------------------------------
// Tren

export const TREND_PERIODS = [
  { value: '7', days: 7, label: '7H' },
  { value: '30', days: 30, label: '30H' },
  { value: '90', days: 90, label: '90H' },
  { value: '365', days: 365, label: '1T' },
] as const;
export type TrendPeriod = (typeof TREND_PERIODS)[number]['value'];

/** Tanggal awal (inklusif) jendela `days` hari berakhir di `asOf`. */
export function trendFrom(asOf: string, days: number): string {
  const d = new Date(`${asOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

export interface TrendStats {
  hi: number;
  lo: number;
  avg: number;
  /** Perubahan persen titik pertama ke terakhir; null bila kurang dari dua titik. */
  changePct: number | null;
  count: number;
}

/** Statistik periode dari titik grafik (nilai null diabaikan); null bila tak ada nilai. */
export function trendStats(
  points: readonly (readonly [string, number | null])[],
): TrendStats | null {
  const v = points.map((p) => p[1]).filter((x): x is number => x !== null);
  const first = v[0];
  const last = v.at(-1);
  if (first === undefined || last === undefined) return null;
  return {
    hi: Math.max(...v),
    lo: Math.min(...v),
    avg: v.reduce((s, x) => s + x, 0) / v.length,
    changePct: v.length >= 2 && first > 0 ? (last / first - 1) * 100 : null,
    count: v.length,
  };
}

/** Series tren: jual 1 g per brand + Tabungan Emas per gram. */
export const TREND_DEFS: readonly CompareDef[] = pick(['lm-antam', 'ubsl-ubs', 'pg-g24', 'tab']);
