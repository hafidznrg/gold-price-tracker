import { describe, expect, it } from 'vitest';
import type { MergeSummary, SourceResult } from '../src/pipeline/merge';
import {
  deliver,
  githubIssueClient,
  issueMarker,
  planNotifications,
  telegramSender,
  wibDate,
  type IssueClient,
  type IssueKind,
  type OpenIssue,
} from '../src/pipeline/notify';

const RUN = 'https://github.com/o/r/actions/runs/1';
const NOW = new Date('2026-10-26T05:00:00Z'); // 12.00 WIB

function result(over: Partial<SourceResult> = {}): SourceResult {
  return {
    source: 'ubslifestyle',
    status: 'success',
    error_code: null,
    error_message: null,
    data_date: '2026-10-26',
    slot: 'primary',
    expected_day: true,
    exit_code: 0,
    rows_inserted: 1,
    rows_updated: 0,
    rows_unchanged: 0,
    rows_held: 0,
    rows_rejected: 0,
    revisions: 0,
    quarantine_paths: [],
    consecutive_failures: 0,
    ...over,
  };
}

function summary(results: SourceResult[], over: Partial<MergeSummary> = {}): MergeSummary {
  return {
    run_id: '1-1',
    merged_at: NOW.toISOString(),
    dry_run: false,
    merge_ok: true,
    commit_message: 'data: …',
    changed_paths: [],
    results,
    ...over,
  };
}

const opens = (p: ReturnType<typeof planNotifications>) =>
  p.issues.filter((a) => a.action === 'open').map((a) => `${a.kind}:${a.subject}`);
const closes = (p: ReturnType<typeof planNotifications>) =>
  p.issues.filter((a) => a.action === 'close').map((a) => `${a.kind}:${a.subject}`);

describe('planNotifications (WORKFLOWS §4)', () => {
  it('semua sukses: tanpa Telegram, tutup Issue pipeline-failure sumber dan merge', () => {
    const p = planNotifications(summary([result()]), 'success', RUN);
    expect(p.telegram).toEqual([]);
    expect(opens(p)).toEqual([]);
    expect(closes(p)).toEqual(['pipeline-failure:merge', 'pipeline-failure:ubslifestyle']);
  });

  it('failed: Telegram + Issue, sebut consecutive_failures bila ≥ 2', () => {
    const p = planNotifications(
      summary([
        result({
          status: 'failed',
          error_code: 'BLOCKED',
          error_message: 'HTTP 403',
          consecutive_failures: 3,
        }),
      ]),
      'success',
      RUN,
    );
    expect(p.telegram).toHaveLength(1);
    expect(p.telegram[0]!.text).toBe(
      '❌ ubslifestyle: failed — BLOCKED · HTTP 403 · gagal 3× berturut-turut',
    );
    expect(opens(p)).toEqual(['pipeline-failure:ubslifestyle']);
  });

  it('stale di hari diharapkan: slot primary menunggu, slot retry/manual memberi tahu', () => {
    const stale = { status: 'stale' as const, exit_code: 3 };
    const primary = planNotifications(summary([result(stale)]), 'success', RUN);
    expect(primary.telegram).toEqual([]);
    expect(primary.issues.filter((a) => a.subject === 'ubslifestyle')).toEqual([]);

    for (const slot of ['retry', 'manual'] as const) {
      const p = planNotifications(summary([result({ ...stale, slot })]), 'success', RUN);
      expect(p.telegram).toHaveLength(1);
      expect(opens(p)).toEqual(['pipeline-failure:ubslifestyle']);
    }
  });

  it('stale bukan hari diharapkan: diam', () => {
    const p = planNotifications(
      summary([result({ status: 'stale', slot: 'retry', expected_day: false })]),
      'success',
      RUN,
    );
    expect(p.telegram).toEqual([]);
    expect(opens(p)).toEqual([]);
  });

  it('partial: Telegram sekali per hari + Issue quarantine berisi path; sumber dianggap pulih', () => {
    const path = 'data/quarantine/ubslifestyle/2026-10-26T034000Z-1-1.json';
    const p = planNotifications(
      summary([result({ status: 'partial', rows_held: 2, quarantine_paths: [path] })]),
      'success',
      RUN,
    );
    expect(p.telegram).toEqual([
      { subject: 'ubslifestyle', text: '⚠️ ubslifestyle: 2 baris dikarantina', oncePerDay: true },
    ]);
    expect(opens(p)).toEqual(['quarantine:ubslifestyle']);
    expect(p.issues.find((a) => a.kind === 'quarantine')!.body).toContain(path);
    expect(closes(p)).toContain('pipeline-failure:ubslifestyle');
  });

  it('merge gagal: Telegram prioritas + Issue merge; sumber sukses tidak dianggap pulih', () => {
    const p = planNotifications(summary([result()]), 'failure', RUN);
    expect(p.telegram.map((l) => l.subject)).toEqual(['merge']);
    expect(p.telegram[0]!.text).toMatch(/^🚨 merge: failure/);
    expect(opens(p)).toEqual(['pipeline-failure:merge']);
    expect(closes(p)).toEqual([]);
  });

  it('summary.json hilang dianggap merge gagal', () => {
    const p = planNotifications(null, 'success', RUN);
    expect(opens(p)).toEqual(['pipeline-failure:merge']);
    expect(p.telegram[0]!.text).toContain('summary.json tidak tersedia');
  });

  it('dry run: tanpa notifikasi', () => {
    const p = planNotifications(
      summary([result({ status: 'failed' })], { dry_run: true }),
      'success',
      RUN,
    );
    expect(p).toEqual({ telegram: [], issues: [] });
  });
});

