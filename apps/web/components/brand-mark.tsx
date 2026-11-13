/**
 * Logo "Batang Berpanah" (design system Momen Emas, D-51): emas batangan dibelah panah naik.
 * Geometri = `public/brand/momen-emas-mark-*.svg`; warna lewat token `--logo-*` sehingga ikut tema
 * (terang: flat; Navy: gradasi). Celah memakai `--bg`, jadi logo hanya dipasang di atas latar halaman.
 */
const UPPER_CLIP =
  'M-10 212 L22 232 L114 160 L146 188 L202 143 L262 96 L270 96 L270 -10 L-10 -10 Z';
const LOWER_CLIP =
  'M-10 212 L22 232 L114 160 L146 188 L202 143 L262 96 L270 96 L270 270 L-10 270 Z';
const BAR = 'M46 212 L78 92 L178 92 L210 212 Z';
const ARROW =
  'M22 232 L113.85 165.47 L145.82 195.48 L233.43 130.78 Q230.4 146.27 235.2 155.55 L262 96 L197.92 108.54 Q205.85 115.32 221.62 115.9 L146.18 180.52 L114.15 154.53 L22 232 Z';

/** `height` dalam px; lebar mengikuti rasio 248:148. `id` unik per pemakaian di satu halaman. */
export function BrandMark({
  height = 28,
  className,
  id = 'me-logo',
}: {
  height?: number;
  className?: string;
  id?: string;
}) {
  return (
    <svg
      viewBox="18 88 248 148"
      height={height}
      width={Math.round((height * 248) / 148)}
      aria-hidden="true"
      className={className ?? 'shrink-0'}
    >
      <defs>
        <clipPath id={`${id}-u`}>
          <path d={UPPER_CLIP} />
        </clipPath>
        <clipPath id={`${id}-l`}>
          <path d={LOWER_CLIP} />
        </clipPath>
        <linearGradient id={`${id}-t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--logo-bar-top)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-bar-base)' }} />
        </linearGradient>
        <linearGradient id={`${id}-g`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--logo-arrow-start)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-arrow-end)' }} />
        </linearGradient>
      </defs>
      <g strokeLinejoin="round">
        <path
          d={BAR}
          fill={`url(#${id}-t)`}
          stroke={`url(#${id}-t)`}
          strokeWidth={8}
          clipPath={`url(#${id}-u)`}
        />
        <path d={ARROW} style={{ fill: 'var(--bg)', stroke: 'var(--bg)' }} strokeWidth={14} />
        <path
          d={BAR}
          fill={`url(#${id}-g)`}
          stroke={`url(#${id}-g)`}
          strokeWidth={8}
          clipPath={`url(#${id}-l)`}
        />
        <path d={ARROW} fill={`url(#${id}-g)`} stroke={`url(#${id}-g)`} strokeWidth={2} />
      </g>
    </svg>
  );
}

/** Wordmark teks: "Momen" serif warna teks, "Emas" serif italic warna emas. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`serif whitespace-nowrap ${className ?? ''}`}>
      Momen <em className="text-gold">Emas</em>
    </span>
  );
}
