import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readPriceCsv, type PriceRow, type QuarantineBatch } from '@gold/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import type { IssueClient, OpenIssue } from '../src/pipeline/notify';
import {
  decideQuarantine,
  parseQuarantinePath,
  QuarantineError,
  resolveQuarantineIssue,
  type QuarantineOptions,
} from '../src/pipeline/quarantine';
import { writePrices } from '../src/pipeline/store';
import { stored, tempRoot } from './helpers';

const NOW = new Date('2026-10-27T03:00:00Z'); // 10.00 WIB
const FILE = '2026-10-26-300-1.json';
const REL = `data/quarantine/ubslifestyle/${FILE}`;

let root: string;
beforeEach(async () => {
  root = await tempRoot();
});

/** Kemarin 1 g sell 2.483.400 / buyback 2.288.000 (nilai default helper). */
const yesterday = stored({ date: '2026-10-25' });
/** +15%: memicu V-05 saat scrape. */
const jump = stored({ sell_price: 2_855_900, buyback_price: 2_631_200, run_id: '300-1' });

async function seed(existing: PriceRow[], batch: Partial<QuarantineBatch> = {}, rel = REL) {
  await writePrices(root, 'ubslifestyle', existing, ['2026']);
  const file = path.join(root, ...rel.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({
      run_id: '300-1',
      source: 'ubslifestyle',
      reason_code: 'PRICE_JUMP',
      rows: [jump],
      decision: 'pending',
      ...batch,
    }),
  );
}

const opts = (over: Partial<QuarantineOptions> = {}): QuarantineOptions => ({
  root,
  path: REL,
  decision: 'approve',
  decidedBy: 'hafidz',
  runId: '400-1',
  now: NOW,
  ...over,
});

const prices = async () =>
  readPriceCsv(await readFile(path.join(root, 'data/prices/ubslifestyle/2026.csv'), 'utf8'));
