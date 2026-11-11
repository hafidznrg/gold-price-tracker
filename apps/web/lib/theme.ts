export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'gpt-theme';
export const DEFAULT_THEME: Theme = 'light';

/**
 * Skrip inline di <head>: pasang data-theme sebelum paint agar tidak ada kilatan tema salah.
 * Terang default (D-43); pilihan tersimpan di localStorage (dibungkus try/catch).
 */
export const themeInitScript = `(function(){var t='${DEFAULT_THEME}';try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');if(s==='light'||s==='dark')t=s;}catch(e){}document.documentElement.setAttribute('data-theme',t);})();`;

export function readTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Mode privat / penyimpanan diblokir: tema tetap berlaku untuk sesi ini.
  }
}
