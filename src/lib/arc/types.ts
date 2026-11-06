/**
 * OpenAid Protocol — Arc Testnet Integration Types
 * Strictly reflects Solidity OpenAidEscrow.sol contract state and data structures.
 */

export enum CampaignState {
  FundingActive = 0,        // 0: Donors depositing USDC
  FundingFailed = 1,        // 1: Deadline passed before budget reached
  BiddingCommit = 2,        // 2: Vendors submitting sealed bid hashes
  BiddingReveal = 3,        // 3: Vendors revealing plain bid amounts
  AuctionFailed = 4,        // 4: Zero valid reveals submitted
  AwaitingDelivery = 5,     // 5: Winning vendor fulfilling delivery
  DeliveryFailed = 6,       // 6: Delivery deadline expired without evidence
  VerificationPending = 7,  // 7: Evidence committed; validators voting
  VerificationFailed = 8,   // 8: Rejected by validators or voting timeout
  InChallengePeriod = 9,    // 9: Stage 1 paid; 72h/demo timelock window open
  Disputed = 10,            // 10: Fraud challenge filed; Stage 2 locked
  Completed = 11,           // 11: Final settlement completed (30% disbursed or refunded)
  Refunded = 12             // 12: Terminal refund state
}

export const CAMPAIGN_STATE_LABELS: Record<CampaignState, string> = {
  [CampaignState.FundingActive]: "FundingActive",
  [CampaignState.FundingFailed]: "FundingFailed",
  [CampaignState.BiddingCommit]: "BiddingCommit",
  [CampaignState.BiddingReveal]: "BiddingReveal",
  [CampaignState.AuctionFailed]: "AuctionFailed",
  [CampaignState.AwaitingDelivery]: "AwaitingDelivery",
  [CampaignState.DeliveryFailed]: "DeliveryFailed",
  [CampaignState.VerificationPending]: "VerificationPending",
  [CampaignState.VerificationFailed]: "VerificationFailed",
  [CampaignState.InChallengePeriod]: "InChallengePeriod",
  [CampaignState.Disputed]: "Disputed",
  [CampaignState.Completed]: "Completed",
  [CampaignState.Refunded]: "Refunded",
};

export interface OnChainCampaign {
  id: number;
  creator: string;
  budgetCeiling: bigint;
  totalDeposited: bigint;
  fundingDeadline: number;
  deliveryDeadline: number;
  metadataCid: string;
  state: CampaignState;
  stateLabel: string;
  winningVendor: string;
  winningBidAmount: bigint;
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
}

export interface WalletState {
  address: string | null;
  chainId: number | null;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  isConnecting: boolean;
  error: string | null;
}

export type FundingTxStep =
  | "idle"
  | "validating"
  | "awaiting_approval_signature"
  | "approving"
  | "awaiting_deposit_signature"
  | "depositing"
  | "confirmed"
  | "error";

export interface FundingStatus {
  step: FundingTxStep;
  approvalTxHash?: string;
  depositTxHash?: string;
  errorMessage?: string;
}

export interface ContractAccounting {
  campaignCount: number;
  escrowAddress: string;
  usdcAddress: string;
  tokenDecimals: number;
  tokenSymbol: string;
  userUsdcBalance: bigint;
  userAllowance: bigint;
  userDonorDeposit: bigint;
  escrowUsdcBalance: bigint;
  hasBytecode: boolean;
}
