import { CampaignState } from "./arc/types";
import type { BadgeTone } from "@/components/ui/badge";

/** Human-readable campaign phases mapped from the V1 on-chain state machine. */
export const STATE_PRESENTATION: Record<number, { label: string; tone: BadgeTone; phase: LifecyclePhase }> = {
  [CampaignState.FundingActive]: { label: "Funding open", tone: "pending", phase: "funding" },
  [CampaignState.FundingFailed]: { label: "Funding failed · refunds open", tone: "failed", phase: "funding" },
  [CampaignState.BiddingCommit]: { label: "Procurement · sealed bids", tone: "info", phase: "procurement" },
  [CampaignState.BiddingReveal]: { label: "Procurement · reveal", tone: "info", phase: "procurement" },
  [CampaignState.AuctionFailed]: { label: "No valid bids · refunds open", tone: "failed", phase: "procurement" },
  [CampaignState.AwaitingDelivery]: { label: "Awaiting delivery", tone: "pending", phase: "delivery" },
  [CampaignState.DeliveryFailed]: { label: "Delivery missed · refunds open", tone: "failed", phase: "delivery" },
  [CampaignState.VerificationPending]: { label: "Validator review", tone: "pending", phase: "validation" },
  [CampaignState.VerificationFailed]: { label: "Evidence rejected · refunds open", tone: "failed", phase: "validation" },
  [CampaignState.InChallengePeriod]: { label: "Stage 1 paid · challenge window", tone: "verified", phase: "settlement" },
  [CampaignState.Disputed]: { label: "Disputed", tone: "disputed", phase: "settlement" },
  [CampaignState.Completed]: { label: "Completed", tone: "completed", phase: "settlement" },
  [CampaignState.Refunded]: { label: "Refunded", tone: "completed", phase: "settlement" },
};

export function presentState(state: number) {
  return STATE_PRESENTATION[state] ?? { label: `Unknown state ${state}`, tone: "neutral" as BadgeTone, phase: "funding" as LifecyclePhase };
}

export const LIFECYCLE = [
  { key: "funding", title: "Funding", body: "Donors deposit USDC into the campaign escrow up to a fixed budget ceiling." },
  { key: "procurement", title: "Procurement", body: "Vendors post a 5% bond and submit sealed commit–reveal bids. Lowest valid reveal wins." },
  { key: "delivery", title: "Delivery", body: "The winning vendor delivers and anchors a manifest CID as evidence before the deadline." },
  { key: "validation", title: "Validation", body: "Independent validators vote. 3 of 5 approvals release Stage 1; 3 rejections trigger refunds." },
  { key: "settlement", title: "Settlement", body: "70% pays on quorum, 30% after the challenge window. Failure paths refund donors pro-rata." },
] as const;
export type LifecyclePhase = (typeof LIFECYCLE)[number]["key"];

/** States in which donors can call claimRefund for a full refund. */
export const FULL_REFUND_STATES = new Set<number>([
  CampaignState.FundingFailed,
  CampaignState.AuctionFailed,
  CampaignState.DeliveryFailed,
  CampaignState.VerificationFailed,
]);

export function lifecycleStatus(state: number, phase: LifecyclePhase): "done" | "current" | "upcoming" | "failed" {
  const order = LIFECYCLE.map((l) => l.key);
  const p = presentState(state);
  const cur = order.indexOf(p.phase);
  const idx = order.indexOf(phase);
  if (idx < cur) return "done";
  if (idx > cur) return "upcoming";
  if (p.tone === "failed") return "failed";
  if (state === CampaignState.Completed || state === CampaignState.Refunded) return "done";
  return "current";
}
