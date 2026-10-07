import React, { ReactNode } from "react";
import { Link } from "wouter";
import {
  Coffee,
  QrCode,
  AlertCircle,
  RefreshCw,
  Archive,
  ArrowUpRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

/**
 * 1. BRAND MARK
 * Tableline cafe hospitality logo
 */
export function CafeMark({
  small = false,
  light = false,
  asDiv = false,
}: {
  small?: boolean;
  light?: boolean;
  asDiv?: boolean;
}) {
  const content = (
    <>
      <span
        className={`${
          small ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"
        } grid place-items-center bg-[#b9532b] text-[#FAF7F2] shadow-sm transition-transform duration-150 group-hover:scale-105`}
      >
        <Coffee className={small ? "h-4 w-4" : "h-5 w-5"} />
      </span>
      <span
        className={`font-display tracking-tight font-bold ${
          small ? "text-xl" : "text-2xl"
        } ${light ? "text-[#FAF7F2]" : "text-[#241c17]"}`}
      >
        table<span className="text-[#b9532b]">line</span>
      </span>
    </>
  );

  if (asDiv) {
    return (
      <div data-testid="link-brand" className="group flex items-center gap-2.5">
        {content}
      </div>
    );
  }

  return (
    <Link href="/" data-testid="link-brand" className="group flex items-center gap-2.5">
      {content}
    </Link>
  );
}

/**
 * 2. STATUS PILL
 * Consistent restrained status indicator across all pages
 */
export function CafeStatusPill({
  status,
  label,
}: {
  status:
    | "active"
    | "online"
    | "inactive"
    | "setup"
    | "pending"
    | "preparing"
    | "ready"
    | "served"
    | "cancelled"
    | string;
  label?: string;
}) {
  const norm = status.toLowerCase();
  const text = label || status;

  let bgClass = "bg-[#ECE7DE] text-[#60564e] border-[#DDD6CB]";
  let dotClass = "bg-[#8A7D73]";

  if (norm === "active" || norm === "online" || norm === "ready" || norm === "served") {
    // Restrained muted sage green
    bgClass = "bg-[#E5EFE8] text-[#245239] border-[#C4DED0]";
    dotClass = "bg-[#2D5E46]";
  } else if (norm === "pending" || norm === "setup" || norm === "preparing") {
    // Warm cafe amber/crema
    bgClass = "bg-[#FBF0DF] text-[#7D4E1E] border-[#F0DAC0]";
    dotClass = "bg-[#B5732A]";
  } else if (norm === "inactive" || norm === "cancelled" || norm === "urgent") {
    // Restrained muted red
    bgClass = "bg-[#FBEBEA] text-[#862D27] border-[#F5CAC7]";
    dotClass = "bg-[#C4382F]";
  }

  return (
    <span
      data-testid={`status-${norm}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide capitalize ${bgClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {text}
    </span>
  );
}

/**
 * 3. NUMBER TYPOGRAPHY & METRIC CARD
 * Section 3: large tabular number + smaller contextual label, aligned, proper spacing
 */
export function CafeMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendPositive,
  testId,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ElementType;
  trend?: string;
  trendPositive?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId || `metric-card-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className="group relative rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-[#DDD6CB] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        {Icon && (
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-border/80 bg-secondary text-primary transition-colors group-hover:bg-[#EAE2D5]">
            <Icon className="h-4 w-4 text-[#5A4132]" />
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-sans tabular-nums text-3xl font-bold tracking-tight text-foreground">
          {value}
        </span>
        {trend && (
          <span
            className={`inline-flex items-center text-xs font-semibold ${
              trendPositive !== false ? "text-[#245239]" : "text-[#862D27]"
            }`}
          >
            {trendPositive !== false ? "+" : ""}
            {trend}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground/90 font-medium">{subtitle}</p>
      )}
    </div>
  );
}

/**
 * 4. SECTION TITLE
 * Editorial hierarchy: Level 1 (What is this page?) and Level 2 (What matters most?)
 */
export function CafeSectionTitle({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b9532b]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#b9532b]" />
            {eyebrow}
          </div>
        )}
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        {detail && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * 5. EMPTY STATE
 * Hospitality-focused empty state with helpful message and direct action
 */
export function CafeEmptyState({
  title,
  detail,
  action,
  icon: Icon = Archive,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <div
      data-testid="empty-state"
      className="rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center"
    >
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-border/80 bg-secondary text-primary">
        <Icon className="h-5 w-5 text-[#5A4132]" />
      </div>
      <h3 className="font-display text-2xl font-bold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {detail}
      </p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * 6. LOADING STATE
 * Skeleton loader with stable layout
 */
export function CafeLoadingState({
  label = "Preparing your workspace…",
}: {
  label?: string;
}) {
  return (
    <div data-testid="loading-state" className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-2xl border border-border/60 bg-muted/60" />
        ))}
      </div>
      <div className="h-64 rounded-2xl border border-border/60 bg-muted/40" />
      <p className="text-center font-mono text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * 7. ERROR STATE
 * Friendly human message without technical stack dumps
 */
export function CafeErrorState({
  title = "Something went wrong loading this view",
  detail = "We could not retrieve the restaurant data right now. Please check your network connection and try again.",
  onRetry,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      data-testid="error-state"
      className="rounded-2xl border border-destructive/20 bg-[#FBEBEA] p-8 text-center"
    >
      <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
      <h2 className="font-display text-2xl font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {detail}
      </p>
      {onRetry && (
        <div className="mt-6 flex justify-center">
          <Button
            onClick={onRetry}
            variant="outline"
            className="border-[#F5CAC7] bg-white text-destructive hover:bg-[#FDF3F2]"
            data-testid="button-retry"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * 8. FORM FIELD
 * Accessible form field with label, hint, error, and required indicator
 */
export function CafeFormField({
  label,
  required,
  hint,
  error,
  children,
  id,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-xs font-semibold uppercase tracking-wider text-foreground"
        >
          {label}
          {required && <span className="ml-1 text-[#b9532b]">*</span>}
        </label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

/**
 * 9. GLOBAL ACTION MENU (•••)
 * Restrained action menu for secondary tasks to avoid button clutter
 */
export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ElementType;
  destructive?: boolean;
  disabled?: boolean;
}

export function CafeActionMenu({
  items,
  testId,
  align = 'end',
  label = 'Actions',
}: {
  items: ActionMenuItem[];
  testId?: string;
  align?: 'start' | 'center' | 'end';
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={testId || 'button-action-menu'}
          aria-label={label}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48 rounded-xl border border-border/80 bg-card p-1 shadow-md z-50">
        {items.map((it, idx) => (
          <DropdownMenuItem
            key={idx}
            disabled={it.disabled}
            onClick={(e) => {
              e.stopPropagation();
              it.onClick();
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
              it.destructive
                ? 'text-destructive focus:bg-destructive/10 focus:text-destructive'
                : 'text-foreground focus:bg-muted focus:text-foreground'
            }`}
          >
            {it.icon && <it.icon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
            <span>{it.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
