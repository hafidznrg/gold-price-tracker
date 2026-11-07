// Salinan ringan `asOf` dan `forwardFill` dari @gold/schema (derive.ts, DATA-MODEL §6.2): impor
// nilai dari paket itu menyeret zod dan date-fns-tz ke bundel klien. Kesetaraannya dijaga uji
// di forward-fill.test.ts.

export interface Point {
  date: string;
  value: number;
}

export interface FilledPoint extends Point {
  /** `true` bila nilai disalin dari titik sebelumnya. */
  filled: boolean;
  /** Tanggal titik asal nilai. */
  from_date: string;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/** Titik terakhir ≤ `date` dalam toleransi hari kalender; `points` terurut naik. */
export function asOf(points: readonly Point[], date: string, toleranceDays: number): Point | null {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.date <= date) lo = mid + 1;
    else hi = mid;
  }
  const hit = points[lo - 1];
  if (!hit || daysBetween(hit.date, date) > toleranceDays) return null;
  return hit;
}

/** *Forward-fill* untuk tampilan saja: tiap tanggal di `dates` mendapat titik terakhir ≤ tanggal itu. */
export function forwardFill(
  points: readonly Point[],
  dates: readonly string[],
  maxDays = Number.POSITIVE_INFINITY,
): FilledPoint[] {
  const out: FilledPoint[] = [];
  for (const date of dates) {
    const hit = asOf(points, date, maxDays);
    if (hit) out.push({ date, value: hit.value, filled: hit.date !== date, from_date: hit.date });
  }
  return out;
}
