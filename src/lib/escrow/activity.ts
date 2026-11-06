import type { EscrowEvent } from "./types";

/** Human descriptions for escrow events — shared by every activity feed and audit trail. */
export interface ActivityDescriptor {
  title: string;
  category: "funding" | "procurement" | "delivery" | "validation" | "settlement" | "refund" | "dispute" | "state";
  tone: "verified" | "pending" | "info" | "failed" | "neutral";
  /** Arg holding the primary amount, if any. */
  amountArg?: string;
  /** Arg holding the primary actor address, if any. */
  actorArg?: string;
}

export const EVENT_DESCRIPTORS: Record<string, ActivityDescriptor> = {
  CampaignCreated: { title: "Campaign created", category: "funding", tone: "info", amountArg: "budgetCeiling", actorArg: "creator" },
  FundsDeposited: { title: "Donation received", category: "funding", tone: "verified", amountArg: "amount", actorArg: "donor" },
  CampaignFullyFunded: { title: "Fully funded", category: "funding", tone: "verified", amountArg: "totalAmount" },
  AuctionOpened: { title: "Procurement opened", category: "procurement", tone: "info" },
  BidCommitted: { title: "Sealed bid committed", category: "procurement", tone: "info", amountArg: "bondAmount", actorArg: "vendor" },
  BidRevealed: { title: "Bid revealed", category: "procurement", tone: "info", amountArg: "amount", actorArg: "vendor" },
  AuctionFinalized: { title: "Vendor awarded", category: "procurement", tone: "verified", amountArg: "winningAmount", actorArg: "winningVendor" },
  EvidenceSubmitted: { title: "Delivery evidence submitted", category: "delivery", tone: "pending", actorArg: "vendor" },
  VoteCast: { title: "Validator vote", category: "validation", tone: "pending", actorArg: "validator" },
  QuorumReached: { title: "Validator quorum reached", category: "validation", tone: "verified" },
  Stage1Settled: { title: "Stage 1 released (70%)", category: "settlement", tone: "verified", amountArg: "payoutAmount", actorArg: "vendor" },
  Stage2Settled: { title: "Stage 2 released (30%)", category: "settlement", tone: "verified", amountArg: "payoutAmount", actorArg: "vendor" },
  DisputeRaised: { title: "Dispute raised", category: "dispute", tone: "failed", actorArg: "challenger" },
  DisputeResolved: { title: "Dispute resolved", category: "dispute", tone: "info" },
  RefundClaimed: { title: "Refund claimed", category: "refund", tone: "info", amountArg: "amount", actorArg: "donor" },
  StateTransition: { title: "Phase changed", category: "state", tone: "neutral" },
};

export function describeEvent(e: EscrowEvent): ActivityDescriptor & { detail?: string } {
  const d = EVENT_DESCRIPTORS[e.name] ?? { title: e.name, category: "state" as const, tone: "neutral" as const };
  let detail: string | undefined;
  if (e.name === "VoteCast") detail = e.args.approved === "true" ? "Approved delivery" : "Rejected delivery";
  if (e.name === "DisputeResolved") detail = e.args.upheld === "true" ? "Dispute upheld" : "Dispute dismissed";
  if (e.name === "EvidenceSubmitted") detail = `Manifest ${e.args.ipfsCid?.slice(0, 18) ?? ""}…`;
  return { ...d, detail };
}

/** True if `address` is the primary actor of the event (case-insensitive). */
export function involves(e: EscrowEvent, address: string | null | undefined): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  return Object.values(e.args).some((v) => typeof v === "string" && v.toLowerCase() === a);
}
