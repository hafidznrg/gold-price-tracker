import type { ErrorCode } from '@gold/schema';

/** Kegagalan tingkat run dengan `error_code` RUN (DATA-MODEL §3.6). */
export class ScrapeError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScrapeError';
  }
}

/** `error_code` untuk exception apa pun: `ScrapeError` membawa kodenya, timeout dikenali, sisanya `UNKNOWN`. */
export function errorCodeOf(err: unknown): ErrorCode {
  if (err instanceof ScrapeError) return err.code;
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return 'FETCH_TIMEOUT';
  }
  return 'UNKNOWN';
}

/** Pesan untuk `RUN.error_message` (maks. 500 karakter). */
export function errorMessageOf(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 500 ? `${msg.slice(0, 499)}…` : msg;
}
