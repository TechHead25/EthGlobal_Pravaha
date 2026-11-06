"use client";

import * as React from "react";
import { PackageSearch } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel, UnsupportedFeature } from "@/components/dashboard/common";
import { EvidenceViewer } from "@/components/dashboard/evidence-viewer";
import { FundFlowDiagram } from "@/components/dashboard/fund-flow";
import { DisputeDialog } from "@/components/dashboard/dispute-dialog";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { EmptyState, Notice, Progress } from "@/components/ui/primitives";
import { computeFundFlow } from "@/lib/escrow/fund-flow";
import { formatDateTime, formatTokenAmount, shortAddress } from "@/lib/utils";
import { CampaignSelect } from "./campaign-select";
import { ConnectCreatorWallet, useMyCampaigns } from "./shared";

export function NgoDelivery() {
  const w = useWallet();
  const live = useEscrowLive();
  const mine = useMyCampaigns();
  const delivering = mine.filter((c) => [5, 6, 7, 8, 9, 10, 11].includes(c.state));
  const [id, setId] = React.useState<number | undefined>(undefined);
  const c = delivering.find((x) => x.id === id) ?? delivering[0];

  return (
    <div className="space-y-6">
      <RoleHeader
        eyebrow="NGO dashboard"
        title="Delivery & fund release"
        description="Review what the vendor submitted and follow validator verification. Releases are executed only by the contract after quorum — never by the NGO."
      />
      <WalletPanel purpose="Disputes are signed by your wallet." />
      <TxStatus />
      {!w.address ? (
        <ConnectCreatorWallet />
      ) : delivering.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No campaigns are in delivery yet" description="Campaigns appear here once a vendor has been awarded." />
      ) : c ? (
        <>
          <CampaignSelect campaigns={delivering} value={c.id} onChange={setId} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Vendor evidence" description={`Vendor ${shortAddress(c.winningVendor)} · contract ${formatTokenAmount(BigInt(c.winningBidAmount))} USDC · deadline ${formatDateTime(c.deliveryDeadline)}`}>
              <EvidenceViewer campaign={c} />
            </Panel>
            <Panel title="Independent validation" description="3 of 5 approvals release Stage 1; 3 rejections refund donors.">
              <div className="space-y-3 text-sm">
                <div>
                  <div className="mb-1.5 flex justify-between"><span>Approvals</span><span>{c.affirmativeVotes} / 3</span></div>
                  <Progress value={(c.affirmativeVotes / 3) * 100} label="Approvals" />
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between"><span>Rejections</span><span>{c.negativeVotes} / 3</span></div>
                  <Progress value={(c.negativeVotes / 3) * 100} tone="pending" label="Rejections" />
                </div>
                {c.isDisputed ? <Notice tone="error" title="Disputed">Stage 2 is frozen until validators resolve the challenge.</Notice> : null}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <DisputeDialog campaign={c} />
                  {c.state === 9 ? <span className="text-xs text-muted-foreground">Challenge window open until {formatDateTime(c.challengeExpiry)}</span> : null}
                </div>
              </div>
              <UnsupportedFeature className="mt-4" title="NGO delivery approval">
                The documented design requires NGO approval plus a validator supermajority for each release. The deployed V1 contract has no NGO approval step — releases depend on validator quorum only. Your recourse in V1 is a bonded dispute during the challenge window.
              </UnsupportedFeature>
            </Panel>
          </div>
          <Panel title="Payment milestones & fund flow">
            <FundFlowDiagram values={computeFundFlow(c, live.events)} />
          </Panel>
          <Panel title="Delivery audit trail">
            <ActivityFeed events={live.events.filter((e) => e.campaignId === c.id)} freshKeys={live.freshKeys} showCampaign={false} limit={30} filterable />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
