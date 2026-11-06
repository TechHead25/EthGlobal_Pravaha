/**
 * Isomorphic escrow types shared by the server data layer, the client live layer,
 * and every role dashboard. All values originate from OpenAidEscrow V1 on Arc Testnet,
 * except `metadata`, which is creator-supplied IPFS JSON (self-declared, untrusted).
 */

/** Off-chain campaign descriptor fetched from IPFS by the on-chain metadataCid. Untrusted. */
export interface CampaignMetadata {
  title?: string;
  description?: string;
  category?: string;
  urgency?: string;
  organization?: string;
  region?: string;
}

export interface CampaignView {
  id: number;
  creator: string;
  budgetCeiling: string; // bigint as decimal string (serializable)
  totalDeposited: string;
  fundingDeadline: number;
  deliveryDeadline: number;
  metadataCid: string;
  state: number;
  stateLabel: string;
  winningVendor: string;
  winningBidAmount: string;
  evidenceIpfsCid: string;
  evidenceSubmittedAt: number;
  affirmativeVotes: number;
  negativeVotes: number;
  stage1Paid: boolean;
  stage2Paid: boolean;
  challengeExpiry: number;
  isDisputed: boolean;
  disputeEvidenceCid: string;
  challenger: string;
  commitDeadline: number;
  revealDeadline: number;
  vendorCount: number;
  metadata: CampaignMetadata | null;
}

export interface EscrowEvent {
  /** Stable dedupe key: `${txHash}:${logIndex}`. */
  key: string;
  name: string;
  campaignId: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  /** Block timestamp (seconds) when known. */
  timestamp?: number;
  args: Record<string, string>;
}

export type ChainRead<T> =
  | { status: "ok"; data: T; readAt: string }
  | { status: "unavailable"; reason: string; readAt: string };

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
