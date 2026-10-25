import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CatalogFile,
  EventsFile,
  expandCatalog,
  HolidaysFile,
  SourceStatusFile,
  SourcesFile,
  type CatalogItem,
  type EventConfig,
  type Holiday,
  type MacroSeriesConfig,
  type SourceConfig,
} from '@gold/schema';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';

export interface ProjectConfig {
  sources: SourceConfig[];
  macroSeries: MacroSeriesConfig[];
  catalog: CatalogItem[];
  holidays: Holiday[];
  events: EventConfig[];
}

async function readYaml<T extends z.ZodType>(file: string, schema: T): Promise<z.infer<T>> {
  const text = await readFile(file, 'utf8');
  const result = schema.safeParse(parseYaml(text));
  if (!result.success) {
    throw new Error(`${file} tidak valid:\n${result.error.message}`);
  }
  return result.data;
}

/** Baca dan validasi semua file di `config/` (D-13). */
export async function loadConfig(root: string): Promise<ProjectConfig> {
  const dir = path.join(root, 'config');
  const [sources, catalog, holidays, events] = await Promise.all([
    readYaml(path.join(dir, 'sources.yml'), SourcesFile),
    readYaml(path.join(dir, 'catalog.yml'), CatalogFile),
    readYaml(path.join(dir, 'holidays.yml'), HolidaysFile),
    readYaml(path.join(dir, 'events.yml'), EventsFile),
  ]);
  return {
    sources: sources.sources,
    macroSeries: sources.macro_series,
    catalog: expandCatalog(catalog),
    holidays: holidays.holidays,
    events: events.events,
  };
}

/** Baca `data/meta/status.json` (state bot); file yang belum ada = objek kosong. */
export async function loadStatus(root: string): Promise<SourceStatusFile> {
  const file = path.join(root, 'data', 'meta', 'status.json');
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  const result = SourceStatusFile.safeParse(JSON.parse(text));
  if (!result.success) throw new Error(`${file} tidak valid:\n${result.error.message}`);
  return result.data;
}
