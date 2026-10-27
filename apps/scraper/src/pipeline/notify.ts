import type { MergeSummary, SourceResult } from './merge';

// WORKFLOWS §4: step summary, Telegram, dan Issue per sumber. Keputusan dibuat oleh
// `planNotifications` (murni, diuji); `deliver` menjalankannya lewat klien yang bisa diganti.

const ICON: Record<SourceResult['status'], string> = {
  success: '✅',
  partial: '⚠️',
  stale: '⏳',
  failed: '❌',
  skipped: '⏭️',
};

export function formatSummary(
  summary: MergeSummary | null,
  mergeResult: string,
  runUrl: string,
): string {
  const lines = [`### scrape: ringkasan`, ''];
  if (mergeResult !== 'success') {
    lines.push(
      `❌ **Job merge: ${mergeResult}** — data tidak di-commit. [Lihat run](${runUrl})`,
      '',
    );
  }
  if (!summary) {
    lines.push('summary.json tidak tersedia.');
    return lines.join('\n') + '\n';
  }
  lines.push(
    `Run \`${summary.run_id}\`${summary.dry_run ? ' (dry run)' : ''} · \`${summary.commit_message}\``,
    '',
    '| Sumber | Status | data_date | + | ~ | = | Ditahan | Ditolak | Keterangan |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summary.results.map((r) => {
      const note = [
        r.error_code,
        r.error_message,
        r.status === 'stale' && !r.expected_day ? 'bukan hari yang diharapkan' : null,
        r.consecutive_failures >= 2 ? `gagal ${r.consecutive_failures}× berturut-turut` : null,
        ...r.quarantine_paths.map((p) => `\`${p}\``),
      ]
        .filter(Boolean)
        .join(' · ')
        .replace(/\|/g, '\\|');
      return `| ${r.source} | ${ICON[r.status]} ${r.status} | ${r.data_date ?? '-'} | ${r.rows_inserted} | ${r.rows_updated} | ${r.rows_unchanged} | ${r.rows_held} | ${r.rows_rejected} | ${note} |`;
    }),
  );
  return lines.join('\n') + '\n';
}

// --- Rencana notifikasi -------------------------------------------------------------------

export type IssueKind = 'pipeline-failure' | 'quarantine';

/** Satu Issue terbuka per (jenis, subjek); subjek = id sumber atau `merge`. */
export interface IssueAction {
  kind: IssueKind;
  subject: string;
  /** `open`: buka baru atau komentari yang terbuka. `close`: tutup bila ada yang terbuka. */
  action: 'open' | 'close';
  title: string;
  body: string;
}

export interface TelegramLine {
  subject: string;
  text: string;
  /** Kirim hanya bila Issue `quarantine` sumber ini belum disentuh hari ini (WIB). */
  oncePerDay: boolean;
}

export interface NotificationPlan {
  telegram: TelegramLine[];
  issues: IssueAction[];
}

