"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";
import type { CampaignView } from "@/lib/escrow/types";
import { formatDateTime, formatTokenAmount } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useEscrowLive } from "@/components/live/escrow-live";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/input";
import { useUsdc } from "./hooks";

/**
 * OpenAidEscrow.raiseDispute — open to ANY wallet during the challenge window and requires a
 * 10% bond. Freezes the final 30% until validators resolve it. Not an NGO-only privilege.
 */
export function DisputeDialog({ campaign }: { campaign: CampaignView }) {
  const w = useWallet();
  const live = useEscrowLive();
  const { usdc, reload } = useUsdc();
  const [open, setOpen] = React.useState(false);
  const [cid, setCid] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const bond = (BigInt(campaign.winningBidAmount) * 10n) / 100n;
  const windowOpen = campaign.state === 9 && Math.floor(Date.now() / 1000) <= campaign.challengeExpiry;

  async function submit() {
    setError(null);
    if (!/^[a-zA-Z0-9]{10,120}$/.test(cid.trim())) return setError("Enter the IPFS CID of your counter-evidence.");
    if (!usdc) return setError("Connect your wallet first.");
    if (usdc.balance < bond) return setError(`A ${formatTokenAmount(bond)} USDC bond is required.`);
    setBusy(true);
    try {
      if (usdc.allowance < bond) {
        const ok = await w.runTx("Approve dispute bond", ({ usdc: t }) => t(usdc.address).approve(w.escrowAddress, bond));
        if (!ok) return;
      }
      const rec = await w.runTx(`Raise dispute #${campaign.id}`, ({ escrow }) => escrow.raiseDispute(campaign.id, cid.trim()));
      if (rec) {
        setOpen(false);
        await Promise.all([live.refresh([campaign.id]), reload()]);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!windowOpen) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><ShieldAlert aria-hidden /> Raise dispute</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Challenge delivery for campaign #{campaign.id}</DialogTitle>
          <DialogDescription>
            Open until {formatDateTime(campaign.challengeExpiry)}. Requires a {formatTokenAmount(bond)} USDC bond. If validators uphold it, the final 30% returns to donors and you are rewarded; if dismissed, you lose half the bond.
          </DialogDescription>
        </DialogHeader>
        <FormField id={`dispute-${campaign.id}`} label="Counter-evidence IPFS CID" error={error ?? undefined}>
          <Input value={cid} onChange={(e) => setCid(e.target.value)} className="font-mono" autoComplete="off" />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={() => void submit()} loading={busy} disabled={!w.address || !w.isCorrectNetwork}>Post bond & dispute</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
