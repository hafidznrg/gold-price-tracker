/* global process, URL, console */
// Server statis tanpa dependensi untuk menyajikan hasil `next build` (out/) saat uji e2e.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'out');
const port = Number(process.env.PORT ?? 4317);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function resolveFile(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const base = normalize(join(root, rel));
  if (base !== root && !base.startsWith(root + sep)) return null;
  // Prefetch segmen RSC meminta `__next.a.b.txt`, berkas statisnya `__next.a/b.txt`.
  const seg = base.match(/^(.*[\\/]__next\..+)\.([^.\\/]+)\.txt$/);
  const candidates = [base, `${base}.html`, join(base, 'index.html')];
  if (seg) candidates.push(join(seg[1], `${seg[2]}.txt`));
  for (const c of candidates) if (await isFile(c)) return c;
  return null;
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const file = await resolveFile(pathname);
  const status = file ? 200 : 404;
  const target = file ?? join(root, '404.html');
  try {
    const body = await readFile(target);
    res.writeHead(status, {
      'Content-Type':
        TYPES[extname(target)] ??
        (target.endsWith('opengraph-image') ? 'image/png' : 'application/octet-stream'),
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serve-out: http://127.0.0.1:${port} (${root})`);
});
