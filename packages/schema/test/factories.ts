import type { PriceRow } from '../src';

export const priceRow = (over: Partial<PriceRow> = {}): PriceRow => ({
  date: '2026-10-24',
  source: 'ubslifestyle',
  brand: 'ubs',
  product: 'gold_bar',
  variant: '2026',
  weight_g: 1,
  location: '',
  sell_price: 2488800,
  buyback_price: 2291000,
  source_updated_at: '2026-10-24T10:12:08+07:00',
  scraped_at: '2026-10-24T03:31:40Z',
  run_id: '18734512345-1',
  origin: 'scrape',
  ...over,
});