class FakeIssues implements IssueClient {
  open = new Map<string, OpenIssue>();
  calls: string[] = [];
  next = 10;
  async findOpen(kind: IssueKind, subject: string) {
    return this.open.get(`${kind}:${subject}`) ?? null;
  }
  async create(kind: IssueKind, subject: string) {
    const n = this.next++;
    this.open.set(`${kind}:${subject}`, { number: n, updated_at: NOW.toISOString() });
    this.calls.push(`create ${kind}:${subject}`);
    return n;
  }
  async comment(issue: number) {
    this.calls.push(`comment #${issue}`);
  }
  async close(issue: number) {
    for (const [k, v] of this.open) if (v.number === issue) this.open.delete(k);
    this.calls.push(`close #${issue}`);
  }
}

function notifier(issues: IssueClient | null, sent: string[]) {
  const log: string[] = [];
  return {
    log,
    n: {
      issues,
      telegram: async (t: string) => void sent.push(t),
      now: NOW,
      log: (m: string) => void log.push(m),
    },
  };
}

describe('deliver', () => {
  const failed = summary([result({ status: 'failed', error_code: 'FETCH_TIMEOUT' })]);

  it('tidak menduplikasi Issue: run kedua berkomentar, pemulihan menutup', async () => {
    const issues = new FakeIssues();
    const sent: string[] = [];
    const { n } = notifier(issues, sent);

    expect(await deliver(planNotifications(failed, 'success', RUN), RUN, n)).toBe(0);
    expect(await deliver(planNotifications(failed, 'success', RUN), RUN, n)).toBe(0);
    expect(await deliver(planNotifications(summary([result()]), 'success', RUN), RUN, n)).toBe(0);

    expect(issues.calls).toEqual([
      'create pipeline-failure:ubslifestyle',
      'comment #10',
      'close #10',
    ]);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe(
      `gold-price-tracker · scrape-retail\n❌ ubslifestyle: failed — FETCH_TIMEOUT\n${RUN}`,
    );
  });

  it('karantina: Telegram dilewati bila Issue sumber itu sudah disentuh hari ini (WIB)', async () => {
    const partial = summary([
      result({ status: 'partial', rows_held: 1, quarantine_paths: ['data/quarantine/x.json'] }),
    ]);
    const issues = new FakeIssues();
    const sent: string[] = [];
    const { n } = notifier(issues, sent);

    await deliver(planNotifications(partial, 'success', RUN), RUN, n);
    await deliver(planNotifications(partial, 'success', RUN), RUN, n);
    expect(sent).toHaveLength(1);

    // Issue terakhir disentuh kemarin (WIB) → kirim lagi.
    issues.open.set('quarantine:ubslifestyle', { number: 10, updated_at: '2026-10-25T16:59:00Z' });
    await deliver(planNotifications(partial, 'success', RUN), RUN, n);
    expect(sent).toHaveLength(2);
  });

  it('tanpa kredensial: dilewati dengan log, bukan galat', async () => {
    const { n, log } = notifier(null, []);
    n.telegram = null as never;
    expect(await deliver(planNotifications(failed, 'success', RUN), RUN, n)).toBe(0);
    expect(log.join('\n')).toMatch(/Issue dilewati/);
    expect(log.join('\n')).toMatch(/Telegram dilewati/);
  });

  it('kegagalan pengiriman dihitung tanpa menghentikan sisanya', async () => {
    const issues = new FakeIssues();
    issues.create = async () => {
      throw new Error('HTTP 500');
    };
    const sent: string[] = [];
    const { n, log } = notifier(issues, sent);
    expect(await deliver(planNotifications(failed, 'success', RUN), RUN, n)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(log[0]).toMatch(/^::warning::Issue pipeline-failure ubslifestyle: HTTP 500/);
  });
});

it('wibDate memakai UTC+7', () => {
  expect(wibDate(new Date('2026-10-25T16:59:00Z'))).toBe('2026-10-25');
  expect(wibDate(new Date('2026-10-25T17:00:00Z'))).toBe('2026-10-26');
});

describe('klien HTTP', () => {
  type Req = { url: string; method: string; body: unknown };
  function fakeFetch(responses: unknown[], reqs: Req[], status = 200): typeof fetch {
    return (async (url: string, init: RequestInit) => {
      reqs.push({
        url,
        method: init.method!,
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      return new Response(JSON.stringify(responses.shift() ?? {}), { status });
    }) as typeof fetch;
  }

  it('GitHub: cari lewat penanda, buat dengan label sumber, tutup dengan komentar', async () => {
    const reqs: Req[] = [];
    const marker = issueMarker('pipeline-failure', 'pegadaian');
    const client = githubIssueClient(
      'o/r',
      't',
      fakeFetch(
        [
          [
            { number: 3, updated_at: 'x', body: 'lain', pull_request: {} },
            { number: 4, updated_at: 'y', body: `isi\n${marker}` },
          ],
          { number: 5 },
        ],
        reqs,
      ),
    );
    expect(await client.findOpen('pipeline-failure', 'pegadaian')).toEqual({
      number: 4,
      updated_at: 'y',
    });
    expect(reqs[0]!.url).toBe(
      'https://api.github.com/repos/o/r/issues?state=open&labels=pipeline-failure&per_page=100',
    );
    expect(await client.create('pipeline-failure', 'pegadaian', 'T', 'B')).toBe(5);
    expect(reqs[1]!.body).toEqual({
      title: 'T',
      body: `B\n\n${marker}`,
      labels: ['pipeline-failure', 'source:pegadaian'],
    });
    await client.close(4, 'pulih');
    expect(
      reqs.slice(2).map((r) => `${r.method} ${r.url.replace(/^.*\/repos\/o\/r/, '')}`),
    ).toEqual(['POST /issues/4/comments', 'PATCH /issues/4']);
  });

  it('Telegram: galat tidak membocorkan token', async () => {
    const reqs: Req[] = [];
    const send = telegramSender('SECRET', '42', fakeFetch([], reqs, 401));
    const err = await send('hai').catch((e: Error) => e);
    expect((err as Error).message).toBe('sendMessage: HTTP 401');
    expect((err as Error).message).not.toContain('SECRET');
    expect(reqs[0]!.body).toEqual({ chat_id: '42', text: 'hai', disable_web_page_preview: true });
  });
});
