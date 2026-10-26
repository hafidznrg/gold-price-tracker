import { z } from 'zod';
import { canonicalWeight } from './normalize';
import { IsoDate } from './rows';
import {
  Brand,
  MacroSource,
  MacroUnit,
  PriceSource,
  Product,
  ScraperId,
  Series,
  Workflow,
} from './enums';

// DATA-MODEL §3.5 — bentuk file di config/ (ditulis manusia lewat PR, D-13).

export const UPDATE_CALENDARS = ['daily', 'weekdays', 'business_days_id', 'monthly'] as const;
export const UpdateCalendar = z.enum(UPDATE_CALENDARS);
export type UpdateCalendar = z.infer<typeof UpdateCalendar>;

export const FetchMethod = z.enum(['http', 'browser', 'api', 'file']);
export type FetchMethod = z.infer<typeof FetchMethod>;

/** Pasangan cron (primary + retry) tempat sumber dijalankan dalam workflow-nya (WORKFLOWS §2.2). */
export const ScheduleWindow = z.enum(['day', 'evening']);
export type ScheduleWindow = z.infer<typeof ScheduleWindow>;

export const SourceConfig = z.object({
  id: ScraperId,
  kind: z.enum(['prices', 'macro']),
  url: z.url(),
  fetch_method: FetchMethod,
  workflow: Workflow,
  update_calendar: UpdateCalendar,
  schedule_window: ScheduleWindow.default('day'),
  stale_is_error_on_expected_day: z.boolean().default(false),
  parser_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  enabled: z.boolean(),
  notes: z.string().optional(),
});
export type SourceConfig = z.infer<typeof SourceConfig>;

export const MacroSeriesConfig = z.object({
  id: Series,
  concept: z.enum(['gold_usd', 'usd_idr']),
  unit: MacroUnit,
  source: MacroSource,
  precedence: z.number().int().positive(),
});
export type MacroSeriesConfig = z.infer<typeof MacroSeriesConfig>;

function uniqueBy<T>(key: (item: T) => string, label: string) {
  return (items: T[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    for (const item of items) {
      const k = key(item);
      if (seen.has(k)) ctx.addIssue({ code: 'custom', message: `${label} duplikat: ${k}` });
      seen.add(k);
    }
  };
}

export const SourcesFile = z.object({
  sources: z.array(SourceConfig).superRefine(uniqueBy((s) => s.id, 'source id')),
  macro_series: z.array(MacroSeriesConfig).superRefine(uniqueBy((s) => s.id, 'series id')),
});
export type SourcesFile = z.infer<typeof SourcesFile>;

/** Satu grup di catalog.yml: beberapa gramasi dengan rentang aktif yang sama. */
export const CatalogGroup = z
  .object({
    source: PriceSource,
    brand: Brand,
    product: Product,
    weights: z.array(z.number().positive()).min(1),
    active_from: IsoDate,
    active_to: IsoDate.nullable().default(null),
  })
  .refine((g) => g.active_to === null || g.active_to >= g.active_from, {
    message: 'active_to harus ≥ active_from',
    path: ['active_to'],
  });

export const CatalogFile = z.object({ items: z.array(CatalogGroup) });
export type CatalogFile = z.infer<typeof CatalogFile>;

/** `CATALOG_ITEM` per gramasi (kunci `source, brand, product, weight_g`). */
export interface CatalogItem {
  source: PriceSource;
  brand: Brand;
  product: Product;
  weight_g: number;
  active_from: string;
  active_to: string | null;
}

export function catalogItemKey(
  item: Pick<CatalogItem, 'source' | 'brand' | 'product' | 'weight_g'>,
) {
  return [item.source, item.brand, item.product, canonicalWeight(item.weight_g)].join('|');
}

/** Pecah grup menjadi `CATALOG_ITEM`; melempar error bila ada kunci yang tumpang tindih. */
export function expandCatalog(file: CatalogFile): CatalogItem[] {
  const items = file.items.flatMap((g) =>
    g.weights.map((w) => ({
      source: g.source,
      brand: g.brand,
      product: g.product,
      weight_g: w,
      active_from: g.active_from,
      active_to: g.active_to,
    })),
  );
  const byKey = new Map<string, CatalogItem[]>();
  for (const item of items) {
    const k = catalogItemKey(item);
    byKey.set(k, [...(byKey.get(k) ?? []), item]);
  }
  for (const [k, group] of byKey) {
    const sorted = [...group].sort((a, b) => (a.active_from < b.active_from ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      if (prev.active_to === null || prev.active_to >= sorted[i]!.active_from) {
        throw new Error(`catalog.yml: rentang aktif tumpang tindih untuk ${k}`);
      }
    }
  }
  return items;
}

/** Apakah gramasi aktif di katalog pada tanggal `date` (aturan V-02). */
export function isInCatalog(
  items: readonly CatalogItem[],
  row: Pick<CatalogItem, 'source' | 'brand' | 'product' | 'weight_g'> & { date: string },
): boolean {
  const k = catalogItemKey(row);
  return items.some(
    (i) =>
      catalogItemKey(i) === k &&
      i.active_from <= row.date &&
      (i.active_to === null || row.date <= i.active_to),
  );
}

export const Holiday = z.object({
  date: IsoDate,
  name: z.string().min(1),
  kind: z.enum(['libur_nasional', 'cuti_bersama']),
});
export type Holiday = z.infer<typeof Holiday>;

export const HolidaysFile = z.object({
  holidays: z.array(Holiday).superRefine(uniqueBy((h) => `${h.date} ${h.name}`, 'libur')),
});
export type HolidaysFile = z.infer<typeof HolidaysFile>;

export const EventConfig = z.object({
  date: IsoDate,
  label: z.string().min(1),
  kind: z.enum(['crisis', 'peak', 'policy', 'other']),
});
export type EventConfig = z.infer<typeof EventConfig>;

export const EventsFile = z.object({ events: z.array(EventConfig) });
export type EventsFile = z.infer<typeof EventsFile>;
