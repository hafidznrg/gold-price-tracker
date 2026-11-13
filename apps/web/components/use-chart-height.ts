'use client';

import { useEffect, useState } from 'react';

const PHONE = '(max-width: 639px)';
const TABLET = '(min-width: 640px) and (max-width: 1023px)';

/**
 * Tinggi kanvas grafik responsif (D-47, D-54): `phone` di < 640 px, `tablet` di 640–1023 px
 * (bawaan min(desktop, 320)), `desktop` di ≥ 1024 px. Grafik utama design system: 240 / 320 / 400.
 * Render awal memakai `desktop` (SSR/ekspor statis), lalu disesuaikan setelah hidrasi dan saat
 * lebar layar berubah.
 */
export function useChartHeight(
  desktop: number,
  phone: number,
  tablet: number = Math.min(desktop, 320),
): number {
  const [height, setHeight] = useState(desktop);
  useEffect(() => {
    const p = window.matchMedia(PHONE);
    const t = window.matchMedia(TABLET);
    const apply = () => setHeight(p.matches ? phone : t.matches ? tablet : desktop);
    apply();
    p.addEventListener('change', apply);
    t.addEventListener('change', apply);
    return () => {
      p.removeEventListener('change', apply);
      t.removeEventListener('change', apply);
    };
  }, [desktop, phone, tablet]);
  return height;
}
