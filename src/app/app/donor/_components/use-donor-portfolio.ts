"use client";

import * as React from "react";
import { computeFundFlow, donorShare, estimateRefund, isActiveState } from "@/lib/escrow/fund-flow";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useDonorPositions } from "@/components/dashboard/hooks";

/** Single derivation of a donor's portfolio used by every donor page (no duplicated math). */
export function useDonorPortfolio() {
  const w = useWallet();
  const live = useEscrowLive();
  const { positions, error, loading, reload } = useDonorPositions();
  const me = w.address?.toLowerCase();

  return React.useMemo(() => {
    const myEvents = me ? live.events.filter((e) => (e.name === "FundsDeposited" || e.name === "RefundClaimed") && e.args.donor?.toLowerCase() === me) : [];
    const ownRefunds: Record<number, bigint> = {};
    for (const e of myEvents) if (e.name === "RefundClaimed") ownRefunds[e.campaignId] = (ownRefunds[e.campaignId] ?? 0n) + BigInt(e.args.amount);
    const rows = (positions ?? []).map((p) => {
      const flow = computeFundFlow(p.campaign, live.events);
      const share = donorShare(flow, p.campaign, p.deposit, ownRefunds[p.campaign.id] ?? 0n);
      return { ...p, flow, share, refundable: estimateRefund(p.campaign, p.deposit, p.surplus, p.claimed) };
    });
    const totals = rows.reduce(
      (t, r) => ({
        donated: t.donated + r.deposit,
        inEscrow: t.inEscrow + r.share.inEscrowShare,
        released: t.released + r.share.releasedShare,
        refunded: t.refunded + r.share.refunded,
        refundable: t.refundable + r.refundable,
      }),
      { donated: 0n, inEscrow: 0n, released: 0n, refunded: 0n, refundable: 0n }
    );
    const deposits: Record<number, bigint> = Object.fromEntries(rows.map((r) => [r.campaign.id, r.deposit]));
    const supportedIds = new Set(rows.map((r) => r.campaign.id));
    return {
      ready: positions !== null,
      error,
      loading,
      reload,
      rows,
      totals,
      deposits,
      ownRefunds,
      myEvents,
      supportedIds,
      active: rows.filter((r) => isActiveState(r.campaign.state)).length,
      completed: rows.filter((r) => r.campaign.state === 11 || r.campaign.state === 12).length,
      utilizationBps: totals.donated > 0n ? Number((totals.released * 10000n) / totals.donated) : 0,
    };
  }, [positions, error, loading, reload, live.events, me]);
}
