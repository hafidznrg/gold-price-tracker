// HTTP minimal untuk probe: timeout di setiap request (NFR-12), tanpa retry —
// probe harus melaporkan apa yang terjadi pada percobaan pertama.

export const DEFAULT_USER_AGENT =
  'gold-price-tracker/0.1 (+https://github.com/hafidznrg/gold-price-tracker)';

export interface HttpResponse {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
  setCookies: string[];
  ms: number;
}

export interface HttpOptions {
  userAgent: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function request(
  url: string,
  init: { method?: 'GET' | 'POST'; body?: URLSearchParams } & HttpOptions,
): Promise<HttpResponse> {
  const started = Date.now();
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    body: init.body,
    headers: { 'User-Agent': init.userAgent, ...init.headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(init.timeoutMs ?? 60_000),
  });
  return {
    url: res.url,
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    body: Buffer.from(await res.arrayBuffer()),
    setCookies: res.headers.getSetCookie(),
    ms: Date.now() - started,
  };
}

/** Header `Cookie` dari daftar `Set-Cookie` (hanya pasangan nama=nilai). */
export function cookieHeader(setCookies: string[]): string {
  return setCookies.map((c) => c.split(';')[0]!.trim()).join('; ');
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
