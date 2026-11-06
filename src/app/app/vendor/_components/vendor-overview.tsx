"use client";

import Link from "next/link";
import { BadgeCheck, Clock, Gavel, Landmark, PackageCheck, Trophy, Truck, Wallet } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel, PendingActions, UnsupportedFeature, type PendingAction } from "@/components/dashboard/common";
import { StackedBars, toChartNumber } from "@/components/dashboard/charts";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, StatCard } from "@/components/ui/primitives";
import { formatDateTime, formatTokenAmount } from "@/lib/utils";
import { useVendorPortfolio } from "./vendor-shared";

export function VendorOverview({ org }: { org: { name: string | null; verified: boolean } }) {
  const w = useWallet();
  const live = useEscrowLive();
  const v = useVendorPortfolio();
  const now = Math.floor(Date.now() / 1000);

  const actions: PendingAction[] = [
    ...v.toReveal.map((c) => ({ id: `rv-${c.id}`, title: `Reveal your bid · #${c.id}`, description: `Before ${formatDateTime(c.revealDeadline)} or the bond is forfeited`, href: "/app/vendor/bids", cta: "Reveal", tone: "failed" as const })),
    ...v.awarded.filter((c) => c.state === 5).map((c) => ({ id: `ev-${c.id}`, title: `Submit delivery evidence · #${c.id}`, description: `Deadline ${formatDateTime(c.deliveryDeadline)}`, href: "/app/vendor/contracts", cta: "Submit", tone: "pending" as const })),
    ...v.awarded.filter((c) => c.state === 9 && now > c.challengeExpiry && !c.isDisputed).map((c) => ({ id: `fz-${c.id}`, title: `Final 30% is claimable · #${c.id}`, href: "/app/vendor/contracts", cta: "Finalize", tone: "verified" as const })),
    ...(v.openCommit.length ? [{ id: "opps", title: `${v.openCommit.length} auction${v.openCommit.length > 1 ? "s" : ""} accepting sealed bids`, href: "/app/vendor/opportunities", cta: "View", tone: "info" as const }] : []),
  ];

  return (
    <div className="space-y-8">
      <RoleHeader
        eyebrow="Vendor dashboard"
        title={org.name ?? "Procurement & delivery"}
        description="Bid with sealed commitments, deliver, and get paid in two contract-enforced stages. You can never release your own payment."
        actions={org.verified ? <Badge tone="verified"><BadgeCheck aria-hidden /> Qualified supplier</Badge> : <Badge tone="pending"><Clock aria-hidden /> Qualification pending</Badge>}
      />
      <WalletPanel purpose="Bids and payouts are bound to this wallet." />
      <TxStatus />
      {!w.address ? (
        <EmptyState icon={Wallet} title="Connect your supplier wallet" description="Bids, awards and payments are read on-chain for the connected address." action={<Button onClick={w.connect} loading={w.connecting}>Connect wallet</Button>} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Bids submitted" icon={Gavel} value={v.ready ? v.myBids.length : "…"} hint={v.ready ? `${v.activeBids.length} still in auction` : undefined} />
            <StatCard label="Contracts won" icon={Trophy} value={v.awarded.length} hint={`${v.ongoing.length} ongoing · ${v.completed.length} completed`} />
            <StatCard label="Payments received" icon={PackageCheck} value={formatTokenAmount(v.received)} hint="USDC released by the contract" />
            <StatCard label="Pending payments" icon={Landmark} value={formatTokenAmount(v.pendingPayments)} hint={`${formatTokenAmount(v.bondsLocked)} USDC in bid bonds`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Panel title="Contract payments" description="Paid vs. still held in escrow, per awarded contract (USDC).">
              <StackedBars
                xKey="name"
                emptyLabel="Payments appear once you win a contract"
                series={[{ key: "paid", label: "Paid to you" }, { key: "held", label: "Held in escrow" }]}
                data={v.flows.map(({ c, flow }) => ({ name: `#${c.id}`, paid: toChartNumber(flow.released), held: toChartNumber(flow.awardOutstanding) }))}
              />
            </Panel>
            <Panel title="Pending actions">
              <PendingActions items={actions} />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <Panel title="Trust & reputation">
              <UnsupportedFeature title="Vendor trust score">
                Trust scores derived from delivery history and beneficiary feedback (recorded in Arkiv) are specified for V2. No score is shown rather than an invented one.
              </UnsupportedFeature>
              <Link href="/app/vendor/profile" className="mt-3 inline-flex text-xs font-medium text-verified hover:underline">View your verifiable delivery record →</Link>
            </Panel>
            <Panel title="Recent activity" description="On-chain events involving your wallet.">
              <ActivityFeed events={v.myEvents} freshKeys={live.freshKeys} emptyTitle="No on-chain activity from this wallet yet" />
            </Panel>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Truck className="h-3.5 w-3.5" aria-hidden /> Stage 1 (70%) pays on validator quorum; Stage 2 (30%) plus your bond after the challenge window.</p>
        </>
      )}
    </div>
  );
}
