"use client";

import Link from "next/link";
import { ArrowRight, HandCoins, Landmark, PackageCheck, PieChart, TrendingUp, Undo2, Wallet } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel, PendingActions, type PendingAction } from "@/components/dashboard/common";
import { DonutChart, StackedBars, toChartNumber } from "@/components/dashboard/charts";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { FundFlowDiagram } from "@/components/dashboard/fund-flow";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, StatCard } from "@/components/ui/primitives";
import { formatTokenAmount } from "@/lib/utils";
import { useDonorPortfolio } from "./use-donor-portfolio";

export function DonorOverview() {
  const w = useWallet();
  const live = useEscrowLive();
  const p = useDonorPortfolio();
  const open = live.campaigns.filter((c) => c.state === 0 && c.fundingDeadline * 1000 > Date.now());

  const actions: PendingAction[] = [
    ...p.rows
      .filter((r) => r.refundable > 0n)
      .map((r) => ({
        id: `refund-${r.campaign.id}`,
        title: `Refund available · ${r.campaign.metadata?.title || `Campaign #${r.campaign.id}`}`,
        description: `About ${formatTokenAmount(r.refundable)} USDC claimable by contract rules`,
        href: "/app/donor/donations",
        cta: "Claim",
        tone: "verified" as const,
      })),
    ...(open.length
      ? [{ id: "open", title: `${open.length} campaign${open.length > 1 ? "s" : ""} open for funding`, description: "Contributions go straight into escrow.", href: "/app/donor/campaigns", cta: "Discover", tone: "info" as const }]
      : []),
  ];

  const relevantEvents = live.events.filter((e) => p.supportedIds.has(e.campaignId) || p.myEvents.includes(e));

  return (
    <div className="space-y-8">
      <RoleHeader
        eyebrow="Donor dashboard"
        title="Your impact, accounted for"
        description="Every figure is read from the escrow contract for the wallet you connect. Your OpenAid account never holds funds."
        actions={
          <Button asChild>
            <Link href="/app/donor/campaigns"><HandCoins aria-hidden /> Donate</Link>
          </Button>
        }
      />
      <WalletPanel purpose="Connect the wallet you donate from." />
      <TxStatus />

      {!w.address ? (
        <EmptyState
          icon={Wallet}
          title="Connect a wallet to load your contributions"
          description="Donation history, escrow balances and refunds are read on-chain for the connected address."
          action={<Button onClick={w.connect} loading={w.connecting}>Connect wallet</Button>}
        />
      ) : null}
      {!w.address ? (
        <Panel title="Recent platform activity" description="Public on-chain events across all campaigns.">
          <ActivityFeed events={live.events} freshKeys={live.freshKeys} emptyTitle="No on-chain activity yet" emptyDescription="Events appear here as campaigns are created, funded and settled." />
        </Panel>
      ) : (
        <>
          {p.error ? <Notice tone="error">{p.error}</Notice> : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Total donated" icon={HandCoins} value={p.ready ? formatTokenAmount(p.totals.donated) : "…"} hint="USDC · confirmed deposits" />
            <StatCard label="Campaigns supported" icon={PieChart} value={p.ready ? p.rows.length : "…"} hint={p.ready ? `${p.active} active · ${p.completed} completed` : undefined} />
            <StatCard label="Held in escrow (your share)" icon={Landmark} value={p.ready ? formatTokenAmount(p.totals.inEscrow) : "…"} hint="Not yet paid out or refunded" />
            <StatCard label="Paid to vendors (your share)" icon={PackageCheck} value={p.ready ? formatTokenAmount(p.totals.released) : "…"} hint="Released after validator approval" />
            <StatCard label="Refunded to you" icon={Undo2} value={p.ready ? formatTokenAmount(p.totals.refunded) : "…"} hint={p.totals.refundable > 0n ? `${formatTokenAmount(p.totals.refundable)} more claimable` : "Claimed via the contract"} />
            <StatCard label="Utilization" icon={TrendingUp} value={p.ready ? `${(p.utilizationBps / 100).toFixed(1)}%` : "…"} hint="Paid to vendors ÷ donated" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <Panel title="Where your donations sit" description="Your pro-rata share across every campaign you support.">
              <FundFlowDiagram
                perspective="Your share"
                values={{
                  donated: p.totals.donated,
                  inEscrow: p.totals.inEscrow,
                  awarded: p.rows.reduce((s, r) => s + r.share.awardedShare, 0n),
                  released: p.totals.released,
                  refunded: p.totals.refunded,
                  surplus: 0n,
                  stage1: "not_applicable",
                  stage2: "not_applicable",
                }}
              />
              <Link href="/app/donor/flow" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-verified hover:underline">
                Trace a single campaign <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </Panel>
            <Panel title="Allocation by campaign" description="Share of your total donations.">
              <DonutChart
                emptyLabel="Your donations will appear here"
                data={p.rows.map((r) => ({ name: r.campaign.metadata?.title || `#${r.campaign.id}`, value: toChartNumber(r.deposit) }))}
              />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Panel title="Status of your money, per campaign" description="Paid to vendor, still in escrow, and refunded (USDC, your share).">
              <StackedBars
                xKey="name"
                emptyLabel="No contributions yet"
                series={[
                  { key: "released", label: "Paid to vendor" },
                  { key: "escrow", label: "In escrow" },
                  { key: "refunded", label: "Refunded" },
                ]}
                data={p.rows.map((r) => ({
                  name: `#${r.campaign.id}`,
                  released: toChartNumber(r.share.releasedShare),
                  escrow: toChartNumber(r.share.inEscrowShare),
                  refunded: toChartNumber(r.share.refunded),
                }))}
              />
            </Panel>
            <Panel title="Pending actions">
              <PendingActions items={actions} />
            </Panel>
          </div>

          <Panel title="Recent activity" description="Events on campaigns you support, straight from the chain.">
            <ActivityFeed events={relevantEvents} freshKeys={live.freshKeys} filterable emptyTitle="No activity on your campaigns yet" />
          </Panel>
        </>
      )}
    </div>
  );
}
