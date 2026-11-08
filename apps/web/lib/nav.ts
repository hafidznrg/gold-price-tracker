export interface NavItem {
  href: string;
  label: string;
}

/**
 * Navigasi utama. Fase 4 menambah Bandingkan, Kalkulator, Kelipatan (urutan mockup: sebelum Data).
 * Kalkulator dan Kelipatan baru ditautkan setelah halamannya ada, agar tidak ada tautan rusak.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Hari ini' },
  { href: '/explorer', label: 'Explorer' },
  { href: '/spread', label: 'Spread' },
  { href: '/bandingkan', label: 'Bandingkan' },
  { href: '/data', label: 'Data' },
];

export function isActivePath(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}
