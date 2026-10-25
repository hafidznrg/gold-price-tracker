import path from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { ScraperId } from '@gold/schema';
import { loadConfig, loadStatus } from './config';
import { getScraper } from './sources';

// TECH-SPEC §10. Kode keluar (WORKFLOWS §2.3): 0 sukses · 1 gagal · 3 stale di hari diharapkan.
// Kode 2 dipakai untuk kesalahan pemakaian dan perintah yang belum diimplementasikan.

export const EXIT = { OK: 0, FAILED: 1, USAGE: 2, STALE: 3 } as const;

class UsageError extends Error {}

type Options = NonNullable<ParseArgsConfig['options']>;

interface Command {
  summary: string;
  options: Options;
  /** Tugas rencana yang mengimplementasikan perintah ini. */
  task: string;
  run?: (values: Record<string, unknown>) => Promise<number>;
}

const root = { type: 'string' } as const;

const COMMANDS: Record<string, Command> = {
  plan: {
    summary: 'Pilih sumber yang perlu dijalankan dan tulis matrix ke $GITHUB_OUTPUT',
    task: 'P1-08',
    options: {
      root,
      workflow: { type: 'string' },
      event: { type: 'string' },
      schedule: { type: 'string' },
      sources: { type: 'string' },
      force: { type: 'string' },
    },
  },
  scrape: {
    summary: 'Fetch → parse → validasi satu sumber, tulis artifact ke --out',
    task: 'P1-03',
    options: {
      root,
      source: { type: 'string' },
      slot: { type: 'string' },
      out: { type: 'string' },
    },
  },
  merge: {
    summary: 'Upsert hasil scrape ke data/ dan tulis summary.json',
    task: 'P1-02',
    options: {
      root,
      in: { type: 'string' },
      expected: { type: 'string' },
      summary: { type: 'string' },
      origin: { type: 'string' },
      'dry-run': { type: 'string' },
    },
  },
  probe: {
    summary: 'Fetch + parse + validasi satu sumber tanpa menulis data',
    task: 'P0-11',
    options: { root, source: { type: 'string' }, out: { type: 'string' } },
    run: async (values) => {
      const rootDir = requireRoot(values);
      const source = ScraperId.safeParse(values.source);
      if (!source.success) {
        throw new UsageError(`--source wajib salah satu dari: ${ScraperId.options.join(', ')}`);
      }
      const config = await loadConfig(rootDir);
      if (!config.sources.some((s) => s.id === source.data)) {
        throw new UsageError(`Sumber ${source.data} tidak ada di config/sources.yml`);
      }
      if (!getScraper(source.data)) {
        console.error(`Modul sumber ${source.data} belum diimplementasikan.`);
        return EXIT.USAGE;
      }
      console.error('probe belum diimplementasikan (P0-11).');
      return EXIT.USAGE;
    },
  },
  check: {
    summary: 'Validasi config/ dan data/meta/status.json',
    task: 'P0-05',
    options: { root },
    run: async (values) => {
      const rootDir = requireRoot(values);
      const [config, status] = await Promise.all([loadConfig(rootDir), loadStatus(rootDir)]);
      console.log(
        [
          `sources:      ${config.sources.length} (${config.sources.filter((s) => s.enabled).length} aktif)`,
          `macro_series: ${config.macroSeries.length}`,
          `catalog:      ${config.catalog.length} gramasi`,
          `holidays:     ${config.holidays.length}`,
          `events:       ${config.events.length}`,
          `status.json:  ${Object.keys(status).length} sumber`,
        ].join('\n'),
      );
      return EXIT.OK;
    },
  },
};

function requireRoot(values: Record<string, unknown>): string {
  const value = values.root;
  if (typeof value !== 'string' || value === '') throw new UsageError('--root wajib diisi');
  // `pnpm --filter` menjalankan dari folder paket, jadi path relatif mudah salah (WORKFLOWS §3.2).
  if (!path.isAbsolute(value)) throw new UsageError(`--root harus path absolut: ${value}`);
  return value;
}

function usage(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((c) => c.length));
  return [
    'Pemakaian: pnpm --filter scraper start <perintah> --root "$PWD" [opsi]',
    '',
    ...Object.entries(COMMANDS).map(([name, c]) => `  ${name.padEnd(width)}  ${c.summary}`),
  ].join('\n');
}

export async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === '--help' || name === '-h') {
    console.log(usage());
    return name ? EXIT.OK : EXIT.USAGE;
  }
  const command = COMMANDS[name];
  if (!command) {
    console.error(`Perintah tidak dikenal: ${name}\n\n${usage()}`);
    return EXIT.USAGE;
  }
  try {
    const { values } = parseArgs({ args: rest, options: command.options, strict: true });
    if (!command.run) {
      requireRoot(values);
      console.error(`${name} belum diimplementasikan (${command.task}).`);
      return EXIT.USAGE;
    }
    return await command.run(values);
  } catch (err) {
    if (
      err instanceof UsageError ||
      (err as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')
    ) {
      console.error(`${(err as Error).message}\n\n${usage()}`);
      return EXIT.USAGE;
    }
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    return EXIT.FAILED;
  }
}
