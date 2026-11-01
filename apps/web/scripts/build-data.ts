/**
 * Prebuild (P3-02, TECH-SPEC §8): CSV di data/ + config/ → apps/web/public/data/.
 *
 *   latest.json, meta.json, series/{file}.json, macro/{series}.json, csv/*.csv
 *
 * Path di-resolve relatif terhadap file ini, jadi bisa dijalankan dari cwd mana pun.
 * Logika transformasi ada di lib/build/ (diuji unit); skrip ini hanya I/O.
 * `BUILD_TIME` (ISO) menimpa waktu build agar output bisa direproduksi.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import {
  HolidaysFile,
  CatalogFile,
  EventsFile,
  SourceStatusFile,
  SourcesFile,
  SpotSnapshot,
  expandCatalog,
  readMacroCsv,
  readPriceCsv,
  type MacroRow,
  type PriceRow,
} from '@gold/schema';
import { buildOutputs } from '../lib/build/outputs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..');
const DATA = path.join(ROOT, 'data');
const CONFIG = path.join(ROOT, 'config');
const OUT = path.resolve(here, '..', 'public', 'data');

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

function csvFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.csv'))
    .sort()
    .map((f) => path.join(dir, f));
}

function readPrices(): PriceRow[] {
  const dir = path.join(DATA, 'prices');
  if (!existsSync(dir)) return [];
  const rows: PriceRow[] = [];
  const sources = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const source of sources) {
    for (const file of csvFiles(path.join(dir, source))) {
      try {
        rows.push(...readPriceCsv(read(file)));
      } catch (err) {
        throw new Error(`${path.relative(ROOT, file)}: ${(err as Error).message}`);
      }
    }
  }
  return rows;
}

function readMacro(): MacroRow[] {
  const rows: MacroRow[] = [];
  for (const file of csvFiles(path.join(DATA, 'macro'))) {
    try {
      rows.push(...readMacroCsv(read(file)));
    } catch (err) {
      throw new Error(`${path.relative(ROOT, file)}: ${(err as Error).message}`);
    }
  }
  return rows;
}

function readJsonIfExists(file: string): unknown {
  return existsSync(file) ? JSON.parse(read(file)) : null;
}

function yaml(name: string): unknown {
  return parseYaml(read(path.join(CONFIG, name)));
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function main(): void {
  const started = Date.now();
  const builtAt = process.env.BUILD_TIME ? new Date(process.env.BUILD_TIME) : new Date();
  if (Number.isNaN(builtAt.getTime())) throw new Error(`BUILD_TIME tidak valid`);

  const spotRaw = readJsonIfExists(path.join(DATA, 'macro', 'spot.json'));
  const statusRaw = readJsonIfExists(path.join(DATA, 'meta', 'status.json'));

  const result = buildOutputs({
    builtAt,
    prices: readPrices(),
    macro: readMacro(),
    spot: spotRaw === null ? null : SpotSnapshot.parse(spotRaw),
    sources: SourcesFile.parse(yaml('sources.yml')),
    status: statusRaw === null ? {} : SourceStatusFile.parse(statusRaw),
    catalog: expandCatalog(CatalogFile.parse(yaml('catalog.yml'))),
    events: EventsFile.parse(yaml('events.yml')).events,
    holidays: HolidaysFile.parse(yaml('holidays.yml')).holidays.map((h) => h.date),
  });

  rmSync(OUT, { recursive: true, force: true });
  let total = 0;
  for (const f of result.files) {
    const target = path.join(OUT, f.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, f.content);
    const size = Buffer.byteLength(f.content);
    total += size;
    console.log(`  ${f.path.padEnd(36)} ${kb(size).padStart(10)}`);
  }
  const { latest, meta } = result;
  console.log(
    `[build-data] ${result.files.length} file, ${kb(total)} → ${path.relative(ROOT, OUT)} ` +
      `(${meta.series.length} series, ${meta.macro.filter((m) => m.rows > 0).length} seri makro, ` +
      `spot ${latest.spot ? 'ada' : 'kosong'}, data s.d. ${latest.as_of ?? '—'}, ` +
      `${Date.now() - started} ms)`,
  );
}

main();
