"use client";

import * as React from "react";
import { ethers } from "ethers";
import { ERC20_ABI, OPENAID_ESCROW_FULL_ABI } from "@/lib/arc/abis";
import type { CampaignView } from "@/lib/escrow/types";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useEscrowLive } from "@/components/live/escrow-live";

/**
 * Wallet-scoped on-chain reads shared by the role dashboards. Each hook re-reads when the
 * connected wallet changes or when the live layer reports changed campaign state.
 */

function useEscrowRead() {
  const { readProvider, escrowAddress } = useWallet();
  return React.useMemo(() => new ethers.Contract(escrowAddress, OPENAID_ESCROW_FULL_ABI, readProvider), [readProvider, escrowAddress]);
}

/** Stable signature that changes whenever any campaign's on-chain state changes. */
function campaignsSignature(campaigns: readonly CampaignView[]) {
  return campaigns.map((c) => `${c.id}:${c.state}:${c.totalDeposited}:${c.vendorCount}:${c.affirmativeVotes}:${c.negativeVotes}:${c.stage1Paid}:${c.stage2Paid}`).join("|");
}

export interface UsdcState {
  address: string;
  balance: bigint;
  allowance: bigint;
}

export function useUsdc() {
  const w = useWallet();
  const escrow = useEscrowRead();
  const [state, setState] = React.useState<UsdcState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    if (!w.address) return setState(null);
    try {
      const addr: string = await escrow.usdcToken();
      const token = new ethers.Contract(addr, ERC20_ABI, w.readProvider);
      const [balance, allowance] = await Promise.all([token.balanceOf(w.address), token.allowance(w.address, w.escrowAddress)]);
      setState({ address: addr, balance, allowance });
      setError(null);
    } catch {
      setError("Could not read your USDC balance.");
    }
  }, [w.address, w.readProvider, w.escrowAddress, escrow]);
  React.useEffect(() => void load(), [load]);
  return { usdc: state, error, reload: load };
}

export interface DonorPosition {
  campaign: CampaignView;
  deposit: bigint;
  claimed: boolean;
  surplus: bigint;
}

export function useDonorPositions() {
  const w = useWallet();
  const { campaigns } = useEscrowLive();
  const escrow = useEscrowRead();
  const sig = campaignsSignature(campaigns);
  const [positions, setPositions] = React.useState<DonorPosition[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!w.address) return setPositions(null);
    setLoading(true);
    try {
      const rows = await Promise.all(
        campaigns.map(async (c) => {
          const [deposit, claimed, surplus] = await Promise.all([
            escrow.donorDeposits(c.id, w.address) as Promise<bigint>,
            escrow.hasClaimedRefund(c.id, w.address) as Promise<boolean>,
            escrow.unspentSurplus(c.id) as Promise<bigint>,
          ]);
          return { campaign: c, deposit, claimed, surplus };
        })
      );
      setPositions(rows.filter((r) => r.deposit > 0n));
      setError(null);
    } catch {
      setError("Could not read your positions from Arc Testnet.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.address, escrow, sig]);

  React.useEffect(() => void load(), [load]);
  return { positions, error, loading, reload: load };
}

export interface Commitment {
  commitHash: string;
  bondAmount: bigint;
  revealed: boolean;
  revealedAmount: bigint;
  revealedAt: number;
}

export function useVendorCommitments() {
  const w = useWallet();
  const { campaigns } = useEscrowLive();
  const escrow = useEscrowRead();
  const sig = campaignsSignature(campaigns);
  const [commitments, setCommitments] = React.useState<Record<number, Commitment> | null>(null);
  const load = React.useCallback(async () => {
    if (!w.address) return setCommitments(null);
    try {
      const relevant = campaigns.filter((c) => c.commitDeadline > 0);
      const entries = await Promise.all(
        relevant.map(async (c) => {
          const r = await escrow.getCommitment(c.id, w.address);
          return [c.id, { commitHash: r.commitHash, bondAmount: r.bondAmount, revealed: r.revealed, revealedAmount: r.revealedAmount, revealedAt: Number(r.revealedAt) }] as const;
        })
      );
      setCommitments(Object.fromEntries(entries));
    } catch {
      setCommitments({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.address, escrow, sig]);
  React.useEffect(() => void load(), [load]);
  return { commitments, reload: load };
}

export interface AuctionBid {
  vendor: string;
  commitment: Commitment;
}

/** All bids for one campaign. Amounts are only meaningful once revealed (public on-chain). */
export function useAuctionBids(campaign: CampaignView | undefined) {
  const escrow = useEscrowRead();
  const [bids, setBids] = React.useState<AuctionBid[] | null>(null);
  const key = campaign ? `${campaign.id}:${campaign.state}:${campaign.vendorCount}` : "";
  React.useEffect(() => {
    let active = true;
    if (!campaign || campaign.commitDeadline === 0) {
      setBids([]);
      return;
    }
    setBids(null);
    (async () => {
      try {
        const vendors: string[] = await escrow.getVendors(campaign.id);
        const rows = await Promise.all(
          vendors.map(async (v) => {
            const r = await escrow.getCommitment(campaign.id, v);
            return { vendor: v, commitment: { commitHash: r.commitHash, bondAmount: r.bondAmount, revealed: r.revealed, revealedAmount: r.revealedAmount, revealedAt: Number(r.revealedAt) } };
          })
        );
        if (active) setBids(rows);
      } catch {
        if (active) setBids([]);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, escrow]);
  return bids;
}

export function useValidatorStatus() {
  const w = useWallet();
  const { campaigns } = useEscrowLive();
  const escrow = useEscrowRead();
  const sig = campaignsSignature(campaigns);
  const [isValidator, setIsValidator] = React.useState<boolean | null>(null);
  const [voted, setVoted] = React.useState<Record<number, boolean>>({});
  const load = React.useCallback(async () => {
    if (!w.address) {
      setIsValidator(null);
      setVoted({});
      return;
    }
    try {
      setIsValidator(await escrow.isValidator(w.address));
      const reviews = campaigns.filter((c) => c.state === 7);
      const entries = await Promise.all(reviews.map(async (c) => [c.id, (await escrow.hasVoted(c.id, w.address)) as boolean] as const));
      setVoted(Object.fromEntries(entries));
    } catch {
      setIsValidator(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.address, escrow, sig]);
  React.useEffect(() => void load(), [load]);
  return { isValidator, voted, reload: load };
}

/** Check a list of addresses against the on-chain validator set (public data). */
export function useValidatorSet(addresses: readonly string[]) {
  const escrow = useEscrowRead();
  const [status, setStatus] = React.useState<Record<string, boolean> | null>(null);
  const key = addresses.join(",");
  React.useEffect(() => {
    let active = true;
    Promise.all(addresses.map(async (a) => [a, (await escrow.isValidator(a)) as boolean] as const))
      .then((r) => active && setStatus(Object.fromEntries(r)))
      .catch(() => active && setStatus(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, escrow]);
  return status;
}
