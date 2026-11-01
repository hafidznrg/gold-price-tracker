import type { Brand, PriceRow, PriceSource, Product } from '@gold/schema';
import { seriesFileId, seriesKey, weightKey } from '../data/catalog';
import { SERIES_FIELDS, type SeriesFile, type SeriesRef, type SeriesRowTuple } from '../data/types';

// Pengelompokan baris CSV menjadi file series ringkas (TECH-SPEC §8).

export interface FileGroup {
  file: string;
  source: PriceSource;
  brand: Brand;
  product: Product;
  location: string;
  /** Terurut: date, variant, w. */
  rows: PriceRow[];
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareRows(a: PriceRow, b: PriceRow): number {
  return cmp(a.date, b.date) || cmp(a.variant, b.variant) || a.weight_g - b.weight_g;
}

/** Kelompokkan baris per file `{source}-{brand}[-{product}]`, terurut menurut id file. */
export function groupByFile(rows: readonly PriceRow[]): FileGroup[] {
  const groups = new Map<string, FileGroup>();
  const productOf = new Map<string, string>();
  for (const r of rows) {
    const file = seriesFileId(r);
    const prod = productOf.get(file);
    if (prod !== undefined && prod !== r.product) {
      throw new Error(`file series ${file} memuat dua produk (${prod}, ${r.product})`);
    }
    productOf.set(file, r.product);
    let g = groups.get(file);
    if (!g) {
      g = {
        file,
        source: r.source,
        brand: r.brand,
        product: r.product,
        location: r.location,
        rows: [],
      };
      groups.set(file, g);
    }
    if (g.location !== r.location) {
      throw new Error(`file series ${file} memuat dua lokasi (${g.location}, ${r.location})`);
    }
    g.rows.push(r);
  }
  const out = [...groups.values()].sort((a, b) => cmp(a.file, b.file));
  for (const g of out) g.rows.sort(compareRows);
  return out;
}

export function toSeriesFile(group: FileGroup): SeriesFile {
  return {
    file: group.file,
    source: group.source,
    brand: group.brand,
    product: group.product,
    location: group.location,
    fields: SERIES_FIELDS,
    rows: group.rows.map((r): SeriesRowTuple => [
      r.date,
      r.variant,
      r.weight_g,
      r.sell_price,
      r.buyback_price,
    ]),
  };
}

export function refOf(r: PriceRow): SeriesRef {
  return {
    source: r.source,
    brand: r.brand,
    product: r.product,
    variant: r.variant,
    w: r.weight_g,
  };
}

export interface SeriesGroup {
  key: string;
  file: string;
  ref: SeriesRef;
  /** Terurut menurut tanggal. */
  rows: PriceRow[];
}

/** Pecah baris file menjadi series per `variant × w`, urut variant lalu berat. */
export function splitSeries(group: FileGroup): SeriesGroup[] {
  const map = new Map<string, SeriesGroup>();
  for (const r of group.rows) {
    const k = `${r.variant}|${weightKey(r.weight_g)}`;
    let s = map.get(k);
    if (!s) {
      const ref = refOf(r);
      s = { key: seriesKey(ref), file: group.file, ref, rows: [] };
      map.set(k, s);
    }
    s.rows.push(r);
  }
  return [...map.values()].sort((a, b) => cmp(a.ref.variant, b.ref.variant) || a.ref.w - b.ref.w);
}
