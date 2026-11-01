/** Rentang waktu Explorer/Spread: preset relatif terhadap tanggal data terakhir, atau kustom. */
export const RANGE_PRESETS = ['7H', '1B', '3B', '6B', 'YTD', '1T', 'Semua'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export type RangeValue = RangePreset | { from: string; to: string };

const DAY_MS = 86_400_000;

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Mundur `months` bulan kalender; hari dijepit ke akhir bulan tujuan (31 Mei − 3B → 28/29 Feb). */
function subMonths(date: string, months: number): string {
  const d = parse(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return iso(target);
}

/**
 * Tanggal awal–akhir (inklusif) untuk preset, berpatokan pada `lastDate` (`YYYY-MM-DD`).
 * 7H = 7 hari kalender termasuk `lastDate`; 1B/3B/6B/1T = mundur bulan/tahun kalender;
 * YTD = 1 Januari tahun `lastDate`; Semua = `from: null` (mulai dari data paling awal).
 */
export function rangeToDates(
  range: RangeValue,
  lastDate: string,
): { from: string | null; to: string } {
  if (typeof range === 'object') return { from: range.from, to: range.to };
  switch (range) {
    case '7H':
      return { from: iso(new Date(parse(lastDate).getTime() - 6 * DAY_MS)), to: lastDate };
    case '1B':
      return { from: subMonths(lastDate, 1), to: lastDate };
    case '3B':
      return { from: subMonths(lastDate, 3), to: lastDate };
    case '6B':
      return { from: subMonths(lastDate, 6), to: lastDate };
    case 'YTD':
      return { from: `${lastDate.slice(0, 4)}-01-01`, to: lastDate };
    case '1T':
      return { from: subMonths(lastDate, 12), to: lastDate };
    case 'Semua':
      return { from: null, to: lastDate };
  }
}
