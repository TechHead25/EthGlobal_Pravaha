"use client";

import * as React from "react";
import { ethers } from "ethers";
import { HandCoins } from "lucide-react";
import type { CampaignView } from "@/lib/escrow/types";
import { formatTokenAmount } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useEscrowLive } from "@/components/live/escrow-live";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/primitives";
import { useUsdc } from "./hooks";

/**
 * Donation flow through the existing wallet + escrow integration: optional USDC approve,
 * then depositFunds. Shows success only after a mined receipt (handled by runTx).
 */
export function DonateDialog({ campaign, onDonated, trigger }: { campaign: CampaignView; onDonated?: () => void; trigger?: React.ReactNode }) {
  const w = useWallet();
  const live = useEscrowLive();
  const { usdc, reload } = useUsdc();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const remaining = BigInt(campaign.budgetCeiling) - BigInt(campaign.totalDeposited);
  const open_ = campaign.state === 0 && campaign.fundingDeadline * 1000 > Date.now();

  async function submit() {
    setError(null);
    if (!usdc) return setError("Connect your wallet first.");
    let parsed: bigint;
    try {
      if (!/^\d{1,12}(\.\d{1,6})?$/.test(amount.trim())) throw new Error();
      parsed = ethers.parseUnits(amount.trim(), 6);
    } catch {
      return setError("Enter a USDC amount with up to 6 decimals.");
    }
    if (parsed <= 0n) return setError("Amount must be greater than zero.");
    if (parsed > remaining) return setError(`Exceeds the remaining budget (${formatTokenAmount(remaining)} USDC).`);
    if (parsed > usdc.balance) return setError("Insufficient USDC balance in this wallet.");
    setBusy(true);
    try {
      if (usdc.allowance < parsed) {
        const ok = await w.runTx("Approve USDC", ({ usdc: t }) => t(usdc.address).approve(w.escrowAddress, parsed));
        if (!ok) return;
      }
      const rec = await w.runTx(`Donate to campaign #${campaign.id}`, ({ escrow }) => escrow.depositFunds(campaign.id, parsed));
      if (rec) {
        setAmount("");
        setOpen(false);
        await Promise.all([live.refresh([campaign.id]), reload()]);
        onDonated?.();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="w-full" disabled={!open_}>
            <HandCoins aria-hidden /> {open_ ? "Donate" : "Funding closed"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Donate to {campaign.metadata?.title || `campaign #${campaign.id}`}</DialogTitle>
          <DialogDescription>Funds go to the campaign escrow contract — not to the NGO. They reach the winning vendor only after validator approval, or return to you.</DialogDescription>
        </DialogHeader>
        {!w.address ? (
          <Notice tone="warning" title="Wallet not connected">
            <Button size="sm" className="mt-2" onClick={w.connect} loading={w.connecting}>Connect wallet</Button>
          </Notice>
        ) : !w.isCorrectNetwork ? (
          <Notice tone="warning" title="Wrong network">
            <Button size="sm" variant="outline" className="mt-2" onClick={w.switchNetwork}>Switch to Arc Testnet</Button>
          </Notice>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Your wallet balance</dt><dd className="font-medium">{usdc ? `${formatTokenAmount(usdc.balance)} USDC` : "…"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Remaining to fund</dt><dd className="font-medium">{formatTokenAmount(remaining)} USDC</dd></div>
            </dl>
            <FormField id={`donate-${campaign.id}`} label="Amount (USDC)" error={error ?? undefined} hint={usdc && usdc.allowance > 0n ? `Existing allowance: ${formatTokenAmount(usdc.allowance)} USDC` : "You may be asked to approve USDC first."}>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            </FormField>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!w.address || !w.isCorrectNetwork}>Confirm in wallet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
