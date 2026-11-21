export interface NavItem {
  href: string;
  label: string;
  /** Label ringkas untuk menu bawah HP (D-53). */
  short?: string;
  /** `true` = di menu bawah HP masuk ke "Lainnya". */
  more?: boolean;
}

/**
 * Navigasi utama. Bandingkan digabung ke Riwayat harga (D-70); menu bawah HP: Hari ini, Riwayat, Spread, Kalkulator.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Hari ini' },
  { href: '/explorer', label: 'Riwayat harga', short: 'Riwayat' },
  { href: '/spread', label: 'Spread', short: 'Spread' },
  { href: '/kalkulator', label: 'Kalkulator' },
  { href: '/kelipatan', label: 'Kelipatan', more: true },
  { href: '/data', label: 'Data', more: true },
];

export function isActivePath(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}
