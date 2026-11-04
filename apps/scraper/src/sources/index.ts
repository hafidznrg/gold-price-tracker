import type { ScraperId } from '@gold/schema';
import { jisdor } from './jisdor';
import { logammulia } from './logammulia';
import { pegadaian } from './pegadaian';
import type { SourceScraper } from './types';
import { ubslifestyle } from './ubslifestyle';
import { worldbank } from './worldbank';
import { xaus } from './xaus';

/** Modul sumber yang sudah diimplementasikan. Fase 1 (P1-03, P1-06, P1-07) dan Fase 2 (P2-03, P2-04; worldbank memakai job P2-06). */
const registry: Partial<Record<ScraperId, SourceScraper>> = {
  ubslifestyle,
  pegadaian,
  logammulia,
  xaus,
  jisdor,
  worldbank,
};

export function getScraper(id: ScraperId): SourceScraper | undefined {
  return registry[id];
}
