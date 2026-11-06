"use client";

import * as React from "react";
import { ethers } from "ethers";
import { BadgeCheck, Clock, Layers } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export interface NgoOrgSummary {
  name: string | null;
  verified: boolean;
}

/** Campaigns owned by the connected wallet (OpenAidEscrow.creator). */
export function useMyCampaigns() {
  const w = useWallet();
  const live = useEscrowLive();
  const me = w.address?.toLowerCase();
  return React.useMemo(() => (me ? live.campaigns.filter((c) => c.creator.toLowerCase() === me) : []), [live.campaigns, me]);
}

export function OrgBadge({ org }: { org: NgoOrgSummary }) {
  return org.verified ? (
    <Badge tone="verified"><BadgeCheck aria-hidden /> Verified organization</Badge>
  ) : (
    <Badge tone="pending"><Clock aria-hidden /> Verification pending</Badge>
  );
}

export function ConnectCreatorWallet() {
  const w = useWallet();
  return (
    <EmptyState
      icon={Layers}
      title="Connect the wallet that creates your campaigns"
      description="On-chain, a campaign belongs to the wallet that called createCampaign. Your Google account and wallet are separate."
      action={<Button onClick={w.connect} loading={w.connecting}>Connect wallet</Button>}
    />
  );
}

/** Permissionless keeper/phase calls; returns true when a transaction confirmed. */
export function useNgoActions() {
  const w = useWallet();
  const live = useEscrowLive();
  return React.useCallback(
    async (label: string, campaignId: number, send: (escrow: ethers.Contract) => Promise<ethers.TransactionResponse>) => {
      const rec = await w.runTx(label, ({ escrow }) => send(escrow));
      if (rec) await live.refresh([campaignId]);
      return Boolean(rec);
    },
    [w, live]
  );
}

export const DAY = 86_400;
