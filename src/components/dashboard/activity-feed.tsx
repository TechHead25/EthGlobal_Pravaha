"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, ScrollText } from "lucide-react";
import type { EscrowEvent } from "@/lib/escrow/types";
import { describeEvent, type ActivityDescriptor } from "@/lib/escrow/activity";
import { getExplorerTxUrl } from "@/lib/arc/config";
import { cn, formatDateTime, formatTokenAmount, shortAddress } from "@/lib/utils";
import { EmptyState } from "@/components/ui/primitives";

const DOT: Record<ActivityDescriptor["tone"], string> = {
  verified: "bg-verified",
  pending: "bg-pending",
  info: "bg-info",
  failed: "bg-destructive",
  neutral: "bg-muted-foreground/40",
};

const CATEGORY_LABEL: Record<ActivityDescriptor["category"], string> = {
  funding: "Funding",
  procurement: "Procurement",
  delivery: "Delivery",
  validation: "Validation",
  settlement: "Settlement",
  refund: "Refunds",
  dispute: "Disputes",
  state: "Phase",
};

/**
 * Activity feed over normalized escrow events. Every row is a mined on-chain event with a
 * transaction link; "new" marks events that arrived via the live layer after page load.
 */
export function ActivityFeed({
  events,
  freshKeys,
  limit = 12,
  showCampaign = true,
  hideStateChanges = true,
  emptyTitle = "No on-chain activity yet",
  emptyDescription,
  filterable = false,
}: {
  events: readonly EscrowEvent[];
  freshKeys?: ReadonlySet<string>;
  limit?: number;
  showCampaign?: boolean;
  hideStateChanges?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  filterable?: boolean;
}) {
  const [category, setCategory] = React.useState<ActivityDescriptor["category"] | "all">("all");
  const base = hideStateChanges ? events.filter((e) => e.name !== "StateTransition") : events;
  const categories = [...new Set(base.map((e) => describeEvent(e).category))];
  const shown = base.filter((e) => category === "all" || describeEvent(e).category === category).slice(0, limit);

  if (base.length === 0) return <EmptyState icon={ScrollText} title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="space-y-3">
      {filterable && categories.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter activity">
          {(["all", ...categories] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            >
              {c === "all" ? "All" : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      ) : null}
      <ol className="relative space-y-0">
        {shown.map((e, i) => {
          const d = describeEvent(e);
          const amount = d.amountArg && e.args[d.amountArg] ? BigInt(e.args[d.amountArg]) : null;
          const actor = d.actorArg ? e.args[d.actorArg] : undefined;
          const fresh = freshKeys?.has(e.key);
          return (
            <li key={e.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < shown.length - 1 ? <span className="absolute left-[5px] top-4 h-full w-px bg-border" aria-hidden /> : null}
              <span className={cn("relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-card", DOT[d.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium">
                    {d.title}
                    {fresh ? <span className="ml-2 rounded-full bg-verified-soft px-1.5 py-0.5 text-[0.65rem] font-semibold text-verified">new</span> : null}
                  </p>
                  <span className="text-xs text-muted-foreground">{e.timestamp ? formatDateTime(e.timestamp) : `Block ${e.blockNumber.toLocaleString("en-US")}`}</span>
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {showCampaign && e.campaignId ? (
                    <Link href={`/campaigns/${e.campaignId}`} className="hover:text-foreground hover:underline">
                      Campaign #{e.campaignId}
                    </Link>
                  ) : null}
                  {amount !== null ? <span className="font-medium text-foreground">{formatTokenAmount(amount)} USDC</span> : null}
                  {d.detail ? <span>{d.detail}</span> : null}
                  {actor ? <span className="font-mono">{shortAddress(actor)}</span> : null}
                  <a href={getExplorerTxUrl(e.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-verified hover:underline">
                    tx <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
