export interface NavItem {
  href: string;
  label: string;
  /** Label ringkas untuk menu bawah HP (D-53). */
  short?: string;
  /** `true` = di menu bawah HP masuk ke "Lainnya". */
  more?: boolean;
}

/**
 * Navigasi utama. Fase 4 menambah Bandingkan, Kalkulator, Kelipatan (urutan mockup: sebelum Data).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Hari ini' },
  { href: '/explorer', label: 'Riwayat harga', short: 'Riwayat' },
  { href: '/spread', label: 'Spread', short: 'Spread' },
  { href: '/bandingkan', label: 'Bandingkan' },
  { href: '/kalkulator', label: 'Kalkulator', more: true },
  { href: '/kelipatan', label: 'Kelipatan', more: true },
  { href: '/data', label: 'Data', more: true },
];

export function isActivePath(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}
