"use client";

import * as React from "react";
import { GitBranch } from "lucide-react";
import type { CampaignView, EscrowEvent } from "@/lib/escrow/types";
import { computeFundFlow, donorShare } from "@/lib/escrow/fund-flow";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { FundFlowDiagram, type FundFlowValues } from "./fund-flow";
import { CampaignStatusBadge } from "./common";

/**
 * Interactive, role-aware wrapper around the shared FundFlowDiagram.
 * - "campaign": whole-campaign flow (NGO, vendor, validator, public).
 * - "donor": the connected donor's pro-rata share, with exact own deposits/refunds.
 */
export function FundFlowPanel({
  campaigns,
  events,
  deposits,
  ownRefunds,
  initialId,
  allowToggle,
  selectedId,
  onSelect,
}: {
  campaigns: CampaignView[];
  events: readonly EscrowEvent[];
  /** When provided, enables the donor-share perspective. */
  deposits?: Record<number, bigint>;
  ownRefunds?: Record<number, bigint>;
  initialId?: number;
  allowToggle?: boolean;
  /** Optional controlled selection. */
  selectedId?: number;
  onSelect?: (id: number) => void;
}) {
  const [internalId, setInternalId] = React.useState<number | undefined>(initialId ?? campaigns[0]?.id);
  const id = selectedId ?? internalId;
  const setId = (v: number | undefined) => {
    setInternalId(v);
    if (v !== undefined) onSelect?.(v);
  };
  const [perspective, setPerspective] = React.useState<"share" | "campaign">(deposits ? "share" : "campaign");
  React.useEffect(() => {
    if (selectedId === undefined && (internalId === undefined || !campaigns.some((c) => c.id === internalId))) setInternalId(campaigns[0]?.id);
  }, [campaigns, internalId, selectedId]);

  const campaign = campaigns.find((c) => c.id === id);
  if (!campaign) return <EmptyState icon={GitBranch} title="No campaign to trace yet" description="Fund flow appears once there is a campaign in this view." />;

  const flow = computeFundFlow(campaign, events);
  let values: FundFlowValues = { ...flow };
  let label = "Campaign";
  if (perspective === "share" && deposits) {
    const s = donorShare(flow, campaign, deposits[campaign.id] ?? 0n, ownRefunds?.[campaign.id] ?? 0n);
    values = {
      donated: s.deposit,
      inEscrow: s.inEscrowShare,
      awarded: s.awardedShare,
      released: s.releasedShare,
      refunded: s.refunded,
      surplus: flow.surplus > 0n && BigInt(campaign.totalDeposited) > 0n ? (flow.surplus * s.deposit) / BigInt(campaign.totalDeposited) : 0n,
      stage1: flow.stage1,
      stage2: flow.stage2,
    };
    label = "Your share";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {campaigns.length > 1 ? (
            <Select value={campaign.id} onChange={(e) => setId(Number(e.target.value))} aria-label="Choose campaign" className="max-w-xs">
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>#{c.id} · {c.metadata?.title || "Untitled campaign"}</option>
              ))}
            </Select>
          ) : (
            <p className="truncate text-sm font-medium">{campaign.metadata?.title || `Campaign #${campaign.id}`}</p>
          )}
          <CampaignStatusBadge state={campaign.state} />
        </div>
        {deposits && allowToggle !== false ? (
          <div className="inline-flex rounded-lg bg-muted p-1 text-xs" role="group" aria-label="Perspective">
            {(["share", "campaign"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPerspective(p)}
                aria-pressed={perspective === p}
                className={cn("rounded-md px-3 py-1.5 font-medium", perspective === p ? "bg-card shadow-sm" : "text-muted-foreground")}
              >
                {p === "share" ? "My share" : "Whole campaign"}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <FundFlowDiagram values={values} perspective={label} />
      {perspective === "share" ? (
        <p className="text-xs text-muted-foreground">Your deposit and refunds are exact on-chain values. Allocation, escrow and release figures are your pro-rata share of the campaign — the contract pools donations per campaign.</p>
      ) : null}
    </div>
  );
}
