import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { jakartaToday, utcIso } from '@gold/schema';
import type { Check } from './checks';
import { DEFAULT_USER_AGENT } from './http';
import { PROBES, type ProbeTarget, type RawFile } from './targets';

export interface ProbeReport {
  target: ProbeTarget;
  ok: boolean;
  started_at: string;
  finished_at: string;
  data_date: string | null;
  error: string | null;
  checks: Check[];
  requests: (RawFile['meta'] & { file: string; bytes: number })[];
}

export interface ProbeOptions {
  /** Folder keluaran (artifact). Probe tidak pernah menulis ke `data/`. */
  out?: string;
  userAgent?: string;
  now?: Date;
  pauseMs?: number;
}

export async function runProbe(target: ProbeTarget, opts: ProbeOptions = {}): Promise<ProbeReport> {
  const now = opts.now ?? new Date();
  const started_at = utcIso();
  let raws: RawFile[] = [];
  let checks: Check[] = [];
  let data_date: string | null = null;
  let error: string | null = null;
  try {
    const output = await PROBES[target]({
      userAgent: opts.userAgent || DEFAULT_USER_AGENT,
      today: jakartaToday(now),
      pauseMs: opts.pauseMs ?? 5_000,
    });
    raws = output.raws;
    checks = output.result.checks;
    data_date = output.result.dataDate;
  } catch (err) {
    error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }
  const report: ProbeReport = {
    target,
    ok: error === null && checks.length > 0 && checks.every((c) => c.ok),
    started_at,
    finished_at: utcIso(),
    data_date,
    error,
    checks,
    requests: raws.map((r) => ({ ...r.meta, file: r.name, bytes: r.body.length })),
  };
  if (opts.out) {
    await mkdir(opts.out, { recursive: true });
    await Promise.all(raws.map((r) => writeFile(path.join(opts.out!, r.name), r.body)));
    await writeFile(path.join(opts.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

export function formatReport(r: ProbeReport): string {
  const lines = [
    `### probe ${r.target}: ${r.ok ? '✅ lolos' : '❌ gagal'}`,
    '',
    `data_date: \`${r.data_date ?? '-'}\`${r.error ? ` · error: \`${r.error}\`` : ''}`,
    '',
    '| Request | HTTP | Content-Type | Byte | ms |',
    '| --- | --- | --- | --- | --- |',
    ...r.requests.map(
      (q) => `| ${q.file} | ${q.status} | ${q.contentType} | ${q.bytes} | ${q.ms} |`,
    ),
    '',
    '| Pemeriksaan | | Detail |',
    '| --- | --- | --- |',
    ...r.checks.map(
      (c) => `| ${c.name} | ${c.ok ? '✅' : '❌'} | ${c.detail.replace(/\|/g, '\\|')} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

/** Tambahkan laporan ke ringkasan job GitHub Actions bila tersedia. */
export async function writeStepSummary(r: ProbeReport): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) await appendFile(file, formatReport(r) + '\n');
}
