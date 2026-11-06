"use client";

import * as React from "react";
import Link from "next/link";
import { GitBranch, Wallet } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel } from "@/components/dashboard/common";
import { FundFlowPanel } from "@/components/dashboard/fund-flow-panel";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { useDonorPortfolio } from "./use-donor-portfolio";

export function DonorFlow() {
  const w = useWallet();
  const live = useEscrowLive();
  const p = useDonorPortfolio();
  const supported = p.rows.map((r) => r.campaign);
  const [selected, setSelected] = React.useState<number | undefined>(undefined);
  const id = selected ?? supported[0]?.id;
  const trail = id ? live.events.filter((e) => e.campaignId === id) : [];

  return (
    <div className="space-y-8">
      <RoleHeader
        eyebrow="Donor dashboard"
        title="Live fund flow"
        description="Follow your money from your wallet to escrow, the vendor award, milestone payments, and any refunds. Updates arrive as transactions confirm."
      />
      <WalletPanel purpose="The flow is computed for the connected wallet." />
      {!w.address ? (
        <EmptyState icon={Wallet} title="Connect a wallet to trace your donations" action={<Button onClick={w.connect} loading={w.connecting}>Connect wallet</Button>} />
      ) : !p.ready ? (
        <div className="surface h-64 animate-pulse-soft" />
      ) : supported.length === 0 ? (
        <EmptyState icon={GitBranch} title="You haven't funded a campaign from this wallet" action={<Button asChild variant="outline"><Link href="/app/donor/campaigns">Discover campaigns</Link></Button>} />
      ) : (
        <>
          <Panel title="Fund flow" description="Switch between your share and the whole campaign.">
            <FundFlowPanel campaigns={supported} events={live.events} deposits={p.deposits} ownRefunds={p.ownRefunds} selectedId={id} onSelect={setSelected} />
          </Panel>
          <Panel title="Audit trail" description="Every on-chain event for this campaign — allocation, award, votes, releases and refunds.">
            <ActivityFeed events={trail} freshKeys={live.freshKeys} limit={50} showCampaign={false} hideStateChanges={false} filterable emptyTitle="No events recorded for this campaign in the scanned range" />
          </Panel>
        </>
      )}
    </div>
  );
}
