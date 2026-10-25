import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXIT, main } from '../src/main';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('cli', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  afterEach(() => {
    log.mockClear();
    error.mockClear();
  });

  it('tanpa argumen → usage, kode 2', async () => {
    expect(await main([])).toBe(EXIT.USAGE);
    expect(log.mock.calls.join('\n')).toContain('Pemakaian');
  });

  it('perintah tidak dikenal → kode 2', async () => {
    expect(await main(['deploy'])).toBe(EXIT.USAGE);
  });

  it('--root wajib absolut', async () => {
    expect(await main(['check'])).toBe(EXIT.USAGE);
    expect(await main(['check', '--root', 'relative/path'])).toBe(EXIT.USAGE);
    expect(error.mock.calls.join('\n')).toContain('absolut');
  });

  it('opsi tak dikenal ditolak', async () => {
    expect(await main(['check', '--root', ROOT, '--nope'])).toBe(EXIT.USAGE);
  });

  it('check memvalidasi config repo', async () => {
    expect(await main(['check', '--root', ROOT])).toBe(EXIT.OK);
    expect(log.mock.calls.join('\n')).toMatch(/sources:\s+6/);
  });

  it.each(['plan', 'scrape', 'merge'])('%s masih stub → kode 2', async (cmd) => {
    expect(await main([cmd, '--root', ROOT])).toBe(EXIT.USAGE);
    expect(error.mock.calls.join('\n')).toContain('belum diimplementasikan');
  });

  // Probe sungguhan memanggil jaringan; di sini hanya validasi argumen.
  it('probe memvalidasi --source dan --out', async () => {
    expect(await main(['probe', '--root', ROOT, '--source', 'tokopedia'])).toBe(EXIT.USAGE);
    expect(error.mock.calls.join('\n')).toContain('frankfurter');
    expect(await main(['probe', '--root', ROOT, '--source', 'xaus', '--out', 'rel/out'])).toBe(
      EXIT.USAGE,
    );
  });
});