const revisions = async () =>
  (await readFile(path.join(root, 'data/meta/revisions/2026.jsonl'), 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const resolved = async (file = FILE) =>
  JSON.parse(
    await readFile(path.join(root, 'data/quarantine/_resolved/ubslifestyle', file), 'utf8'),
  );
const exists = (rel: string) =>
  readFile(path.join(root, ...rel.split('/'))).then(
    () => true,
    () => false,
  );

describe('decideQuarantine', () => {
  it('approve PRICE_JUMP: V-05 dilewati, baris masuk CSV, REVISION quarantine_approved, file pindah', async () => {
    await seed([yesterday]);
    const r = await decideQuarantine(opts({ note: 'harga emas memang naik' }));
    expect(r).toMatchObject({
      source: 'ubslifestyle',
      decision: 'approve',
      rows_inserted: 1,
      rows_updated: 0,
      revisions: 2,
      remaining: 0,
      resolved_path: `data/quarantine/_resolved/ubslifestyle/${FILE}`,
      commit_message: `data: karantina approve ubslifestyle/${FILE} +1 ~0`,
    });
    expect(await prices()).toEqual([yesterday, jump]);
    expect(await revisions()).toEqual([
      expect.objectContaining({
        field: 'sell_price',
        old_value: '',
        new_value: '2855900',
        run_id: '400-1',
        reason: 'quarantine_approved',
      }),
      expect.objectContaining({ field: 'buyback_price', new_value: '2631200' }),
    ]);
    expect(await exists(REL)).toBe(false);
    expect(await resolved()).toMatchObject({
      decision: 'approved',
      decided_by: 'hafidz',
      decided_at: '2026-10-27T03:00:00Z',
      note: 'harga emas memang naik',
    });
  });

  it('approve baris yang kuncinya sudah ada → update dengan old/new di REVISION', async () => {
    const earlier = stored({ sell_price: 2_500_000 });
    await seed([yesterday, earlier], { reason_code: 'MASS_REVISION' });
    const r = await decideQuarantine(opts()).catch((e: Error) => e);
    // MASS_REVISION tetap memeriksa V-05: lonjakan +15% dari kemarin ditolak.
    expect(r).toBeInstanceOf(QuarantineError);
    expect((r as Error).message).toMatch(/V-05: ubs 2026 1 g 2026-10-26/);

    await seed([yesterday, earlier], {
      reason_code: 'MASS_REVISION',
      rows: [stored({ sell_price: 2_490_000, run_id: '300-1' })],
    });
    const ok = await decideQuarantine(opts());
    expect(ok).toMatchObject({ rows_inserted: 0, rows_updated: 1, revisions: 1 });
    expect(await revisions()).toEqual([
      expect.objectContaining({ field: 'sell_price', old_value: '2500000', new_value: '2490000' }),
    ]);
  });

  it('reject: CSV dan REVISION tidak berubah, file pindah dengan decision rejected', async () => {
    await seed([yesterday]);
    const r = await decideQuarantine(opts({ decision: 'reject', note: 'salah parse' }));
    expect(r.commit_message).toBe(`data: karantina reject ubslifestyle/${FILE}`);
    expect(await prices()).toEqual([yesterday]);
    expect(await revisions()).toEqual([]);
    expect(await resolved()).toMatchObject({ decision: 'rejected', note: 'salah parse' });
  });

  it('UNKNOWN_ITEM: ditolak selama gramasi belum di katalog, lolos setelah ditambahkan', async () => {
    const odd = stored({ weight_g: 7, sell_price: 17_400_000, buyback_price: 16_000_000 });
    await seed([yesterday], { reason_code: 'UNKNOWN_ITEM', rows: [odd] });
    await expect(decideQuarantine(opts())).rejects.toThrow(/V-02: ubs 2026 7 g .* katalog/);
    expect(await exists(REL)).toBe(true); // gagal = tidak ada yang dipindah

    await appendFile(
      path.join(root, 'config/catalog.yml'),
      "\n  - source: ubslifestyle\n    brand: ubs\n    product: gold_bar\n    weights: [7]\n    active_from: '2026-10-01'\n",
    );
    expect((await decideQuarantine(opts())).rows_inserted).toBe(1);
  });

  it('V-03 diperiksa ulang: buyback ≥ jual tidak bisa disetujui', async () => {
    await seed([yesterday], { rows: [stored({ buyback_price: 2_483_400 })] });
    await expect(decideQuarantine(opts())).rejects.toThrow(/V-03/);
  });

  it('remaining menghitung batch pending lain sumber yang sama', async () => {
    await seed([yesterday]);
    await seed([yesterday], {}, 'data/quarantine/ubslifestyle/2026-10-27-301-1.json');
    expect((await decideQuarantine(opts({ decision: 'reject' }))).remaining).toBe(1);
  });

  it('file hilang, sudah diputuskan, atau source tidak cocok → QuarantineError', async () => {
    await expect(decideQuarantine(opts())).rejects.toThrow(/tidak ada/);
    await seed([yesterday], { decision: 'approved' });
    await expect(decideQuarantine(opts())).rejects.toThrow(/sudah approved/);
    await seed([yesterday], { source: 'pegadaian' });
    await expect(decideQuarantine(opts())).rejects.toThrow(/≠ folder/);
  });
});

describe('parseQuarantinePath', () => {
  it('hanya folder pending satu sumber', () => {
    expect(parseQuarantinePath(REL)).toEqual({ source: 'ubslifestyle', file: FILE });
    for (const bad of [
      `data/quarantine/_resolved/ubslifestyle/${FILE}`,
      `data/quarantine/ubslifestyle/../../prices/x.json`,
      `data/quarantine/bukansumber/${FILE}`,
      `data/prices/ubslifestyle/2026.csv`,
    ]) {
      expect(() => parseQuarantinePath(bad)).toThrow(QuarantineError);
    }
  });
});

describe('resolveQuarantineIssue', () => {
  class Fake implements IssueClient {
    calls: string[] = [];
    constructor(private open: OpenIssue | null) {}
    async findOpen() {
      return this.open;
    }
    async create(): Promise<number> {
      throw new Error('tidak dipakai');
    }
    async comment(n: number, body: string) {
      this.calls.push(`comment #${n}: ${body}`);
    }
    async close(n: number, body: string) {
      this.calls.push(`close #${n}: ${body}`);
    }
  }
  const base = {
    source: 'ubslifestyle' as const,
    file: FILE,
    decision: 'approve' as const,
    decidedBy: 'hafidz',
    runUrl: 'https://x/runs/1',
  };

  it('tutup bila tidak ada pending, komentar bila masih ada, diam bila tidak ada Issue', async () => {
    const closing = new Fake({ number: 7, updated_at: '' });
    expect(await resolveQuarantineIssue(closing, { ...base, remaining: 0 })).toBe('closed');
    expect(closing.calls[0]).toMatch(
      /^close #7: `2026-10-26-300-1.json`: \*\*approve\*\* oleh @hafidz/,
    );

    const commenting = new Fake({ number: 7, updated_at: '' });
    expect(await resolveQuarantineIssue(commenting, { ...base, remaining: 2 })).toBe('commented');
    expect(commenting.calls[0]).toContain('Masih ada 2 batch pending');

    expect(await resolveQuarantineIssue(new Fake(null), { ...base, remaining: 0 })).toBe('none');
  });
});
