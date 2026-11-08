import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, isActivePath } from './nav';

describe('NAV_ITEMS', () => {
  it('memuat ketujuh halaman, tanpa duplikat, dan tiap rute punya page.tsx', () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      '/',
      '/explorer',
      '/spread',
      '/bandingkan',
      '/kalkulator',
      '/kelipatan',
      '/data',
    ]);
    expect(new Set(NAV_ITEMS.map((i) => i.label)).size).toBe(NAV_ITEMS.length);
    for (const { href } of NAV_ITEMS) {
      const file = path.join(__dirname, '..', 'app', href === '/' ? '' : href, 'page.tsx');
      expect(existsSync(file), file).toBe(true);
    }
  });

  it('hanya satu item aktif per path', () => {
    for (const { href } of NAV_ITEMS) {
      const active = NAV_ITEMS.filter((i) => isActivePath(href, i.href));
      expect(active.map((i) => i.href)).toEqual([href]);
    }
    expect(isActivePath('/explorer/', '/explorer')).toBe(true);
    expect(isActivePath('/datax', '/data')).toBe(false);
  });
});
