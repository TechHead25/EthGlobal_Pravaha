/**
 * Single fund-flow model used by every dashboard (donor, NGO, vendor, validator) and the
 * public campaign page. Derived only from on-chain campaign state and escrow events.
 *
 * V1 money path:  Donors → Campaign escrow → (award) Vendor commitment → Stage 1 (70%) → Stage 2 (30%)
 *                                         ↘ Refunds to donors        ↘ Unawarded surplus (refundable)
 * Funds never pass through NGO or validator wallets. Sub-campaign vaults are V2-only.
 */
import { CampaignState } from "../arc/types";
import type { CampaignView, EscrowEvent } from "./types";
import { ZERO_ADDRESS } from "./types";

export const STAGE1_PERCENT = 70n;
export const STAGE2_PERCENT = 30n;

export interface FundFlow {
  /** Donor deposits received by the campaign escrow. */
  donated: bigint;
  /** Winning bid committed to the vendor (procurement commitment). 0 until awarded. */
  awarded: bigint;
  /** Budget not needed by the winning bid; refundable to donors pro-rata on completion. */
  surplus: bigint;
  /** Actually paid to the vendor (Stage 1 + Stage 2). */
  released: bigint;
  stage1Released: bigint;
  stage2Released: bigint;
  /** Actually refunded to donors via claimRefund. */
  refunded: bigint;
  /** Donor funds still held by the escrow for this campaign. */
  inEscrow: bigint;
  /** Of the award, the part not yet released. */
  awardOutstanding: bigint;
  stage1: MilestoneStatus;
  stage2: MilestoneStatus;
  /** Whether donor refunds (full or surplus) are claimable by contract rules. */
  refundsOpen: boolean;
  /** Where amounts came from: events (exact) or state flags (derived). */
  basis: "events" | "state";
}

export type MilestoneStatus = "not_applicable" | "locked" | "eligible" | "released" | "withheld";

const sumArg = (events: readonly EscrowEvent[], name: string, arg: string, pred?: (e: EscrowEvent) => boolean) =>
  events.filter((e) => e.name === name && (!pred || pred(e))).reduce((s, e) => s + BigInt(e.args[arg] ?? "0"), 0n);

const FAIL_STATES = new Set<number>([CampaignState.FundingFailed, CampaignState.AuctionFailed, CampaignState.DeliveryFailed, CampaignState.VerificationFailed, CampaignState.Cancelled]);

export function computeFundFlow(c: CampaignView, events: readonly EscrowEvent[] = [], nowSec = Math.floor(Date.now() / 1000)): FundFlow {
  const own = events.filter((e) => e.campaignId === c.id);
  const donated = BigInt(c.totalDeposited);
  const budget = BigInt(c.budgetCeiling);
  const awardedRaw = c.winningVendor !== ZERO_ADDRESS ? BigInt(c.winningBidAmount) : 0n;

  const ev1 = sumArg(own, "Stage1Settled", "payoutAmount");
  const ev2 = sumArg(own, "Stage2Settled", "payoutAmount");
  const stage1Released = ev1 > 0n ? ev1 : c.stage1Paid ? (awardedRaw * STAGE1_PERCENT) / 100n : 0n;
  const stage2Released = ev2 > 0n ? ev2 : c.stage2Paid ? (awardedRaw * STAGE2_PERCENT) / 100n : 0n;
  const refunded = sumArg(own, "RefundClaimed", "amount");
  const basis = ev1 > 0n || ev2 > 0n || refunded > 0n || !(c.stage1Paid || c.stage2Paid) ? "events" : "state";

  const released = stage1Released + stage2Released;
  const surplus = awardedRaw > 0n && budget > awardedRaw ? budget - awardedRaw : 0n;
  const inEscrowRaw = donated - released - refunded;
  const inEscrow = inEscrowRaw > 0n ? inEscrowRaw : 0n;
  const outstanding = awardedRaw - released;

  const failed = FAIL_STATES.has(c.state);
  let stage1: MilestoneStatus = "not_applicable";
  let stage2: MilestoneStatus = "not_applicable";
  if (awardedRaw > 0n) {
    stage1 = c.stage1Paid ? "released" : failed ? "withheld" : "locked";
    if (c.stage2Paid) stage2 = "released";
    else if (c.isDisputed && c.state === CampaignState.Completed) stage2 = "withheld";
    else if (failed) stage2 = "withheld";
    else if (c.state === CampaignState.InChallengePeriod && nowSec > c.challengeExpiry && !c.isDisputed) stage2 = "eligible";
    else stage2 = "locked";
  }

  return {
    donated,
    awarded: awardedRaw,
    surplus,
    released,
    stage1Released,
    stage2Released,
    refunded,
    inEscrow,
    awardOutstanding: outstanding > 0n ? outstanding : 0n,
    stage1,
    stage2,
    refundsOpen: failed || (c.state === CampaignState.Completed && (surplus > 0n || (c.isDisputed && !c.stage2Paid))),
    basis,
  };
}

