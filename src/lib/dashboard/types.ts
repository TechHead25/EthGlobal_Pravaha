/**
 * @file types.ts
 * @notice OpenAid Protocol Dashboard State Model & Typed Module Interface Contracts.
 *         Governs the separation of On-Chain Truth, Expiring Public DB State,
 *         and Off-Chain Verifiable Oracle Proofs.
 */

export type DashboardStateMode =
  | "loading"
  | "empty"
  | "connected"
  | "wrong_network"
  | "error"
  | "transaction_pending"
  | "transaction_confirmed";

export type DataProvenanceTier =
  | "ON_CHAIN_SETTLEMENT"      // Tier 1: Arc Testnet escrow & USDC balances (Irrevocable on-chain truth)
  | "QUERYABLE_EXPIRING_STATE" // Tier 2: Arkiv Rabdi testnet database (Time-scoped, wallet-owned metadata)
  | "ORACLE_OFF_CHAIN_PROOF"   // Tier 3: Off-chain attestations (World ID zero-knowledge, Chainlink CRE)
  | "DEMO_SIMULATION";         // Tier 4: Local interactive calculators / test sandboxes (Explicitly badged)

/**
 * 1. Arc Module Frontend Contract (Tier 1: On-Chain Settlement)
 */
export interface ArcCampaignSummary {
  id: number;
  creator: string;
  budgetCeiling: bigint;
  totalDeposited: bigint;
  fundingDeadline: number;
  deliveryDeadline: number;
  metadataCid: string;
  state: number;
  stateLabel: string;
  winningVendor: string;
  winningBidAmount: bigint;
  evidenceIpfsCid: string;
  affirmativeVotes: number;
  negativeVotes: number;
  stage1Paid: boolean;
  stage2Paid: boolean;
}

export interface ArcDashboardContract {
  provenance: "ON_CHAIN_SETTLEMENT";
  chainId: number;
  isCorrectNetwork: boolean;
  escrowAddress: string;
  usdcAddress: string;
  tokenDecimals: number;
  tokenSymbol: string;
  hasBytecode: boolean;
  campaignCount: number;
  escrowBalance: bigint;
  userAddress: string | null;
  userBalance: bigint;
  userAllowance: bigint;
  userDonorDeposit: bigint;
  activeCampaign: ArcCampaignSummary | null;
  fundingStep: string;
  isTransactionPending: boolean;
  lastConfirmedTxHash?: string;
  error: string | null;
}

/**
 * 2. Arkiv Module Frontend Contract (Tier 2: Expiring Public DB State)
 */
export interface ArkivEntitySummary {
  id: string;
  type: "ProcurementRequest" | "ProcurementBid" | "DeliveryEvidence" | "ValidatorReview" | string;
  owner: string;
  createdAt: number;
  expiresAt: number;
  ttlRemainingDays?: number;
  title?: string;
  campaignId?: number;
  status?: string;
  commitHash?: string;
  revealedBidUSDC?: number;
  carrierName?: string;
  waybillNumber?: string;
  manifestCid?: string;
  decision?: string;
  humanVerified?: boolean;
}

export interface ArkivDashboardContract {
  provenance: "QUERYABLE_EXPIRING_STATE";
  network: "rabdi" | string;
  chainId: number;
  explorerUrl: string;
  entities: ArkivEntitySummary[];
  isLoading: boolean;
  activeFilter: string;
  totalCount: number;
  error: string | null;
}

/**
 * 3. World ID Module Frontend Contract (Tier 3: Zero-Knowledge Human Proof)
 */
export interface WorldIdDashboardContract {
  provenance: "ORACLE_OFF_CHAIN_PROOF";
  appId: string;
  action: string;
  isVerified: boolean;
  isLoading: boolean;
  executionMode: "live_developer_portal" | "sandbox_staging";
  nullifierHash: string | null;
  error: string | null;
}

/**
 * 4. Chainlink CRE Module Frontend Contract (Tier 3: Decentralized Oracle Evidence Verification)
 */
export interface CreEvidenceChecks {
  manifestIntegrity: boolean;
  carrierDeliveryConfirmed: boolean;
  itemCountSatisfied: boolean;
  geoCoordinatesInZone: boolean;
}

export interface CreDashboardResult {
  campaignId: number;
  manifestCid: string;
  isVerified: boolean;
  confidenceScore: number;
  checks: CreEvidenceChecks;
  attestationDigest: string;
  timestamp: number;
  recommendation: "APPROVE_FOR_HUMAN_REVIEW" | "REJECT_ANOMALOUS_EVIDENCE";
  reason: string;
}

export interface CreDashboardContract {
  provenance: "ORACLE_OFF_CHAIN_PROOF";
  isLoading: boolean;
  executionMode: "local_runtime_simulator" | "remote_don";
  result: CreDashboardResult | null;
  lastExecutedAt: number | null;
  error: string | null;
}

/**
 * Unified Dashboard State Model
 */
export interface UnifiedDashboardState {
  mode: DashboardStateMode;
  arc: ArcDashboardContract;
  arkiv: ArkivDashboardContract;
  worldId: WorldIdDashboardContract;
  cre: CreDashboardContract;
  globalError: string | null;
}

/**
 * Helper to compute high-level dashboard mode from component contracts.
 */
export function deriveDashboardMode(params: {
  isConnected: boolean;
  isCorrectNetwork: boolean;
  isLoadingAccounting: boolean;
  hasBytecode: boolean;
  campaignCount: number;
  fundingStep: string;
  actionError: string | null;
}): DashboardStateMode {
  if (params.actionError) return "error";
  if (params.isLoadingAccounting) return "loading";
  if (!params.isConnected) return "empty";
  if (!params.isCorrectNetwork) return "wrong_network";
  if (
    params.fundingStep === "validating" ||
    params.fundingStep === "awaiting_approval_signature" ||
    params.fundingStep === "approving" ||
    params.fundingStep === "awaiting_deposit_signature" ||
    params.fundingStep === "depositing"
  ) {
    return "transaction_pending";
  }
  if (params.fundingStep === "confirmed") return "transaction_confirmed";
  if (params.campaignCount === 0 || !params.hasBytecode) return "empty";
  return "connected";
}
