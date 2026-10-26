import type { ScraperId } from '@gold/schema';
import { logammulia } from './logammulia';
import { pegadaian } from './pegadaian';
import type { SourceScraper } from './types';
import { ubslifestyle } from './ubslifestyle';

/** Modul sumber yang sudah diimplementasikan. Diisi mulai Fase 1 (P1-03, P1-06, P1-07) dan Fase 2. */
const registry: Partial<Record<ScraperId, SourceScraper>> = {
  ubslifestyle,
  pegadaian,
  logammulia,
};

export function getScraper(id: ScraperId): SourceScraper | undefined {
  return registry[id];
}
