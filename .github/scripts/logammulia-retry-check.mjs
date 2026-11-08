// WORKFLOWS §3.9, D-40 — perlukah logammulia dicoba ulang? Dipakai oleh retry-logammulia.yml.
// stdin: data/meta/runs/{yyyy}.jsonl. Keluar 0 = coba ulang, 10 = tidak (alasan di stdout).
//   node logammulia-retry-check.mjs --attempts 3 [--trigger <run_id>] [--now <ISO>]
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';

const say = (s) => process.stdout.write(`${s}\n`);

const RETRYABLE = new Set(['BLOCKED', 'FETCH_HTTP', 'FETCH_TIMEOUT', 'UNKNOWN']);
const { values } = parseArgs({
  options: { attempts: { type: 'string' }, trigger: { type: 'string' }, now: { type: 'string' } },
});
const attempts = Number(values.attempts ?? 3);
const jakartaDate = (iso) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);
const today = jakartaDate(values.now ?? new Date().toISOString());

const runs = readFileSync(0, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .filter((r) => r.source === 'logammulia');
const last = runs.at(-1);

function skip(reason) {
  say(`tidak dicoba ulang: ${reason}`);
  process.exit(10);
}

if (!last) skip('belum ada run logammulia');
say(`run terakhir: ${last.run_id} ${last.status} ${last.error_code ?? '-'} (${last.started_at})`);
if (values.trigger && last.run_id !== values.trigger) {
  skip(`logammulia tidak dijalankan oleh run ${values.trigger}`);
}
if (last.status !== 'failed') skip(`status ${last.status}`);
if (!RETRYABLE.has(last.error_code)) skip(`error_code ${last.error_code} tidak layak dicoba ulang`);
if (jakartaDate(last.started_at) !== today) skip('tanggal WIB sudah berganti');
// Batas harian lintas putaran: run manual logammulia hari ini (termasuk dari pemilik) ≤ attempts.
const manual = runs.filter(
  (r) => r.slot === 'manual' && jakartaDate(r.started_at) === today,
).length;
if (manual >= attempts) skip(`sudah ${manual} run manual hari ini`);
say(`coba ulang (${manual}/${attempts} run manual hari ini)`);
