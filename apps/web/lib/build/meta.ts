import {
  SCHEMA_VERSION,
  jakartaDate,
  utcIso,
  type CatalogItem,
  type EventConfig,
  type Frequency,
  type MacroRow,
  type PriceSource,
  type SourceStatusFile,
  type SourcesFile,
} from '@gold/schema';
import {
  BRAND_LABELS,
  MACRO_COLORS,
  MACRO_SERIES_LABELS,
  PRODUCT_LABELS,
  SCRAPER_LABELS,
  SOURCE_LABELS,
  colorToken,
  compareFileIds,
  displayBrand,
  productKind,
  seriesFileId,
  seriesGroupLabel,
} from '../data/catalog';
import { macroCsvPath, macroJsonPath, seriesCsvPath, seriesJsonPath } from '../data/paths';
import type {
  DownloadEntry,
  DownloadLastMacro,
  LatestFile,
  MetaCatalogGroup,
  MetaFile,
  MetaMacroSeries,
  MetaSeries,
  MetaSeriesFile,
  MetaSource,
  ProductKind,
} from '../data/types';
import { splitSeries, type FileGroup } from './series';

const FREQ_ORDER: Frequency[] = ['D', 'M', 'A'];

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function buildMetaSources(
  sources: SourcesFile,
  status: SourceStatusFile,
  latest: LatestFile,
  today: string,
): MetaSource[] {
  return sources.sources.map((cfg) => {
    const st = status[cfg.id] ?? null;
    const price = latest.sources.find((s) => s.source === cfg.id);
    const lastDate = price ? price.last_data_date : (st?.last_data_date ?? null);
    return {
      id: cfg.id,
      kind: cfg.kind,
      label: SCRAPER_LABELS[cfg.id],
      url: cfg.url,
      enabled: cfg.enabled,
      update_calendar: cfg.update_calendar,
      status: st && {
        last_status: st.last_status,
        last_success_at: st.last_success_at,
        last_data_date: st.last_data_date,
        consecutive_failures: st.consecutive_failures,
        updated_at: st.updated_at,
      },
      last_data_date: lastDate,
      source_updated_at: price?.source_updated_at ?? null,
      data_age_days: lastDate ? daysBetween(lastDate, today) : null,
    };
  });
}

/** Gramasi aktif per tanggal `today`, digabung per source × brand × product. */
export function buildMetaCatalog(items: readonly CatalogItem[], today: string): MetaCatalogGroup[] {
  const map = new Map<string, MetaCatalogGroup>();
  for (const it of items) {
    if (it.active_from > today || (it.active_to !== null && it.active_to < today)) continue;
    const k = `${it.source}-${it.brand}-${it.product}`;
    let g = map.get(k);
    if (!g) {
      g = {
        source: it.source,
        brand: it.brand,
        product: it.product,
        kind: productKind(it.product),
        weights: [],
      };
      map.set(k, g);
    }
    if (!g.weights.includes(it.weight_g)) g.weights.push(it.weight_g);
  }
  const out = [...map.values()];
  for (const g of out) g.weights.sort((a, b) => a - b);
  return out.sort((a, b) => compareFileIds(seriesFileId(a), seriesFileId(b)) || (a.product < b.product ? -1 : 1));
}

export function buildMetaFiles(groups: readonly FileGroup[]): MetaSeriesFile[] {
  return groups
    .filter((g) => g.rows.length > 0)
    .map((g) => ({
      file: g.file,
      source: g.source,
      brand: g.brand,
      product: g.product,
      kind: productKind(g.product),
      json: seriesJsonPath(g.file),
      csv: seriesCsvPath(g.file),
      rows: g.rows.length,
      first_date: g.rows[0]!.date,
      last_date: g.rows.at(-1)!.date,
    }))
    .sort((a, b) => compareFileIds(a.file, b.file));
}

export function buildMetaSeries(groups: readonly FileGroup[]): MetaSeries[] {
  const sorted = [...groups].sort((a, b) => compareFileIds(a.file, b.file));
  return sorted.flatMap((g) =>
    splitSeries(g).map((s) => ({
      ...s.ref,
      key: s.key,
      file: s.file,
      rows: s.rows.length,
      first_date: s.rows[0]!.date,
      last_date: s.rows.at(-1)!.date,
      first_sell_date: s.rows.find((r) => r.sell_price !== null)?.date ?? null,
      first_buyback_date: s.rows.find((r) => r.buyback_price !== null)?.date ?? null,
    })),
  );
}

export function buildMetaMacro(rows: readonly MacroRow[], sources: SourcesFile): MetaMacroSeries[] {
  return sources.macro_series.map((cfg) => {
    const own = rows.filter((r) => r.series === cfg.id);
    const dates = own.map((r) => r.date).sort();
    const has = own.length > 0;
    return {
      id: cfg.id,
      concept: cfg.concept,
      unit: cfg.unit,
      source: cfg.source,
      precedence: cfg.precedence,
      frequencies: FREQ_ORDER.filter((f) => own.some((r) => r.frequency === f)),
      rows: own.length,
      first_date: dates[0] ?? null,
      last_date: dates.at(-1) ?? null,
      json: has ? macroJsonPath(cfg.id) : null,
      csv: has ? macroCsvPath(cfg.id) : null,
    };
  });
}

