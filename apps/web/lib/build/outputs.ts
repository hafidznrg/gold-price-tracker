import {
  writeMacroCsv,
  writePriceCsv,
  type CatalogItem,
  type EventConfig,
  type MacroRow,
  type PriceRow,
  type SourceStatusFile,
  type SourcesFile,
  type SpotSnapshot,
} from '@gold/schema';
import {
  ANNUAL_PATH,
  GOLD_IDR_GRAM_PATH,
  LATEST_PATH,
  META_PATH,
  PREMIUM_ANTAM_PATH,
  macroCsvPath,
  macroJsonPath,
  seriesCsvPath,
  seriesJsonPath,
} from '../data/paths';
import type { LatestFile, MetaFile } from '../data/types';
import { buildAnnualFile, buildGoldIdrGramFile, buildPremiumAntamFile } from './derived';
import { buildLatest } from './latest';
import { buildMacroFiles } from './macro';
import { buildMeta } from './meta';
import { groupByFile, toSeriesFile } from './series';

export interface BuildInput {
  builtAt: Date;
  prices: readonly PriceRow[];
  macro: readonly MacroRow[];
  spot: SpotSnapshot | null;
  sources: SourcesFile;
  status: SourceStatusFile;
  catalog: readonly CatalogItem[];
  events: readonly EventConfig[];
  /** Tanggal libur `holidays.yml` (untuk kalender `business_days_id`). */
  holidays?: readonly string[];
}

export interface OutputFile {
  /** Relatif terhadap public/data/. */
  path: string;
  content: string;
}

export interface BuildResult {
  files: OutputFile[];
  latest: LatestFile;
  meta: MetaFile;
}

/** JSON ringkas; urutan kunci mengikuti urutan konstruksi objek (deterministik). */
export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

/** Semua file public/data/ dari data mentah, tanpa I/O. Terurut menurut path. */
export function buildOutputs(input: BuildInput): BuildResult {
  const groups = groupByFile(input.prices);
  const latest = buildLatest({
    groups,
    spot: input.spot,
    macroRows: input.macro,
    macroConfigs: input.sources.macro_series,
  });
  const meta = buildMeta({
    builtAt: input.builtAt,
    sources: input.sources,
    status: input.status,
    catalog: input.catalog,
    events: input.events,
    holidays: input.holidays ?? [],
    groups,
    macroRows: input.macro,
    latest,
  });

  const files: OutputFile[] = [
    { path: LATEST_PATH, content: toJson(latest) },
    { path: META_PATH, content: toJson(meta) },
  ];
  for (const g of groups) {
    files.push({ path: seriesJsonPath(g.file), content: toJson(toSeriesFile(g)) });
    files.push({ path: seriesCsvPath(g.file), content: writePriceCsv(g.rows) });
  }
  for (const m of buildMacroFiles(input.macro, input.sources.macro_series)) {
    files.push({ path: macroJsonPath(m.series), content: toJson(m) });
    const rows = input.macro.filter((r) => r.series === m.series);
    files.push({ path: macroCsvPath(m.series), content: writeMacroCsv(rows) });
  }
  // derived/*.json hanya bila ada data makro (tanpa itu tidak ada yang bisa dihitung).
  if (input.macro.length > 0) {
    const configs = input.sources.macro_series;
    files.push(
      { path: GOLD_IDR_GRAM_PATH, content: toJson(buildGoldIdrGramFile(input.macro, configs)) },
      { path: ANNUAL_PATH, content: toJson(buildAnnualFile(input.macro, configs, input.prices)) },
      {
        path: PREMIUM_ANTAM_PATH,
        content: toJson(buildPremiumAntamFile(input.prices, input.macro, configs)),
      },
    );
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, latest, meta };
}
