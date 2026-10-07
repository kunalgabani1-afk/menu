import * as React from 'react';
import * as ToastPrimitives from '@radix-ui/react-toast';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-4 right-4 z-[100] flex max-h-screen w-full flex-col gap-2 p-2 pointer-events-none sm:max-w-[420px]',
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border p-4 shadow-xl transition-all duration-300 backdrop-blur-md data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full',
  {
    variants: {
      variant: {
        default:
          'border-[#2D1E18]/15 bg-[#FAF7F2]/95 text-stone-900 shadow-[0_12px_32px_rgba(45,30,24,0.08)] dark:bg-[#1E1916]/95 dark:border-stone-800 dark:text-stone-100',
        success:
          'border-emerald-500/30 bg-[#F5FAF6]/95 text-emerald-950 shadow-[0_12px_32px_rgba(16,185,129,0.12)] dark:bg-[#112419]/95 dark:border-emerald-500/30 dark:text-emerald-100',
        destructive:
          'border-rose-500/30 bg-[#FFF6F6]/95 text-rose-950 shadow-[0_12px_32px_rgba(244,63,94,0.12)] dark:bg-[#281316]/95 dark:border-rose-500/30 dark:text-rose-100',
        warning:
          'border-amber-500/30 bg-[#FFFDF5]/95 text-amber-950 shadow-[0_12px_32px_rgba(245,158,11,0.12)] dark:bg-[#2A1F0D]/95 dark:border-amber-500/30 dark:text-amber-100',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, children, ...props }, ref) => {
  const renderIcon = () => {
    switch (variant) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />;
      case 'destructive':
        return <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="h-4 w-4 text-[#8C6D58] shrink-0 mt-0.5" />;
    }
  };

  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      <div className="flex items-start gap-3 w-full pr-5">
        {renderIcon()}
        <div className="flex-1 grid gap-0.5">{children}</div>
      </div>
    </ToastPrimitives.Root>
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      'inline-flex h-7 shrink-0 items-center justify-center rounded-lg border border-stone-300 bg-white/80 px-2.5 text-xs font-semibold ring-offset-background transition-colors hover:bg-stone-100 focus:outline-hidden disabled:pointer-events-none disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700',
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      'absolute right-2.5 top-2.5 rounded-full p-1 text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200 transition-colors focus:outline-hidden cursor-pointer',
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn('text-xs font-bold leading-tight tracking-tight', className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('text-[11px] opacity-85 leading-normal', className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;
type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
