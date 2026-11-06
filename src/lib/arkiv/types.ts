/**
 * @file types.ts
 * @notice Typed data models for Arkiv decentralized entities in OpenAid Protocol.
 *         Reflects on-chain entity layouts with schema tags and expiration bounds.
 *         Supports both OpenAid V1 and OpenAid V2 sub-vault architecture.
 */

export type ArkivEntityType =
  // V1 Types
  | "ProcurementRequest"
  | "ProcurementBid"
  | "DeliveryEvidence"
  | "ValidatorReview"
  // V2 Types
  | "SubCampaign"
  | "RankedBidHistory"
  | "VendorReplacementLog"
  | "ValidatorAssignment";

export interface ArkivEntityBase {
  id: string;               // Arkiv entity key (Hex format 0x...)
  type: ArkivEntityType;
  owner: string;            // Ethereum wallet address of the entity creator
  createdAt: number;        // Unix timestamp or creation block
  expiresAt: number;        // Expiration boundary timestamp or block
  txHash?: string;          // Creation/mutation transaction hash on Rabdi testnet
  schema?: string;          // Qualified schema tag (e.g. openaid.v2.subcampaigns)
}

/**
 * ============================================================================
 * V1 Entity Interfaces
 * ============================================================================
 */

export interface ProcurementRequestEntity extends ArkivEntityBase {
  type: "ProcurementRequest";
  campaignId: number;
  title: string;
  itemCategory: string;
  itemCount: number;
  itemUnit: string;
  budgetCeilingUSDC: number;
  targetRegion: string;
  status: "Funding" | "OpenForBids" | "UnderReview" | "Delivered" | "Settled" | "Expired" | string;
  metadataCid: string;
}

export interface ProcurementBidEntity extends ArkivEntityBase {
  type: "ProcurementBid";
  campaignId: number;
  vendorAddress: string;
  commitHash: string;
  revealedBidUSDC?: number;
  status: "Committed" | "Revealed" | "Won" | "Lost" | "Expired" | string;
}

export interface DeliveryEvidenceEntity extends ArkivEntityBase {
  type: "DeliveryEvidence";
  campaignId: number;
  vendorAddress: string;
  manifestCid: string;
  carrierName: string;
  waybillNumber: string;
  packageCount: number;
  verifiedItemCount: number;
}

export interface ValidatorReviewEntity extends ArkivEntityBase {
  type: "ValidatorReview";
  campaignId: number;
  validatorAddress: string;
  decision: "APPROVE" | "REJECT" | string;
  humanVerified: boolean;
  notes: string;
}

/**
 * ============================================================================
 * V2 Entity Interfaces
 * ============================================================================
 */

export interface SubCampaignEntity extends ArkivEntityBase {
  type: "SubCampaign";
  campaignId: number;
  subVaultId: number;
  category: string;
  budgetCeiling: number;
  targetSpecifications: string;
  ipfsManifestCid: string;
  status?: string;
}

export interface RankedBidHistoryEntity extends ArkivEntityBase {
  type: "RankedBidHistory";
  campaignId: number;
  subVaultId: number;
  rank1Vendor: string;
  rank1Amount: number;
  rank2Vendor?: string;
  rank2Amount?: number;
  commitTimestamps: string;
}

export interface VendorReplacementLogEntity extends ArkivEntityBase {
  type: "VendorReplacementLog";
  campaignId: number;
  subVaultId: number;
  defaultVendor: string;
  replacementVendor: string;
  reason: string;
  priceDeficit: number;
  timestamp: number;
}

export interface ValidatorAssignmentEntity extends ArkivEntityBase {
  type: "ValidatorAssignment";
  campaignId: number;
  subVaultId: number;
  panelValidatorAddresses: string;
  seed: string;
  decisionVotes: string;
}

export type ArkivEntity =
  | ProcurementRequestEntity
  | ProcurementBidEntity
  | DeliveryEvidenceEntity
  | ValidatorReviewEntity
  | SubCampaignEntity
  | RankedBidHistoryEntity
  | VendorReplacementLogEntity
  | ValidatorAssignmentEntity;

export interface ArkivQueryFilter {
  type?: ArkivEntityType;
  owner?: string;
  status?: string;
  campaignId?: number;
  subVaultId?: number;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface ArkivPaginatedResult {
  entities: ArkivEntity[];
  totalCount?: number;
  blockNumber: bigint;
  hasMore: boolean;
}

/**
 * ============================================================================
 * V2 Input & Audit Trail Types
 * ============================================================================
 */

export interface CreateSubCampaignInput {
  campaignId: number;
  subVaultId: number;
  category: string;
  budgetCeiling: number;
  targetSpecifications: string;
  ipfsManifestCid: string;
  status?: string;
  owner?: string;
}

export interface RecordRankedBidsInput {
  rank1Vendor: string;
  rank1Amount: number;
  rank2Vendor?: string;
  rank2Amount?: number;
  commitTimestamps?: string | string[] | number[];
  owner?: string;
}

export interface VendorReplacementInput {
  defaultVendor: string;
  replacementVendor: string;
  reason: string;
  priceDeficit: number;
  timestamp?: number;
  owner?: string;
}

export interface ValidatorAssignmentInput {
  panelValidatorAddresses: string[] | string;
  seed: string;
  decisionVotes?: Record<string, string> | string;
  owner?: string;
}

export type AuditTrailStep =
  | "CampaignCreated"
  | "SubVaultCreated"
  | "BidsRanked"
  | "WinnerSelected"
  | "VendorReplaced"
  | "EvidenceSubmitted"
  | "ValidatorVotes"
  | "Settled"
  | "Refunded";

export interface AuditTrailEvent {
  step: AuditTrailStep;
  timestamp: number;
  campaignId: number;
  subVaultId?: number;
  summary: string;
  details: Record<string, any>;
  txHash?: string;
}
