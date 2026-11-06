import { ethers } from "ethers";
import { OPENAID_ESCROW_FULL_ABI } from "../arc/abis";
import { CAMPAIGN_STATE_LABELS, type CampaignState } from "../arc/types";
import type { CampaignView, EscrowEvent } from "./types";

/**
 * Isomorphic, read-only access to OpenAidEscrow. Used by the server (initial render)
 * and by the browser live layer (incremental updates). Never signs anything.
 */

export const escrowInterface = new ethers.Interface(OPENAID_ESCROW_FULL_ABI);

export async function readCampaignCore(escrow: ethers.Contract, id: number): Promise<Omit<CampaignView, "metadata"> | null> {
  const [c, commitDeadline, revealDeadline, vendors] = await Promise.all([
    escrow.getCampaign(id),
    escrow.commitDeadlines(id),
    escrow.revealDeadlines(id),
    escrow.getVendors(id),
  ]);
  if (!c || c.budgetCeiling === 0n) return null;
  const state = Number(c.state) as CampaignState;
  return {
    id: Number(c.id),
    creator: c.creator,
    budgetCeiling: c.budgetCeiling.toString(),
    totalDeposited: c.totalDeposited.toString(),
    fundingDeadline: Number(c.fundingDeadline),
    deliveryDeadline: Number(c.deliveryDeadline),
    metadataCid: c.metadataCid,
    state,
    stateLabel: CAMPAIGN_STATE_LABELS[state] ?? `State ${state}`,
    winningVendor: c.winningVendor,
    winningBidAmount: c.winningBidAmount.toString(),
    evidenceIpfsCid: c.evidenceIpfsCid,
    evidenceSubmittedAt: Number(c.evidenceSubmittedAt),
    affirmativeVotes: Number(c.affirmativeVotes),
    negativeVotes: Number(c.negativeVotes),
    stage1Paid: Boolean(c.stage1Paid),
    stage2Paid: Boolean(c.stage2Paid),
    challengeExpiry: Number(c.challengeExpiry),
    isDisputed: Boolean(c.isDisputed),
    disputeEvidenceCid: c.disputeEvidenceCid,
    challenger: c.challenger,
    commitDeadline: Number(commitDeadline),
    revealDeadline: Number(revealDeadline),
    vendorCount: (vendors as string[]).length,
  };
}

/** Parses raw escrow logs into normalized, dedupe-keyed events (unknown logs are skipped). */
export function parseEscrowLogs(logs: readonly ethers.Log[]): EscrowEvent[] {
  const out: EscrowEvent[] = [];
  for (const log of logs) {
    let parsed: ethers.LogDescription | null = null;
    try {
      parsed = escrowInterface.parseLog(log);
    } catch {
      parsed = null;
    }
    if (!parsed) continue;
    const args: Record<string, string> = {};
    parsed.fragment.inputs.forEach((input, i) => {
      args[input.name] = String(parsed!.args[i]);
    });
    out.push({
      key: `${log.transactionHash}:${log.index}`,
      name: parsed.name,
      campaignId: Number(args.campaignId ?? 0),
      blockNumber: log.blockNumber,
      logIndex: log.index,
      txHash: log.transactionHash,
      args,
    });
  }
  return out;
}

/** Merge event lists, dropping duplicates by key, newest first. */
export function mergeEvents(existing: readonly EscrowEvent[], incoming: readonly EscrowEvent[]): EscrowEvent[] {
  const map = new Map<string, EscrowEvent>();
  for (const e of existing) map.set(e.key, e);
  for (const e of incoming) {
    const prev = map.get(e.key);
    map.set(e.key, prev ? { ...e, timestamp: e.timestamp ?? prev.timestamp } : e);
  }
  return [...map.values()].sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

/** Attach block timestamps (best effort, bounded) to events lacking one. */
export async function attachTimestamps(provider: ethers.Provider, events: EscrowEvent[], maxBlocks = 150): Promise<EscrowEvent[]> {
  const blocks = [...new Set(events.filter((e) => e.timestamp === undefined).map((e) => e.blockNumber))].slice(0, maxBlocks);
  const times = new Map<number, number>();
  await Promise.all(
    blocks.map(async (b) => {
      try {
        const blk = await provider.getBlock(b);
        if (blk) times.set(b, blk.timestamp);
      } catch {
        /* leave undefined */
      }
    })
  );
  return events.map((e) => (e.timestamp === undefined && times.has(e.blockNumber) ? { ...e, timestamp: times.get(e.blockNumber) } : e));
}
