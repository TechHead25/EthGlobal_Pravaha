"use client";

import Link from "next/link";
import { useEscrowLive } from "@/components/live/escrow-live";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { CampaignExplorer } from "@/components/dashboard/campaign-explorer";
import { DonateDialog } from "@/components/dashboard/donate-dialog";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";

export function DonorDiscover({ focus }: { focus: number | null }) {
  const live = useEscrowLive();
  const focused = focus ? live.campaigns.find((c) => c.id === focus) : undefined;
  return (
    <div className="space-y-6">
      <RoleHeader
        eyebrow="Donor dashboard"
        title="Discover campaigns"
        description="Search and filter live campaigns. Category, urgency and location are defined by the NGO — OpenAid does not re-rank them."
      />
      <WalletPanel purpose="Donations are signed by your wallet." />
      <TxStatus />
      {live.unavailableReason ? <Notice tone="error" title="Chain data unavailable">{live.unavailableReason}</Notice> : null}
      {focused ? (
        <Notice tone="info" title={`Selected: ${focused.metadata?.title || `Campaign #${focused.id}`}`}>
          <div className="mt-2 flex flex-wrap gap-2">
            <DonateDialog campaign={focused} trigger={<Button size="sm" disabled={focused.state !== 0}>Donate to this campaign</Button>} />
            <Button asChild size="sm" variant="outline"><Link href={`/campaigns/${focused.id}`}>View details</Link></Button>
          </div>
        </Notice>
      ) : null}
      <CampaignExplorer
        campaigns={live.campaigns}
        initialStatus="funding"
        action={(c) =>
          c.state === 0 ? (
            <DonateDialog campaign={c} />
          ) : (
            <Button asChild variant="outline" className="w-full"><Link href={`/campaigns/${c.id}`}>View transparency record</Link></Button>
          )
        }
      />
    </div>
  );
}
