/** Logo batangan emas 36×36 dari mockup. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true" className="shrink-0">
      <rect
        x="0.5"
        y="0.5"
        width="35"
        height="35"
        rx="10"
        style={{ fill: 'var(--goldsoft)', stroke: 'var(--goldline)' }}
      />
      <path
        d="M9.5 23.5 L13 12.5 H23 L26.5 23.5 Z"
        style={{ fill: 'none', stroke: 'var(--gold)', strokeWidth: 1.6, strokeLinejoin: 'round' }}
      />
      <path d="M14.5 18 H21.5" style={{ stroke: 'var(--gold)', strokeWidth: 1.3 }} />
    </svg>
  );
}
