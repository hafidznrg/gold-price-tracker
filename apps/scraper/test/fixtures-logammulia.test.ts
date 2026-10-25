import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Kontrak hasil riset P0-09. Situs sedang maintenance saat riset, sehingga yang
// terkunci baru penanda halaman maintenance — dipakai P1-06 untuk membedakan
// "situs tutup" dari "diblokir" (BLOCKED) atau "struktur berubah" (TOKEN_MISSING).

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/logammulia');
const html = readFileSync(path.join(DIR, 'maintenance-503-2026-10-25.html'), 'utf8');

describe('fixture Logam Mulia — maintenance', () => {
  it('berjudul Maintenance dan memuat iframe halaman pemberitahuan', () => {
    expect(html).toMatch(/<title>\s*Maintenance\s*<\/title>/);
    expect(html).toMatch(/<iframe[^>]+maintenance-mode/);
  });

  it('tidak memuat token CSRF', () => {
    expect(html).not.toContain('name="_token"');
  });
});
