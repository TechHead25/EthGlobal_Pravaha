import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  tone = "verified",
  label,
}: {
  value: number;
  className?: string;
  tone?: "verified" | "pending" | "primary";
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-out",
          tone === "verified" && "bg-verified",
          tone === "pending" && "bg-pending",
          tone === "primary" && "bg-primary"
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse-soft rounded-md bg-muted", className)} aria-hidden {...props} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  tone = "light",
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center",
        tone === "dark" ? "border-white/15 text-white" : "bg-muted/40",
        className
      )}
    >
      {Icon ? (
        <div
          className={cn(
            "mb-3 flex h-10 w-10 items-center justify-center rounded-full",
            tone === "dark" ? "bg-white/10 text-white/80" : "bg-card text-muted-foreground shadow-sm"
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      ) : null}
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <div className={cn("mt-1 max-w-md text-sm", tone === "dark" ? "text-white/60" : "text-muted-foreground")}>
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
  footer,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className={cn("surface flex flex-col gap-2 p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" aria-hidden /> : null}
      </div>
      <div className="font-display text-[1.75rem] leading-none tracking-tight">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      {footer}
    </div>
  );
}

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  status: "done" | "current" | "upcoming" | "failed";
}

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-5", className)}>
      {items.map((item, idx) => (
        <li key={item.id} className="relative flex gap-4">
          {idx < items.length - 1 ? (
            <span
              className={cn(
                "absolute left-[9px] top-6 h-[calc(100%+0.25rem)] w-px",
                item.status === "done" ? "bg-verified/40" : "bg-border"
              )}
              aria-hidden
            />
          ) : null}
          <span
            className={cn(
              "relative mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border-2",
              item.status === "done" && "border-verified bg-verified",
              item.status === "current" && "border-pending bg-pending-soft",
              item.status === "upcoming" && "border-border bg-card",
              item.status === "failed" && "border-destructive bg-destructive-soft"
            )}
            aria-hidden
          >
            {item.status === "done" ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
            {item.status === "current" ? <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-pending" /> : null}
          </span>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className={cn("text-sm font-medium", item.status === "upcoming" && "text-muted-foreground")}>
                {item.title}
                <span className="sr-only"> — {item.status}</span>
              </p>
              {item.meta ? <span className="text-xs text-muted-foreground">{item.meta}</span> : null}
            </div>
            {item.description ? <div className="mt-0.5 text-sm text-muted-foreground">{item.description}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-2 text-verified">{eyebrow}</div> : null}
        <h1 className="font-display text-3xl tracking-tight md:text-[2.15rem]">{title}</h1>
        {description ? <div className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  icon: Icon,
  className,
}: {
  tone?: "info" | "warning" | "error" | "success";
  title?: string;
  children?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-sm",
        tone === "info" && "border-info/20 bg-info-soft text-info",
        tone === "warning" && "border-pending/25 bg-pending-soft text-[hsl(var(--warning-text))]",
        tone === "error" && "border-destructive/25 bg-destructive-soft text-destructive",
        tone === "success" && "border-verified/20 bg-verified-soft text-verified",
        className
      )}
    >
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : null}
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
    </div>
  );
}
