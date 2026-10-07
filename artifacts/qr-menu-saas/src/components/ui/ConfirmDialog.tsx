import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = true,
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <AlertDialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                isDestructive ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-600'
              }`}
            >
              {isDestructive ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <AlertDialogTitle className="font-display text-xl font-bold tracking-tight text-foreground">
              {title}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 flex gap-2">
          <AlertDialogCancel
            disabled={isLoading}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isLoading}
            className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors ${
              isDestructive
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
          >
            {isLoading ? 'Processing…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
