'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}

const getSnapshot = () => document.documentElement.getAttribute('data-theme') ?? 'dark';
const getServerSnapshot = () => 'dark';

/** Nilai `data-theme` di `<html>`; komponen render ulang saat tema berganti. */
export function useThemeAttribute(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
