import { cn } from '@/lib/utils';

/**
 * Titik status. `live` = hijau dengan halo berdenyut (data terkini); selain itu abu-abu diam.
 * Denyut sengaja tidak bergantung pada `prefers-reduced-motion` (D-59).
 */
export function LiveDot({ live, className }: { live: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative flex size-2 flex-none', className)}>
      {live ? (
        <span className="absolute inset-0 animate-ping rounded-full bg-up opacity-60" />
      ) : null}
      <span className={cn('relative size-full rounded-full', live ? 'bg-up' : 'bg-faint')} />
    </span>
  );
}
