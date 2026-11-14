'use client';

import { type RefObject, useLayoutEffect } from 'react';

/** Jarak minimum panel ke tepi viewport — sama dengan gutter halaman di HP. */
const GUTTER = 16;

/**
 * Menggeser panel popover (yang diposisikan `absolute` relatif ke tombolnya) secara horizontal
 * agar tidak menembus tepi kiri/kanan viewport. Tanpa ini, panel berjangkar `left-0`/`right-0`
 * bisa memunculkan scroll horizontal saat tombolnya berada dekat tepi layar (mis. tombol status
 * beranda yang di desktop terdorong ke kanan oleh `justify-between`).
 *
 * Batasnya kolom konten `.wrap` terdekat (bila ada), selalu di dalam viewport dikurangi gutter.
 * Geseran ditulis ke `style.translate` (bukan `transform`) agar tidak bentrok dengan kelas
 * Tailwind; dihitung ulang saat dibuka dan saat ukuran jendela berubah.
 */
export function useViewportClamp(ref: RefObject<HTMLElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const place = () => {
      el.style.translate = '';
      el.style.maxWidth = '';
      // clientWidth tidak menyertakan scrollbar vertikal (beda dengan innerWidth / 100vw).
      const vw = document.documentElement.clientWidth;
      let min = GUTTER;
      let max = vw - GUTTER;
      // Bila berada di kolom konten (`.wrap`), sejajarkan dengan tepi isinya agar panel tidak
      // melebar keluar kolom di layar lebar.
      const wrap = el.closest<HTMLElement>('.wrap');
      if (wrap) {
        const w = wrap.getBoundingClientRect();
        const cs = getComputedStyle(wrap);
        min = Math.max(min, w.left + parseFloat(cs.paddingLeft));
        max = Math.min(max, w.right - parseFloat(cs.paddingRight));
      }
      // Lebar `calc(100vw-…)` ikut menghitung scrollbar klasik, jadi bisa sedikit melebihi ruang.
      el.style.maxWidth = `${Math.floor(max - min)}px`;
      const rect = el.getBoundingClientRect();
      let dx = 0;
      if (rect.right > max) dx = max - rect.right;
      if (rect.left + dx < min) dx = min - rect.left;
      el.style.translate = dx ? `${Math.round(dx)}px 0` : '';
    };
    place();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      el.style.translate = '';
      el.style.maxWidth = '';
    };
  }, [ref, open]);
}
