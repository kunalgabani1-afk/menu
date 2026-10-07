import React from "react";
import { Lock, Sparkles, ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlanLockedCardProps {
  title: string;
  description: string;
  requiredPlan: string;
  onUpgrade?: () => void;
}

export function PlanLockedCard({
  title,
  description,
  requiredPlan,
  onUpgrade,
}: PlanLockedCardProps) {
  return (
    <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-8 sm:p-12 text-center max-w-xl mx-auto my-8 shadow-xs animate-in fade-in">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-5">
        <Lock className="h-7 w-7" />
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-xs font-bold uppercase tracking-wider mb-3">
        <Sparkles className="h-3.5 w-3.5 text-amber-600" />
        <span>Requires {requiredPlan} Plan</span>
      </div>

      <h3 className="font-serif text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
        {title}
      </h3>

      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400 leading-relaxed max-w-md mx-auto">
        {description}
      </p>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
        {onUpgrade && (
          <Button
            onClick={onUpgrade}
            className="w-full sm:w-auto h-10 px-6 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-semibold shadow-xs gap-2"
          >
            <span>Upgrade to {requiredPlan}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
