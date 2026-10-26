import { ScrapeError } from '../pipeline/errors';
import { request, sleep, type HttpResponse } from '../probe/http';
import type { FetchContext } from './types';

// Fetch produksi: timeout per request, retry 2× untuk kegagalan sementara (WORKFLOWS §2),
// dan klasifikasi ke `error_code` RUN.

export const RETRIES = 2;

/** Halaman tantangan/blokir Cloudflare atau Akamai, bukan respons situs. */
function looksBlocked(res: HttpResponse): boolean {
  if (res.status !== 403 && res.status !== 429 && res.status !== 503) return false;
  const head = res.body.subarray(0, 4096).toString('utf8');
  return /cf-chl|challenge-platform|Just a moment|Access Denied|Attention Required/i.test(head);
}

const transient = (status: number) => status === 429 || status >= 500;

export async function fetchOk(
  ctx: Pick<FetchContext, 'userAgent'> & { retryDelayMs?: number },
  url: string,
  init: Omit<Parameters<typeof request>[1], 'userAgent'> = {},
): Promise<HttpResponse> {
  let last: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep((ctx.retryDelayMs ?? 5_000) * attempt);
    try {
      const res = await request(url, { ...init, userAgent: ctx.userAgent });
      if (res.status === 200) return res;
      if (looksBlocked(res)) {
        throw new ScrapeError(
          'BLOCKED',
          `HTTP ${res.status} (halaman tantangan/blokir) dari ${url}`,
        );
      }
      last = new ScrapeError('FETCH_HTTP', `HTTP ${res.status} dari ${url}`);
      if (!transient(res.status)) break;
    } catch (err) {
      if (err instanceof ScrapeError) throw err;
      last = err;
    }
  }
  throw last;
}
