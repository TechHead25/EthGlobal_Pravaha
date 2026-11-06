"use client";

import { Crown, EyeOff, Lock, Medal } from "lucide-react";
import type { CampaignView } from "@/lib/escrow/types";
import { ZERO_ADDRESS } from "@/lib/escrow/types";
import { formatDateTime, formatTokenAmount, shortAddress, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/primitives";
import { useAuctionBids } from "./hooks";
import { rankBids } from "@/lib/escrow/ranking";
import { UnsupportedFeature } from "./common";

/**
 * Bid comparison read directly from the contract. Sealed commitments are shown only as
 * "sealed" — amounts become visible once each vendor reveals them on-chain (public data).
 */
export function BidLadder({ campaign, highlight }: { campaign: CampaignView; highlight?: string | null }) {
  const bids = useAuctionBids(campaign);
  const awarded = campaign.winningVendor !== ZERO_ADDRESS;

  if (campaign.commitDeadline === 0) return <p className="text-sm text-muted-foreground">Procurement has not been opened for this campaign.</p>;
  if (bids === null) return <Skeleton className="h-28" />;
  if (bids.length === 0) return <p className="text-sm text-muted-foreground">No sealed bids have been committed.</p>;

  const ranked = rankBids(bids);
  const sealed = bids.filter((b) => !b.commitment.revealed);
  const budget = BigInt(campaign.budgetCeiling);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Rank</th>
              <th scope="col" className="px-3 py-2 font-semibold">Vendor</th>
              <th scope="col" className="px-3 py-2 font-semibold">Revealed bid</th>
              <th scope="col" className="px-3 py-2 font-semibold">Price score</th>
              <th scope="col" className="px-3 py-2 font-semibold">Revealed</th>
              <th scope="col" className="px-3 py-2 font-semibold">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((b, i) => {
              const isWinner = awarded && b.vendor.toLowerCase() === campaign.winningVendor.toLowerCase();
              const score = budget > 0n ? Math.round(100 - (Number((b.commitment.revealedAmount * 10000n) / budget) / 100)) : 0;
              return (
                <tr key={b.vendor} className={cn("border-t", highlight && b.vendor.toLowerCase() === highlight.toLowerCase() && "bg-verified-soft/40")}>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 font-medium">
                      {i === 0 ? <Crown className="h-3.5 w-3.5 text-pending" aria-hidden /> : i === 1 ? <Medal className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}#{i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{shortAddress(b.vendor, 6)}{highlight && b.vendor.toLowerCase() === highlight.toLowerCase() ? " (you)" : ""}</td>
                  <td className="px-3 py-2.5 font-medium">{formatTokenAmount(b.commitment.revealedAmount)} USDC</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground" title="Savings vs. budget ceiling">{score} / 100</td>
                  <td className="px-3 py-2.5 text-xs">{formatDateTime(b.commitment.revealedAt)}</td>
                  <td className="px-3 py-2.5">
                    {isWinner ? <Badge tone="verified">Awarded</Badge> : !awarded && i === 0 ? <Badge tone="pending">Provisional leader</Badge> : i === 1 ? <Badge>Runner-up</Badge> : <Badge>Ranked</Badge>}
                  </td>
                </tr>
              );
            })}
            {sealed.map((b) => (
              <tr key={b.vendor} className="border-t text-muted-foreground">
                <td className="px-3 py-2.5">—</td>
                <td className="px-3 py-2.5 font-mono text-xs">{shortAddress(b.vendor, 6)}{highlight && b.vendor.toLowerCase() === highlight.toLowerCase() ? " (you)" : ""}</td>
                <td className="px-3 py-2.5" colSpan={3}>
                  <span className="inline-flex items-center gap-1 text-xs"><EyeOff className="h-3.5 w-3.5" aria-hidden /> Sealed commitment</span>
                </td>
                <td className="px-3 py-2.5">
                  {campaign.state > 3 ? <Badge tone="failed">Not revealed · bond forfeited</Badge> : <Badge><Lock aria-hidden /> Sealed</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Ranking follows the deployed contract: lowest valid revealed bid wins, ties go to the earliest reveal. Price score is shown for reference only. No party, including the NGO, can override it.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <UnsupportedFeature compact title="Trust score">Weighted vendor trust scoring is specified for V2.</UnsupportedFeature>
        <UnsupportedFeature compact title="Delivery score">Delivery-performance scoring is specified for V2.</UnsupportedFeature>
        <UnsupportedFeature compact title="Backup vendor fallback">V1 has no automatic fallback; the runner-up is informational.</UnsupportedFeature>
      </div>
    </div>
  );
}