/** Sum flows across campaigns (e.g. an NGO's portfolio or the whole platform). */
export function sumFlows(flows: readonly FundFlow[]): Pick<FundFlow, "donated" | "awarded" | "surplus" | "released" | "refunded" | "inEscrow" | "awardOutstanding"> {
  const z = { donated: 0n, awarded: 0n, surplus: 0n, released: 0n, refunded: 0n, inEscrow: 0n, awardOutstanding: 0n };
  for (const f of flows) {
    z.donated += f.donated;
    z.awarded += f.awarded;
    z.surplus += f.surplus;
    z.released += f.released;
    z.refunded += f.refunded;
    z.inEscrow += f.inEscrow;
    z.awardOutstanding += f.awardOutstanding;
  }
  return z;
}

/**
 * A donor's pro-rata view of a campaign flow. Deposits and refunds are the donor's own exact
 * on-chain values; allocations/releases are their proportional share (labelled as such in UI).
 */
export function donorShare(flow: FundFlow, campaign: CampaignView, deposit: bigint, ownRefunds: bigint) {
  const total = BigInt(campaign.totalDeposited);
  const share = (v: bigint) => (total > 0n ? (v * deposit) / total : 0n);
  const releasedShare = share(flow.released);
  const held = deposit - releasedShare - ownRefunds;
  return {
    deposit,
    awardedShare: share(flow.awarded),
    releasedShare,
    refunded: ownRefunds,
    inEscrowShare: held > 0n ? held : 0n,
    shareBps: total > 0n ? Number((deposit * 10000n) / total) : 0,
  };
}

/** Utilization = released to vendor / donated (basis points). */
export function utilizationBps(released: bigint, donated: bigint): number {
  return donated > 0n ? Number((released * 10000n) / donated) : 0;
}

const FULL_REFUND = new Set<number>([CampaignState.FundingFailed, CampaignState.AuctionFailed, CampaignState.DeliveryFailed, CampaignState.VerificationFailed, CampaignState.Cancelled]);

/**
 * Estimate of what claimRefund would pay this donor, mirroring OpenAidEscrow.claimRefund.
 * The contract computes the authoritative amount at claim time.
 */
export function estimateRefund(c: CampaignView, deposit: bigint, surplus: bigint, claimed: boolean): bigint {
  if (claimed || deposit === 0n) return 0n;
  if (FULL_REFUND.has(c.state)) return deposit;
  if (c.state === CampaignState.Completed) {
    let pool = surplus;
    if (c.isDisputed && !c.stage2Paid) pool += (BigInt(c.winningBidAmount) * STAGE2_PERCENT) / 100n;
    const total = BigInt(c.totalDeposited);
    return total > 0n ? (pool * deposit) / total : 0n;
  }
  return 0n;
}

/** Campaign is still moving through its lifecycle (not terminal). */
export function isActiveState(state: number): boolean {
  return [0, 2, 3, 5, 7, 9, 10].includes(state);
}