function describe(r: SourceResult): string {
  return [
    r.error_code,
    r.error_message,
    r.consecutive_failures >= 2 ? `gagal ${r.consecutive_failures}× berturut-turut` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function planNotifications(
  summary: MergeSummary | null,
  mergeResult: string,
  runUrl: string,
): NotificationPlan {
  const plan: NotificationPlan = { telegram: [], issues: [] };
  if (summary?.dry_run) return plan;

  const mergeOk = mergeResult === 'success' && (summary?.merge_ok ?? false);
  if (!mergeOk) {
    plan.telegram.push({
      subject: 'merge',
      text: `🚨 merge: ${mergeResult}${summary ? '' : ' (summary.json tidak tersedia)'} — data tidak di-commit`,
      oncePerDay: false,
    });
    plan.issues.push({
      kind: 'pipeline-failure',
      subject: 'merge',
      action: 'open',
      title: 'Pipeline gagal: merge',
      body: `Job merge berakhir \`${mergeResult}\`; data run ini tidak di-commit.\n\nRun: ${runUrl}`,
    });
  } else {
    plan.issues.push({
      kind: 'pipeline-failure',
      subject: 'merge',
      action: 'close',
      title: 'Pipeline gagal: merge',
      body: `Merge kembali sukses. Run: ${runUrl}`,
    });
  }

  for (const r of summary?.results ?? []) {
    const failure =
      r.status === 'failed' || (r.status === 'stale' && r.expected_day && r.slot !== 'primary');
    if (failure) {
      const detail = describe(r);
      plan.telegram.push({
        subject: r.source,
        text: `${ICON[r.status]} ${r.source}: ${r.status}${detail ? ` — ${detail}` : ''}`,
        oncePerDay: false,
      });
      plan.issues.push({
        kind: 'pipeline-failure',
        subject: r.source,
        action: 'open',
        title: `Pipeline gagal: ${r.source}`,
        body: [
          `**${r.source}**: \`${r.status}\` (slot \`${r.slot}\`)`,
          detail ? `\n${detail}` : '',
          `\nRun: ${runUrl}`,
        ].join(''),
      });
    } else if ((r.status === 'success' || r.status === 'partial') && mergeOk) {
      // Pulih hanya bila datanya benar-benar ter-commit.
      plan.issues.push({
        kind: 'pipeline-failure',
        subject: r.source,
        action: 'close',
        title: `Pipeline gagal: ${r.source}`,
        body: `Pulih: \`${r.status}\`, data_date ${r.data_date ?? '-'}. Run: ${runUrl}`,
      });
    }

    if (r.status === 'partial' && r.quarantine_paths.length > 0) {
      plan.telegram.push({
        subject: r.source,
        text: `⚠️ ${r.source}: ${r.rows_held} baris dikarantina`,
        oncePerDay: true,
      });
      plan.issues.push({
        kind: 'quarantine',
        subject: r.source,
        action: 'open',
        title: `Karantina: ${r.source}`,
        body: [
          `**${r.source}**: ${r.rows_held} baris ditahan, data_date ${r.data_date ?? '-'}.`,
          '',
          ...r.quarantine_paths.map((p) => `- \`${p}\``),
          '',
          'Putuskan lewat workflow `quarantine.yml` (`approve` atau `reject` per file).',
          '',
          `Run: ${runUrl}`,
        ].join('\n'),
      });
    }
  }
  return plan;
}

export function formatTelegram(lines: TelegramLine[], runUrl: string): string {
  return ['gold-price-tracker · scrape-retail', ...lines.map((l) => l.text), runUrl].join('\n');
}

// --- Pengiriman ---------------------------------------------------------------------------

export interface OpenIssue {
  number: number;
  /** ISO 8601, aktivitas terakhir (buat/komentar). */
  updated_at: string;
}

export interface IssueClient {
  findOpen(kind: IssueKind, subject: string): Promise<OpenIssue | null>;
  create(kind: IssueKind, subject: string, title: string, body: string): Promise<number>;
  comment(issue: number, body: string): Promise<void>;
  close(issue: number, body: string): Promise<void>;
}

export interface Notifier {
  issues: IssueClient | null;
  telegram: ((text: string) => Promise<void>) | null;
  now: Date;
  log: (msg: string) => void;
}

/** Tanggal kalender Asia/Jakarta (UTC+7, tanpa DST). */
export function wibDate(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Menjalankan rencana; mengembalikan jumlah kegagalan pengiriman. */
export async function deliver(
  plan: NotificationPlan,
  runUrl: string,
  n: Notifier,
): Promise<number> {
  let errors = 0;
  const attempt = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      errors++;
      n.log(`::warning::${what}: ${(err as Error).message}`);
    }
  };

  // Karantina yang Issue-nya sudah disentuh hari ini tidak dikirim lagi ke Telegram.
  const mutedToday = new Set<string>();
  for (const a of plan.issues) {
    if (!n.issues) break;
    const issues = n.issues;
    await attempt(`Issue ${a.kind} ${a.subject}`, async () => {
      const open = await issues.findOpen(a.kind, a.subject);
      if (a.action === 'close') {
        if (open) {
          await issues.close(open.number, a.body);
          n.log(`Issue #${open.number} (${a.kind}, ${a.subject}) ditutup`);
        }
        return;
      }
      if (open) {
        if (a.kind === 'quarantine' && wibDate(new Date(open.updated_at)) === wibDate(n.now)) {
          mutedToday.add(a.subject);
        }
        await issues.comment(open.number, a.body);
        n.log(`Komentar di Issue #${open.number} (${a.kind}, ${a.subject})`);
      } else {
        const num = await issues.create(a.kind, a.subject, a.title, a.body);
        n.log(`Issue #${num} dibuka (${a.kind}, ${a.subject})`);
      }
    });
  }
  if (!n.issues && plan.issues.some((a) => a.action === 'open')) {
    n.log('Issue dilewati: GH_TOKEN/GITHUB_REPOSITORY tidak tersedia');
  }

  const lines = plan.telegram.filter((l) => !(l.oncePerDay && mutedToday.has(l.subject)));
  if (lines.length > 0) {
    if (n.telegram) {
      const send = n.telegram;
      await attempt('Telegram', async () => {
        await send(formatTelegram(lines, runUrl));
        n.log(`Telegram terkirim (${lines.length} baris)`);
      });
    } else {
      n.log('Telegram dilewati: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID tidak tersedia');
    }
  }
  return errors;
}

// --- Klien nyata --------------------------------------------------------------------------

/** Penanda tersembunyi di body Issue untuk mencegah duplikat tanpa bergantung pada judul. */
export function issueMarker(kind: IssueKind, subject: string): string {
  return `<!-- gold-price-tracker:${kind}:${subject} -->`;
}

export function githubIssueClient(
  repo: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): IssueClient {
  const api = async (method: string, url: string, body?: unknown): Promise<unknown> => {
    const res = await fetchFn(`https://api.github.com/repos/${repo}${url}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`GitHub ${method} ${url}: HTTP ${res.status}`);
    return res.json();
  };
  return {
    async findOpen(kind, subject) {
      const marker = issueMarker(kind, subject);
      const list = (await api(
        'GET',
        `/issues?state=open&labels=${encodeURIComponent(kind)}&per_page=100`,
      )) as { number: number; updated_at: string; body: string | null; pull_request?: unknown }[];
      const hit = list.find((i) => !i.pull_request && (i.body ?? '').includes(marker));
      return hit ? { number: hit.number, updated_at: hit.updated_at } : null;
    },
    async create(kind, subject, title, body) {
      // Label yang belum ada dibuat otomatis oleh GitHub.
      const labels = subject === 'merge' ? [kind] : [kind, `source:${subject}`];
      const res = (await api('POST', '/issues', {
        title,
        body: `${body}\n\n${issueMarker(kind, subject)}`,
        labels,
      })) as { number: number };
      return res.number;
    },
    async comment(issue, body) {
      await api('POST', `/issues/${issue}/comments`, { body });
    },
    async close(issue, body) {
      await api('POST', `/issues/${issue}/comments`, { body });
      await api('PATCH', `/issues/${issue}`, { state: 'closed', state_reason: 'completed' });
    },
  };
}

export function telegramSender(
  token: string,
  chatId: string,
  fetchFn: typeof fetch = fetch,
): (text: string) => Promise<void> {
  return async (text) => {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    // Jangan sertakan URL (berisi token) di pesan galat.
    if (!res.ok) throw new Error(`sendMessage: HTTP ${res.status}`);
  };
}
