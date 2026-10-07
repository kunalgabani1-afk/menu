import * as React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  // @replit
  // Whitespace-nowrap: Badges should never wrap.
  'whitespace-nowrap inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2' +
    ' hover-elevate ',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow-xs',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive/15 text-destructive border border-destructive/30',
        success:
          'border-transparent bg-[#e5efe8] text-[#245239] border border-[#c4ded0]',
        warning:
          'border-transparent bg-[#fbf0df] text-[#7d4e1e] border border-[#f0dac0]',
        neutral:
          'border-transparent bg-muted text-muted-foreground border border-border',
        outline: 'text-foreground border border-border bg-card/60',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
