"use client";

import Link from "next/link";
import { Building2, FolderPlus, Gavel, HandCoins, Landmark, PackageCheck, Scale, Truck } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel, PendingActions, type PendingAction } from "@/components/dashboard/common";
import { StackedBars, toChartNumber } from "@/components/dashboard/charts";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { FundFlowDiagram } from "@/components/dashboard/fund-flow";
import { Button } from "@/components/ui/button";
import { Notice, StatCard } from "@/components/ui/primitives";
import { computeFundFlow, isActiveState, sumFlows } from "@/lib/escrow/fund-flow";
import { formatTokenAmount } from "@/lib/utils";
import { ConnectCreatorWallet, OrgBadge, useMyCampaigns, type NgoOrgSummary } from "./shared";

export function NgoOverview({ org }: { org: NgoOrgSummary }) {
  const w = useWallet();
  const live = useEscrowLive();
  const mine = useMyCampaigns();
  const now = Math.floor(Date.now() / 1000);
  const flows = mine.map((c) => computeFundFlow(c, live.events));
  const total = sumFlows(flows);
  const ids = new Set(mine.map((c) => c.id));

  const actions: PendingAction[] = [];
  for (const c of mine) {
    const t = c.metadata?.title || `Campaign #${c.id}`;
    if (c.state === 2 && c.commitDeadline === 0) actions.push({ id: `oa-${c.id}`, title: `Open procurement · ${t}`, description: "Fully funded — vendors are waiting for the auction.", href: "/app/ngo/procurement", cta: "Open", tone: "pending" });
    if (c.state === 2 && c.commitDeadline > 0 && now > c.commitDeadline) actions.push({ id: `ar-${c.id}`, title: `Advance to reveal · ${t}`, href: "/app/ngo/procurement", cta: "Advance", tone: "pending" });
    if (c.state === 3 && now > c.revealDeadline) actions.push({ id: `fa-${c.id}`, title: `Finalize auction · ${t}`, href: "/app/ngo/procurement", cta: "Finalize", tone: "pending" });
    if (c.state === 7) actions.push({ id: `rv-${c.id}`, title: `Review delivery evidence · ${t}`, description: `${c.affirmativeVotes}/3 validator approvals so far`, href: "/app/ngo/delivery", cta: "Review", tone: "info" });
    if (c.state === 0 && now > c.fundingDeadline) actions.push({ id: `ft-${c.id}`, title: `Close expired funding · ${t}`, href: "/app/ngo/campaigns", cta: "Close", tone: "failed" });
  }

  return (
    <div className="space-y-8">
      <RoleHeader
        eyebrow="NGO dashboard"
        title={org.name ?? "Campaign operations"}
        description="Define needs and run procurement. You control requirements — the contract controls the money, and validators confirm delivery."
        actions={
          <>
            <OrgBadge org={org} />
            <Button asChild><Link href="/app/ngo/campaigns/new"><FolderPlus aria-hidden /> New campaign</Link></Button>
          </>
        }
      />
      {!org.verified ? <Notice tone="warning" title="Organization not verified">Donors see your campaigns without a verified badge until an administrator verifies your organization in Access &amp; roles.</Notice> : null}
      <WalletPanel purpose="Campaigns are owned by the wallet that creates them." />
      <TxStatus />

      {!w.address ? (
        <ConnectCreatorWallet />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Campaigns" icon={Building2} value={mine.length} hint={`${mine.filter((c) => isActiveState(c.state)).length} active · ${mine.filter((c) => c.state === 11 || c.state === 12).length} completed`} />
            <StatCard label="Donations received" icon={HandCoins} value={formatTokenAmount(total.donated)} hint="USDC deposited into your campaign escrows" />
            <StatCard label="Allocated to vendors" icon={Gavel} value={formatTokenAmount(total.awarded)} hint="Winning bids (procurement commitments)" />
            <StatCard label="Held in escrow" icon={Landmark} value={formatTokenAmount(total.inEscrow)} hint="Held by the contract — not by you" />
            <StatCard label="Pending validator approvals" icon={Scale} value={mine.filter((c) => c.state === 7).length} />
            <StatCard label="Active vendor contracts" icon={Truck} value={mine.filter((c) => [5, 7, 9, 10].includes(c.state)).length} />
            <StatCard label="Awaiting delivery evidence" icon={PackageCheck} value={mine.filter((c) => c.state === 5).length} />
            <StatCard label="Paid to vendors" icon={HandCoins} value={formatTokenAmount(total.released)} hint={`${formatTokenAmount(total.refunded)} refunded to donors`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Panel title="Funding vs. budget" description="Per campaign, USDC.">
              <StackedBars
                xKey="name"
                stacked={false}
                emptyLabel="Create a campaign to see funding progress"
                series={[{ key: "budget", label: "Budget ceiling" }, { key: "raised", label: "Raised" }, { key: "released", label: "Paid to vendor" }]}
                data={mine.map((c, i) => ({ name: `#${c.id}`, budget: toChartNumber(BigInt(c.budgetCeiling)), raised: toChartNumber(BigInt(c.totalDeposited)), released: toChartNumber(flows[i].released) }))}
              />
            </Panel>
            <Panel title="Pending actions">
              <PendingActions items={actions} />
            </Panel>
          </div>

          <Panel title="Portfolio fund flow" description="All of your campaigns combined.">
            <FundFlowDiagram values={{ ...total, stage1: "not_applicable", stage2: "not_applicable" }} perspective="Portfolio" />
          </Panel>

          <Panel title="Recent activity" description="On-chain events across your campaigns.">
            <ActivityFeed events={live.events.filter((e) => ids.has(e.campaignId))} freshKeys={live.freshKeys} filterable emptyTitle="No activity on your campaigns yet" />
          </Panel>
        </>
      )}
    </div>
  );
}
