'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Pengalih `/bandingkan` → Riwayat harga (D-70). Static export tak punya redirect server, jadi
 * `?w=`, `?m=`, dan `?r=` dibaca di klien. `m=idx` → mode indeks, lainnya → per gram; `w` tak
 * dikenal → 1 g. Tujuannya mode dasar D-71 (`?g=&b=`). `presets` = kunci berat → nilai `b`
 * (semua brand di gramasi itu), dihitung di server.
 */
export function BandingkanRedirect({
  presets,
  fallbackHref,
}: {
  presets: Record<string, string>;
  fallbackHref: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const w = q.get('w');
    const key = w && presets[w] ? w : '1';
    const b = presets[key];
    if (!b) {
      router.replace('/explorer');
      return;
    }
    const out = [`g=${key}`, `b=${b}`, `m=${q.get('m') === 'idx' ? 'idx' : 'gram'}`];
    const r = q.get('r');
    if (r) out.push(`r=${encodeURIComponent(r)}`);
    router.replace(`/explorer?${out.join('&')}`);
  }, [presets, router]);

  return (
    <p className="wrap py-10 text-sm text-muted">
      Halaman Bandingkan kini ada di <a href={fallbackHref}>Riwayat harga</a>. Mengalihkan…
    </p>
  );
}
