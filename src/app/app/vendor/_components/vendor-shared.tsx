"use client";

import * as React from "react";
import { ethers } from "ethers";
import { toast } from "sonner";
import type { CampaignView } from "@/lib/escrow/types";
import { ZERO_HASH_32 } from "./constants";
import { ARC_TESTNET_CONFIG } from "@/lib/arc/config";
import { computeBidCommitment, randomSalt, requiredBidBond } from "@/lib/arc/tx";
import { computeFundFlow } from "@/lib/escrow/fund-flow";
import { formatTokenAmount } from "@/lib/utils";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useUsdc, useVendorCommitments } from "@/components/dashboard/hooks";

export interface SavedBid {
  amount: string;
  salt: string;
  deliveryDays?: string;
}

/** The reveal secret lives only in this browser (never sent to the server). */
export function bidKey(escrow: string, campaignId: number, vendor: string) {
  return `openaid:bid:${ARC_TESTNET_CONFIG.chainId}:${escrow.toLowerCase()}:${campaignId}:${vendor.toLowerCase()}`;
}

export function loadBid(key: string): SavedBid | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedBid;
    return typeof v.amount === "string" && /^0x[0-9a-f]{64}$/i.test(v.salt) ? v : null;
  } catch {
    return null;
  }
}

/** One derivation of the vendor's position across campaigns, shared by every vendor page. */
export function useVendorPortfolio() {
  const w = useWallet();
  const live = useEscrowLive();
  const { commitments, reload } = useVendorCommitments();
  const me = w.address?.toLowerCase();
  const now = Math.floor(Date.now() / 1000);

  return React.useMemo(() => {
    const committed = (c: CampaignView) => Boolean(commitments?.[c.id] && commitments[c.id].commitHash !== ZERO_HASH_32);
    const myBids = live.campaigns.filter(committed);
    const openCommit = live.campaigns.filter((c) => c.state === 2 && c.commitDeadline > now && !committed(c));
    const upcoming = live.campaigns.filter((c) => c.state === 0 || (c.state === 2 && c.commitDeadline === 0));
    const toReveal = live.campaigns.filter((c) => c.state === 3 && c.revealDeadline >= now && committed(c) && !commitments![c.id].revealed);
    const awarded = me ? live.campaigns.filter((c) => c.winningVendor.toLowerCase() === me) : [];
    const payments = me ? live.events.filter((e) => (e.name === "Stage1Settled" || e.name === "Stage2Settled") && e.args.vendor?.toLowerCase() === me) : [];
    const received = payments.reduce((s, e) => s + BigInt(e.args.payoutAmount), 0n);
    const flows = awarded.map((c) => ({ c, flow: computeFundFlow(c, live.events) }));
    const pendingPayments = flows.filter(({ flow }) => flow.stage1 === "locked" || flow.stage2 === "locked" || flow.stage2 === "eligible").reduce((s, { flow }) => s + flow.awardOutstanding, 0n);
    const bondsLocked = myBids.reduce((s, c) => s + (commitments?.[c.id]?.bondAmount ?? 0n), 0n);
    const myEvents = me ? live.events.filter((e) => Object.values(e.args).some((v) => v.toLowerCase?.() === me)) : [];
    return {
      ready: commitments !== null,
      commitments,
      reload,
      myBids,
      activeBids: myBids.filter((c) => c.state === 2 || c.state === 3),
      openCommit,
      upcoming,
      toReveal,
      awarded,
      ongoing: awarded.filter((c) => c.state === 5 || c.state === 7 || c.state === 9 || c.state === 10),
      completed: awarded.filter((c) => c.state === 11),
      payments,
      received,
      pendingPayments,
      bondsLocked,
      flows,
      myEvents,
    };
  }, [commitments, reload, live.campaigns, live.events, me, now]);
}

export function useVendorActions(reload: () => Promise<void>) {
  const w = useWallet();
  const live = useEscrowLive();
  const { usdc, reload: reloadUsdc } = useUsdc();

  const done = async (id: number) => {
    await Promise.all([live.refresh([id]), reload(), reloadUsdc()]);
  };

  const commit = async (c: CampaignView, amountStr: string, deliveryDays?: string) => {
    if (!w.address || !usdc) return void toast.error("Connect your wallet first");
    if (!/^\d{1,12}(\.\d{1,6})?$/.test(amountStr.trim())) return void toast.error("Enter a valid USDC amount");
    const amount = ethers.parseUnits(amountStr.trim(), 6);
    if (amount <= 0n || amount > BigInt(c.budgetCeiling)) return void toast.error("Bid must be above zero and within the budget ceiling");
    const bond = requiredBidBond(BigInt(c.budgetCeiling));
    if (usdc.balance < bond) return void toast.error(`Bond of ${formatTokenAmount(bond)} USDC exceeds your balance`);
    const key = bidKey(w.escrowAddress, c.id, w.address);
    const salt = loadBid(key)?.salt ?? randomSalt();
    // Persist BEFORE sending so a closed tab cannot lose the reveal secret.
    window.localStorage.setItem(key, JSON.stringify({ amount: amountStr.trim(), salt, deliveryDays } satisfies SavedBid));
    const hash = computeBidCommitment(amount, salt, w.address);
    if (usdc.allowance < bond) {
      const ok = await w.runTx("Approve bid bond", ({ usdc: t }) => t(usdc.address).approve(w.escrowAddress, bond));
      if (!ok) return;
    }
    const rec = await w.runTx(`Commit sealed bid #${c.id}`, ({ escrow }) => escrow.commitBid(c.id, hash));
    if (rec) await done(c.id);
  };

  const reveal = async (c: CampaignView, amountStr: string, salt: string, expectedHash: string | undefined) => {
    if (!w.address) return;
    let amount: bigint;
    try {
      amount = ethers.parseUnits(amountStr.trim(), 6);
    } catch {
      return void toast.error("Invalid amount");
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(salt.trim())) return void toast.error("Salt must be a 32-byte hex value");
    if (computeBidCommitment(amount, salt.trim(), w.address) !== expectedHash) return void toast.error("Amount and salt do not match your on-chain commitment");
    const rec = await w.runTx(`Reveal bid #${c.id}`, ({ escrow }) => escrow.revealBid(c.id, amount, salt.trim()));
    if (rec) await done(c.id);
  };

  const submitEvidence = async (c: CampaignView, cid: string) => {
    if (!/^[a-zA-Z0-9]{10,120}$/.test(cid.trim())) return void toast.error("Enter a valid IPFS CID");
    const rec = await w.runTx(`Submit evidence #${c.id}`, ({ escrow }) => escrow.submitDeliveryEvidence(c.id, cid.trim()));
    if (rec) await done(c.id);
  };

  const finalize = async (c: CampaignView) => {
    const rec = await w.runTx(`Finalize settlement #${c.id}`, ({ escrow }) => escrow.finalizeSettlement(c.id));
    if (rec) await done(c.id);
  };

  return { usdc, commit, reveal, submitEvidence, finalize };
}
