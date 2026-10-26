import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PriceRow } from '@gold/schema';
import type { Candidate } from '../src/pipeline/upsert';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Root repo sementara: salinan `config/` asli, `data/` kosong. */
export async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'gpt-'));
  await cp(path.join(ROOT, 'config'), path.join(dir, 'config'), { recursive: true });
  return dir;
}

/** Baris kandidat UBS (belum berisi scraped_at/run_id/origin). */
export const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  date: '2026-10-26',
  source: 'ubslifestyle',
  brand: 'ubs',
  product: 'gold_bar',
  variant: '2026',
  weight_g: 1,
  location: '',
  sell_price: 2_483_400,
  buyback_price: 2_288_000,
  source_updated_at: null,
  ...over,
});

export const stored = (over: Partial<PriceRow> = {}): PriceRow => ({
  ...candidate(),
  scraped_at: '2026-10-24T03:31:40Z',
  run_id: '100-1',
  origin: 'scrape',
  ...over,
});

/** 13 pecahan UBS untuk satu tanggal, harga sebanding berat. */
export const UBS_WEIGHTS = [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 10, 25, 50, 100];
export const ubsDay = (date: string, buyback1g = 2_288_000, variant = '2026'): Candidate[] =>
  UBS_WEIGHTS.map((w) =>
    candidate({
      date,
      variant,
      weight_g: w,
      sell_price: Math.round(buyback1g * 1.09 * w) + 1000,
      buyback_price: Math.round(buyback1g * w),
    }),
  );
