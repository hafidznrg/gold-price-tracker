import { compareMacroRows, type MacroRow, type MacroSeriesConfig } from '@gold/schema';
import { MACRO_FIELDS, type MacroFile, type MacroRowTuple } from '../data/types';

/** File `macro/{series}.json` untuk setiap seri terkonfigurasi yang punya data. */
export function buildMacroFiles(
  rows: readonly MacroRow[],
  configs: readonly MacroSeriesConfig[],
): MacroFile[] {
  const out: MacroFile[] = [];
  for (const cfg of configs) {
    const own = rows.filter((r) => r.series === cfg.id).sort(compareMacroRows);
    if (own.length === 0) continue;
    out.push({
      series: cfg.id,
      unit: cfg.unit,
      fields: MACRO_FIELDS,
      rows: own.map((r): MacroRowTuple => [r.date, r.frequency, r.value, r.source]),
    });
  }
  return out;
}
