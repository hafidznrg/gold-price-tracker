import type { ScraperId } from '@gold/schema';
import type { SourceScraper } from './types';

/** Modul sumber yang sudah diimplementasikan. Diisi mulai Fase 1 (P1-03, P1-06, P1-07) dan Fase 2. */
const registry: Partial<Record<ScraperId, SourceScraper>> = {};

export function getScraper(id: ScraperId): SourceScraper | undefined {
  return registry[id];
}
