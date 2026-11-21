import type { Metadata } from 'next';
import { BandingkanRedirect } from '@/components/bandingkan-redirect';
import { comparePresetHref, comparePicks, compareOptions, compareWeights } from '@/lib/bandingkan';
import { readMeta } from '@/lib/data/load-fs';
import { encodePicks, explorerOptions } from '@/lib/explorer';
import { weightKey } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Bandingkan',
  robots: { index: false },
};

/** Tautan lama: diteruskan ke Riwayat harga dengan preset "Bandingkan semua brand" (D-70). */
export default function BandingkanPage() {
  const options = compareOptions(explorerOptions(readMeta()));
  const presets: Record<string, string> = {};
  for (const w of compareWeights(options))
    presets[weightKey(w)] = encodePicks(comparePicks(w, options));
  return <BandingkanRedirect presets={presets} fallbackHref={comparePresetHref(1, options)} />;
}
