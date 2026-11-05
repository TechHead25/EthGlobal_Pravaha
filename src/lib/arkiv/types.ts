/**
 * @file types.ts
 * @notice Schemas and types for Arkiv wallet-owned queryable entities.
 */

export interface ArkivEntityBase {
  id: string;
  type: "ProcurementRequest" | "ProcurementBid" | "DeliveryEvidence" | "ValidatorReview";
  owner: string; // Ethereum wallet address of the entity creator
  createdAt: number; // Unix timestamp in seconds
  expiresAt: number; // Unix timestamp in seconds (time-scoped state)
}

export interface ProcurementRequestEntity extends ArkivEntityBase {
  type: "ProcurementRequest";
  campaignId: number;
  title: string;
  itemCategory: string;
  itemCount: number;
  itemUnit: string;
  budgetCeilingUSDC: number;
  targetRegion: string;
  status: "Funding" | "OpenForBids" | "UnderReview" | "Delivered" | "Settled" | "Expired";
  metadataCid: string;
}

export interface ProcurementBidEntity extends ArkivEntityBase {
  type: "ProcurementBid";
  campaignId: number;
  vendorAddress: string;
  commitHash: string;
  revealedBidUSDC?: number;
  status: "Committed" | "Revealed" | "Won" | "Lost" | "Expired";
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
  decision: "APPROVE" | "REJECT";
  humanVerified: boolean; // World ID human verification flag
  notes: string;
}

export type ArkivEntity =
  | ProcurementRequestEntity
  | ProcurementBidEntity
  | DeliveryEvidenceEntity
  | ValidatorReviewEntity;

export interface ArkivQueryFilter {
  type?: ArkivEntity["type"];
  owner?: string;
  status?: string;
  campaignId?: number;
  activeOnly?: boolean;
}