/**
 * Kartu unduhan halaman Data. Ritel: satu kartu per sumber × jenis produk (mockup: "Emas
 * batangan · Pegadaian" menggabungkan tiga brand), file per brand. Makro: satu kartu per seri
 * yang punya data.
 */
export function buildDownloads(
  files: readonly MetaSeriesFile[],
  latest: LatestFile,
  macro: readonly MetaMacroSeries[],
  macroRows: readonly MacroRow[],
): DownloadEntry[] {
  const out: DownloadEntry[] = [];
  const groups = new Map<string, MetaSeriesFile[]>();
  for (const f of files) {
    const k = `${f.source}|${f.kind}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  for (const list of groups.values()) {
    const first = list[0]!;
    const source: PriceSource = first.source;
    const kind: ProductKind = first.kind;
    const single = list.length === 1;
    // Brand utama kartu: satu-satunya, atau brand yang hanya ada di sumber ini (Galeri24).
    const head =
      (single
        ? first
        : list.find((f) => !files.some((o) => o.source !== source && o.brand === f.brand))) ??
      first;
    const hl = latest.highlights.find((h) => h.file === head.file);
    const ls = hl && latest.series.find((s) => s.key === hl.series_key);
    const dates = list.flatMap((f) => [f.first_date, f.last_date]).sort();
    out.push({
      id: single ? head.file : `${source}-${kind}`,
      group: 'retail',
      label: single
        ? seriesGroupLabel(head)
        : `${PRODUCT_LABELS[head.product] ?? head.product} · ${SOURCE_LABELS[source]}`,
      color: colorToken(head),
      files: list.map((f) => ({
        label: single ? displayBrand(f) : BRAND_LABELS[f.brand],
        json: f.json,
        csv: f.csv,
        rows: f.rows,
      })),
      rows: list.reduce((n, f) => n + f.rows, 0),
      first_date: dates[0] ?? null,
      last_date: dates.at(-1) ?? null,
      last_updated_at: ls?.source_updated_at ?? null,
      static: false,
      last: ls
        ? {
            kind: 'retail',
            brand: ls.brand,
            product: ls.product,
            variant: ls.variant,
            w: ls.w,
            date: ls.date,
            sell: ls.sell,
            buyback: ls.buyback,
          }
        : null,
    });
  }
  for (const m of macro) {
    if (m.rows === 0 || !m.json || !m.csv) continue;
    const own = macroRows.filter((r) => r.series === m.id);
    // Titik terakhir; pada tanggal sama utamakan frekuensi tertinggi (D, lalu M, lalu A).
    const last = own.reduce((best, r) =>
      r.date > best.date ||
      (r.date === best.date && FREQ_ORDER.indexOf(r.frequency) < FREQ_ORDER.indexOf(best.frequency))
        ? r
        : best,
    );
    const lastInfo: DownloadLastMacro = {
      kind: 'macro',
      series: m.id,
      date: last.date,
      frequency: last.frequency,
      value: last.value,
      unit: m.unit,
    };
    out.push({
      id: m.id,
      group: 'macro',
      label: MACRO_SERIES_LABELS[m.id],
      color: MACRO_COLORS[m.id],
      files: [{ label: MACRO_SERIES_LABELS[m.id], json: m.json, csv: m.csv, rows: m.rows }],
      rows: m.rows,
      first_date: m.first_date,
      last_date: m.last_date,
      last_updated_at: null,
      static: m.frequencies.length === 1 && m.frequencies[0] === 'A',
      last: lastInfo,
    });
  }
  return out;
}

export interface MetaInput {
  builtAt: Date;
  sources: SourcesFile;
  status: SourceStatusFile;
  catalog: readonly CatalogItem[];
  events: readonly EventConfig[];
  holidays?: readonly string[];
  groups: readonly FileGroup[];
  macroRows: readonly MacroRow[];
  latest: LatestFile;
}

export function buildMeta(input: MetaInput): MetaFile {
  const today = jakartaDate(input.builtAt);
  const files = buildMetaFiles(input.groups);
  const macro = buildMetaMacro(input.macroRows, input.sources);
  return {
    schema_version: SCHEMA_VERSION,
    built_at: utcIso(input.builtAt),
    as_of: input.latest.as_of,
    sources: buildMetaSources(input.sources, input.status, input.latest, today),
    catalog: buildMetaCatalog(input.catalog, today),
    files,
    series: buildMetaSeries(input.groups),
    macro,
    events: [...input.events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    downloads: buildDownloads(files, input.latest, macro, input.macroRows),
    holidays: [...new Set(input.holidays ?? [])].sort(),
  };
}
