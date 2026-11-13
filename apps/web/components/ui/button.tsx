import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** shadcn/ui Button, disesuaikan ke token mockup (tinggi ≥ 44 px, radius kontrol 12 px). */
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-semibold no-underline transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-btn text-btntext hover:text-btntext hover:opacity-90',
        outline: 'border border-line bg-surface text-text hover:bg-surface2 hover:text-text',
        ghost: 'text-muted hover:bg-surface2 hover:text-text',
        gold: 'border border-goldline bg-goldsoft text-gold hover:text-gold',
      },
      size: {
        default: 'min-h-11 rounded-control px-4 text-sm',
        sm: 'min-h-10 rounded-field px-3 text-sm',
        icon: 'size-11 rounded-control',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
