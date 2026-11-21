import type { Metadata } from 'next';
import { BandingkanRedirect } from '@/components/bandingkan-redirect';
import {
  COMPARE_DEFS,
  comparePresetHref,
  compareOptions,
  compareWeights,
  findOption,
} from '@/lib/bandingkan';
import { readMeta } from '@/lib/data/load-fs';
import { explorerOptions } from '@/lib/explorer';
import { weightKey } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Bandingkan',
  robots: { index: false },
};

/** Tautan lama: diteruskan ke Riwayat harga mode dasar dengan semua brand di gramasi itu (D-70, D-71). */
export default function BandingkanPage() {
  const options = compareOptions(explorerOptions(readMeta()));
  const presets: Record<string, string> = {};
  for (const w of compareWeights(options)) {
    presets[weightKey(w)] = COMPARE_DEFS.filter((d) => findOption(d, w, options))
      .map((d) => d.id)
      .join(',');
  }
  return <BandingkanRedirect presets={presets} fallbackHref={comparePresetHref(1, options)} />;
}
