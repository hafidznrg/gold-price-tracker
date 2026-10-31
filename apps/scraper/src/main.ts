import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import {
  addDaysIso,
  isIsoDate,
  jakartaDate,
  Origin,
  ScraperId,
  Slot,
  Workflow,
  type Trigger,
} from '@gold/schema';
import { loadConfig, loadStatus } from './config';
import { merge, type MergeSummary } from './pipeline/merge';
import {
  deliver,
  formatSummary,
  githubIssueClient,
  planNotifications,
  telegramSender,
} from './pipeline/notify';
import { plan, PlanError } from './pipeline/plan';
import {
  decideQuarantine,
  parseQuarantinePath,
  pendingFiles,
  QuarantineError,
  resolveQuarantineIssue,
} from './pipeline/quarantine';
import { describeRun, scrape } from './pipeline/scrape';
import { DEFAULT_USER_AGENT } from './probe/http';
import { formatReport, runProbe, writeStepSummary } from './probe/run';
import { PROBE_TARGETS } from './probe/targets';

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
    run: async (values) => {
      const rootDir = requireRoot(values);
      const workflow = parseEnum(Workflow, values.workflow, '--workflow');
      const [config, status] = await Promise.all([loadConfig(rootDir), loadStatus(rootDir)]);
      let result;
      try {
        result = plan({
          workflow,
          event: str(values.event),
          schedule: str(values.schedule),
          sources: str(values.sources),
          force: str(values.force) === 'true',
          config,
          status,
          now: new Date(),
        });
      } catch (err) {
        if (err instanceof PlanError) throw new UsageError(err.message);
        throw err;
      }
      console.log(
        [
          `slot: ${result.slot} · tanggal sasaran: ${result.date}`,
          `sumber: ${result.sources.join(', ') || '(tidak ada)'}`,
          ...result.skipped.map((s) => `lewati ${s.source}: ${s.reason}`),
        ].join('\n'),
      );
      await setOutputs({
        matrix: JSON.stringify(result.matrix),
        sources: result.sources.join(','),
        slot: result.slot,
        date: result.date,
        has_work: String(result.has_work),
      });
      return EXIT.OK;
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
      date: { type: 'string' },
    },
    run: async (values) => {
      const rootDir = requireRoot(values);
      const source = parseEnum(ScraperId, values.source, '--source');
      const run = await scrape({
        root: rootDir,
        source,
        slot: values.slot === undefined ? 'manual' : parseEnum(Slot, values.slot, '--slot'),
        trigger: triggerFromEnv(),
        out: requireAbsolute(values.out, '--out'),
        runId: runIdFromEnv(),
        userAgent: process.env.SCRAPER_USER_AGENT || DEFAULT_USER_AGENT,
        date: targetDateOption(values.date),
      });
      console.log(describeRun(run));
      return run.exit_code;
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
      date: { type: 'string' },
    },
    run: async (values) => {
      const rootDir = requireRoot(values);
      const expected = str(values.expected)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => parseEnum(ScraperId, s, '--expected'));
      const workflow = Workflow.safeParse(process.env.GITHUB_WORKFLOW);
      const summary = await merge({
        root: rootDir,
        inDir: requireAbsolute(values.in, '--in'),
        expected,
        runId: runIdFromEnv(),
        origin:
          values.origin === undefined ? 'scrape' : parseEnum(Origin, values.origin, '--origin'),
        dryRun: str(values['dry-run']) === 'true',
        date: targetDateOption(values.date),
        fallback: {
          workflow: workflow.success ? workflow.data : 'scrape-retail',
          trigger: triggerFromEnv(),
        },
      });
      if (values.summary !== undefined) {
        const file = requireAbsolute(values.summary, '--summary');
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(summary, null, 2) + '\n');
      }
      console.log(summary.commit_message);
      for (const p of summary.changed_paths)
        console.log(`  ${summary.dry_run ? '(dry) ' : ''}${p}`);
      await setOutputs({ commit_message: summary.commit_message });
      return EXIT.OK;
    },
  },
  notify: {
    summary: 'Ringkasan run ke step summary, Telegram, dan Issue per sumber (WORKFLOWS §4)',
    task: 'P1-05',
    options: {
      summary: { type: 'string' },
      'merge-result': { type: 'string' },
      'run-url': { type: 'string' },
    },
    run: async (values) => {
      let summary: MergeSummary | null = null;
      if (values.summary !== undefined) {
        try {
          summary = JSON.parse(
            await readFile(requireAbsolute(values.summary, '--summary'), 'utf8'),
          ) as MergeSummary;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
      }
      const mergeResult = str(values['merge-result']) || 'success';
      const runUrl = str(values['run-url']);
      const text = formatSummary(summary, mergeResult, runUrl);
      console.log(text);
      if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);

      const { GH_TOKEN, GITHUB_REPOSITORY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
      const errors = await deliver(planNotifications(summary, mergeResult, runUrl), runUrl, {
        issues:
          GH_TOKEN && GITHUB_REPOSITORY ? githubIssueClient(GITHUB_REPOSITORY, GH_TOKEN) : null,
        telegram:
          TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID
            ? telegramSender(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
            : null,
        now: new Date(),
        log: (msg) => console.log(msg),
      });
      // Notifikasi yang gagal terkirim harus terlihat sebagai job merah.
      return errors > 0 ? EXIT.FAILED : EXIT.OK;
    },
  },
  quarantine: {
    summary: 'Putuskan batch karantina: --phase apply (data/) lalu --phase issue (setelah push)',
    task: 'P1-12',
    options: {
      root,
      path: { type: 'string' },
      decision: { type: 'string' },
      note: { type: 'string' },
      phase: { type: 'string' },
      'run-url': { type: 'string' },
    },
    run: async (values) => {
      const rootDir = requireRoot(values);
      const decision = str(values.decision);
      if (decision !== 'approve' && decision !== 'reject') {
        throw new UsageError(`--decision wajib approve atau reject: ${decision}`);
      }
      const decidedBy = process.env.GITHUB_ACTOR || 'local';
      const note = str(values.note) || undefined;
      const phase = str(values.phase) || 'apply';
      let target;
      try {
        target = parseQuarantinePath(str(values.path));
      } catch (err) {
        if (err instanceof QuarantineError) throw new UsageError(err.message);
        throw err;
      }

      if (phase === 'issue') {
        const { GH_TOKEN, GITHUB_REPOSITORY } = process.env;
        if (!GH_TOKEN || !GITHUB_REPOSITORY) {
          console.log('Issue dilewati: GH_TOKEN/GITHUB_REPOSITORY tidak tersedia');
          return EXIT.OK;
        }
        const outcome = await resolveQuarantineIssue(
          githubIssueClient(GITHUB_REPOSITORY, GH_TOKEN),
          {
            ...target,
            decision,
            decidedBy,
            note,
            remaining: (await pendingFiles(rootDir, target.source)).length,
            runUrl: str(values['run-url']),
          },
        );
        console.log(`Issue quarantine ${target.source}: ${outcome}`);
        return EXIT.OK;
      }
      if (phase !== 'apply') throw new UsageError(`--phase wajib apply atau issue: ${phase}`);

      try {
        const result = await decideQuarantine({
          root: rootDir,
          path: str(values.path),
          decision,
          decidedBy,
          note,
          runId: runIdFromEnv(),
        });
        console.log(
          [
            result.commit_message,
            `  → ${result.resolved_path}`,
            decision === 'approve'
              ? `  ${result.rows_inserted} insert, ${result.rows_updated} update, ${result.rows_unchanged} sama, ${result.revisions} revisi`
              : '  baris tidak ditulis',
            `  pending tersisa untuk ${result.source}: ${result.remaining}`,
          ].join('\n'),
        );
        await setOutputs({ commit_message: result.commit_message });
        return EXIT.OK;
      } catch (err) {
        if (err instanceof QuarantineError) {
          console.error(err.message);
          return EXIT.FAILED;
        }
        throw err;
      }
    },
  },
  probe: {
    summary:
      'Fetch + cek bentuk respons satu sumber; raw + report.json ke --out, tanpa menulis data/',
    task: 'P0-11',
    options: { root, source: { type: 'string' }, out: { type: 'string' } },
    run: async (values) => {
      const rootDir = requireRoot(values);
      const target = PROBE_TARGETS.find((t) => t === values.source);
      if (!target) {
        throw new UsageError(`--source wajib salah satu dari: ${PROBE_TARGETS.join(', ')}`);
      }
      const out = values.out;
      if (out !== undefined && (typeof out !== 'string' || !path.isAbsolute(out))) {
        throw new UsageError(`--out harus path absolut: ${String(out)}`);
      }
      await loadConfig(rootDir); // config rusak = gagal lebih awal, sama seperti scrape
      const report = await runProbe(target, {
        out,
        userAgent: process.env.SCRAPER_USER_AGENT,
      });
      console.log(formatReport(report));
      await writeStepSummary(report);
      return report.ok ? EXIT.OK : EXIT.FAILED;
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

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * `--date` dari `plan` (D-27): kosong = tanggal sekarang. Hanya hari ini atau kemarin (WIB)
 * yang diterima, karena keterlambatan cron tidak pernah melewati satu hari.
 */
function targetDateOption(value: unknown, now = new Date()): string | undefined {
  const v = str(value);
  if (v === '') return undefined;
  const today = jakartaDate(now);
  if (!isIsoDate(v) || (v !== today && v !== addDaysIso(today, -1))) {
    throw new UsageError(`--date harus hari ini atau kemarin (WIB): ${v}`);
  }
  return v;
}

function requireAbsolute(value: unknown, flag: string): string {
  if (typeof value !== 'string' || value === '') throw new UsageError(`${flag} wajib diisi`);
  if (!path.isAbsolute(value)) throw new UsageError(`${flag} harus path absolut: ${value}`);
  return value;
}

function parseEnum<T extends string>(
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
  flag: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new UsageError(`${flag} tidak valid: ${String(value)}`);
  return result.data;
}

/** `${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}` dari env `RUN_ID`; run lokal diberi `local-…`. */
function runIdFromEnv(): string {
  return process.env.RUN_ID || `local-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
}

function triggerFromEnv(): Trigger {
  return process.env.GITHUB_EVENT_NAME === 'schedule' ? 'schedule' : 'workflow_dispatch';
}

/** Tulis output step GitHub Actions (nilai satu baris); tanpa `GITHUB_OUTPUT` tidak melakukan apa-apa. */
async function setOutputs(outputs: Record<string, string>): Promise<void> {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const lines = Object.entries(outputs).map(([k, v]) => {
    if (v.includes('\n')) throw new Error(`output ${k} tidak boleh multi-baris`);
    return `${k}=${v}\n`;
  });
  await appendFile(file, lines.join(''));
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
