import type { MergeSummary, SourceResult } from './merge';

// WORKFLOWS §4 — tahap pertama: ringkasan di step summary. Telegram dan Issue per sumber
// menyusul di P1-05.

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
