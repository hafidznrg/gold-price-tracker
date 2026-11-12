'use client';

import { useEffect, useState } from 'react';

const NARROW = '(max-width: 639px)';

/**
 * Tinggi kanvas grafik responsif (D-47): `desktop` di ≥ 640 px, `phone` di bawahnya, agar grafik
 * utama muat di layar pertama. Render awal memakai `desktop` (SSR/ekspor statis), lalu disesuaikan
 * setelah hidrasi dan saat lebar layar berubah.
 */
export function useChartHeight(desktop: number, phone: number): number {
  const [height, setHeight] = useState(desktop);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const apply = () => setHeight(mq.matches ? phone : desktop);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [desktop, phone]);
  return height;
}
