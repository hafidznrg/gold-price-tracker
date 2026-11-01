export interface NavItem {
  href: string;
  label: string;
}

/** Navigasi utama. Fase 4 menambah Bandingkan, Kalkulator, Kelipatan (urutan mockup: sebelum Data). */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Hari ini' },
  { href: '/explorer', label: 'Explorer' },
  { href: '/spread', label: 'Spread' },
  { href: '/data', label: 'Data' },
];

export function isActivePath(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}
