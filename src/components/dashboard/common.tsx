"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CircleDashed, Radio, WifiOff } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { presentState } from "@/lib/protocol";
import { Badge } from "@/components/ui/badge";
import { useEscrowLive } from "@/components/live/escrow-live";

/** Live chain-sync indicator for dashboard headers. */
export function LiveStatus({ className }: { className?: string }) {
  const { status, lastSyncedAt } = useEscrowLive();
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const t = setInterval(force, 10_000);
    return () => clearInterval(t);
  }, []);
  const label =
    status === "unavailable" ? "Chain unavailable" : status === "offline" ? "Reconnecting…" : status === "syncing" ? "Syncing…" : "Live · Arc Testnet";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs", className)}
      title={lastSyncedAt ? `Last synced ${formatDateTime(lastSyncedAt)}` : undefined}
      role="status"
    >
      {status === "unavailable" || status === "offline" ? (
        <WifiOff className="h-3.5 w-3.5 text-destructive" aria-hidden />
      ) : (
        <Radio className={cn("h-3.5 w-3.5 text-verified", status === "syncing" && "animate-pulse-soft")} aria-hidden />
      )}
      {label}
    </span>
  );
}

export function CampaignStatusBadge({ state, className }: { state: number; className?: string }) {
  const s = presentState(state);
  return (
    <Badge tone={s.tone} dot className={className}>
      {s.label}
    </Badge>
  );
}

/** Explicit marker for functionality that the deployed V1 contract does not support. */
export function UnsupportedFeature({
  title,
  children,
  reference = "OpenAidEscrowV2 specification",
  className,
  compact,
}: {
  title: string;
  children?: React.ReactNode;
  reference?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-dashed bg-muted/30", compact ? "px-3 py-2.5" : "p-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">{title}</p>
        <Badge tone="neutral" className="ml-auto">Not in deployed contract · V2</Badge>
      </div>
      {children ? <div className="mt-1.5 text-xs text-muted-foreground">{children}</div> : null}
      {!compact ? <p className="mt-1.5 text-[0.7rem] text-muted-foreground/80">Reference: {reference}. No data is simulated here.</p> : null}
    </div>
  );
}

export interface PendingAction {
  id: string;
  title: string;
  description?: string;
  href?: string;
  cta?: string;
  onClick?: () => void;
  tone?: "pending" | "verified" | "failed" | "info";
}

export function PendingActions({ items, emptyLabel = "Nothing needs your attention right now." }: { items: PendingAction[]; emptyLabel?: string }) {
  if (items.length === 0) return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-3 p-3">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              a.tone === "verified" ? "bg-verified" : a.tone === "failed" ? "bg-destructive" : a.tone === "info" ? "bg-info" : "bg-pending"
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{a.title}</p>
            {a.description ? <p className="truncate text-xs text-muted-foreground">{a.description}</p> : null}
          </div>
          {a.href ? (
            <Link href={a.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-verified hover:underline">
              {a.cta ?? "Open"} <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          ) : a.onClick ? (
            <button type="button" onClick={a.onClick} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-verified hover:underline">
              {a.cta ?? "Open"} <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Dashboard panel with title + optional action, used for every chart/list block. */
export function Panel({ title, description, action, children, className }: { title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("surface flex flex-col p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[0.95rem] font-semibold tracking-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

export function useCampaignTitle() {
  const { campaigns } = useEscrowLive();
  return React.useCallback((id: number) => campaigns.find((c) => c.id === id)?.metadata?.title || `Campaign #${id}`, [campaigns]);
}
