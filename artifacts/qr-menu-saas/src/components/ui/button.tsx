import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground border border-primary shadow-sm hover:opacity-90',
        primary:
          'bg-primary text-primary-foreground border border-primary shadow-sm hover:opacity-90',
        accent:
          'bg-accent text-accent-foreground border border-accent shadow-sm hover:opacity-90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:opacity-90',
        outline:
          'border border-border bg-card/60 text-foreground hover:bg-muted hover:text-foreground shadow-xs',
        secondary:
          'bg-secondary text-secondary-foreground border border-secondary-border hover:bg-secondary/80 shadow-xs',
        tertiary:
          'border border-border/80 bg-background text-foreground hover:bg-secondary/60 shadow-xs',
        ghost: 'border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline p-0 h-auto font-medium',
      },
      size: {
        default: 'h-10 px-4 py-2 text-sm',
        sm: 'h-8.5 rounded-lg px-3 text-xs',
        lg: 'h-12 rounded-xl px-6 text-base font-bold',
        icon: 'h-10 w-10 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
