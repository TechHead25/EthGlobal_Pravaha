/**
 * @file types.ts
 * @notice Typed data models for Arkiv decentralized entities in OpenAid Protocol.
 *         Reflects on-chain entity layouts with schema tags and expiration bounds.
 */

export type ArkivEntityType =
  | "ProcurementRequest"
  | "ProcurementBid"
  | "DeliveryEvidence"
  | "ValidatorReview";

export interface ArkivEntityBase {
  id: string;               // Arkiv entity key (Hex format 0x...)
  type: ArkivEntityType;
  owner: string;            // Ethereum wallet address of the entity creator
  createdAt: number;        // Unix timestamp or creation block
  expiresAt: number;        // Expiration boundary timestamp or block
  txHash?: string;          // Creation/mutation transaction hash on Rabdi testnet
  schema?: string;          // Qualified schema tag (e.g. openaid.v1.requests)
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

export type ArkivEntity =
  | ProcurementRequestEntity
  | ProcurementBidEntity
  | DeliveryEvidenceEntity
  | ValidatorReviewEntity;

export interface ArkivQueryFilter {
  type?: ArkivEntityType;
  owner?: string;
  status?: string;
  campaignId?: number;
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
