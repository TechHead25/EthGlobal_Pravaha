/**
 * @file schemas.ts
 * @notice Official Arkiv Schema definitions for OpenAid Protocol.
 *         Uses unique, versioned namespaces under 'openaid.v1.*' and 'openaid.v2.*' to avoid collisions.
 *         Only fields required for sorting and filtering are marked as indexed.
 */

import { defineSchema, u64, str, addr, bool, ExpirationTime } from "@arkiv-network/sdk";

export const ARKIV_NAMESPACE = "openaid.v1";
export const ARKIV_V2_NAMESPACE = "openaid.v2";

/**
 * ============================================================================
 * V1 SCHEMAS (Maintained for Backward Compatibility)
 * ============================================================================
 */

/**
 * 1. Procurement Request Schema:
 * Stored by NGO campaign coordinators to list humanitarian supplies needed.
 */
export const ProcurementRequestSchema = defineSchema(`${ARKIV_NAMESPACE}.requests`, {
  campaignId: u64().indexed(),
  status: str().indexed(),
  targetRegion: str().indexed(),
  title: str(),
  itemCategory: str(),
  itemCount: u64(),
  itemUnit: str(),
  budgetCeilingUSDC: u64(),
  metadataCid: str(),
});

/**
 * 2. Procurement Bid Schema:
 * Stored by vendors participating in sealed-bid or revealed procurement tenders.
 */
export const ProcurementBidSchema = defineSchema(`${ARKIV_NAMESPACE}.bids`, {
  campaignId: u64().indexed(),
  vendorAddress: addr().indexed(),
  status: str().indexed(),
  commitHash: str(),
  revealedBidUSDC: u64().optional(),
});

/**
 * 3. Delivery Evidence Schema:
 * Stored by the winning vendor referencing shipping waybills and IPFS delivery manifests.
 */
export const DeliveryEvidenceSchema = defineSchema(`${ARKIV_NAMESPACE}.evidence`, {
  campaignId: u64().indexed(),
  vendorAddress: addr().indexed(),
  carrierName: str().indexed(),
  waybillNumber: str(),
  manifestCid: str(),
  packageCount: u64(),
  verifiedItemCount: u64(),
});

/**
 * 4. Validator Review Schema:
 * Stored by independent validators recording audit attestations and World ID verification.
 */
export const ValidatorReviewSchema = defineSchema(`${ARKIV_NAMESPACE}.reviews`, {
  campaignId: u64().indexed(),
  validatorAddress: addr().indexed(),
  decision: str().indexed(), // "APPROVE" | "REJECT"
  humanVerified: bool(),     // World ID proof flag
  notes: str(),
});

/**
 * ============================================================================
 * V2 SCHEMAS (OpenAid Protocol V2 Sub-Vault & Multi-Stage Architecture)
 * Namespace: openaid.v2.*
 * ============================================================================
 */

/**
 * 5. SubCampaign Schema:
 * Represents isolated sub-vault allocations (e.g. Food, Clothes, Medical Supplies).
 */
export const SubCampaignSchema = defineSchema(`${ARKIV_V2_NAMESPACE}.subcampaigns`, {
  campaignId: u64().indexed(),
  subVaultId: u64().indexed(),
  category: str().indexed(),
  budgetCeiling: u64(),
  targetSpecifications: str(),
  ipfsManifestCid: str(),
});

/**
 * 6. RankedBidHistory Schema:
 * Records revealed and ranked bids for sub-vault auctions, tracking rank 1 and backup vendor bids.
 */
export const RankedBidHistorySchema = defineSchema(`${ARKIV_V2_NAMESPACE}.ranked_bids`, {
  campaignId: u64().indexed(),
  subVaultId: u64().indexed(),
  rank1Vendor: addr().indexed(),
  rank1Amount: u64(),
  rank2Vendor: addr().optional(),
  rank2Amount: u64().optional(),
  commitTimestamps: str(),
});

/**
 * 7. VendorReplacementLog Schema:
 * Immutable audit record created when a winning vendor defaults and backup vendor is activated.
 */
export const VendorReplacementLogSchema = defineSchema(`${ARKIV_V2_NAMESPACE}.vendor_replacements`, {
  campaignId: u64().indexed(),
  subVaultId: u64().indexed(),
  defaultVendor: addr().indexed(),
  replacementVendor: addr().indexed(),
  reason: str(),
  priceDeficit: u64(),
  timestamp: u64(),
});

/**
 * 8. ValidatorAssignment Schema:
 * Tracks multi-validator panel assignments, selection entropy seed, and verified quorum votes.
 */
export const ValidatorAssignmentSchema = defineSchema(`${ARKIV_V2_NAMESPACE}.validator_assignments`, {
  campaignId: u64().indexed(),
  subVaultId: u64().indexed(),
  panelValidatorAddresses: str(),
  seed: str(),
  decisionVotes: str(),
});

/**
 * Entity Expiration Policies:
 * - 90 days for bids (RankedBidHistory, ProcurementBid)
 * - 365 days for audit trails (SubCampaign, VendorReplacementLog, ValidatorAssignment)
 */
export const ARKIV_V2_EXPIRATION_POLICIES = {
  SubCampaign: ExpirationTime.fromDays(365),           // 365 days for sub-campaign audit trail
  RankedBidHistory: ExpirationTime.fromDays(90),       // 90 days for bid history
  VendorReplacementLog: ExpirationTime.fromDays(365),   // 365 days for replacement audit logs
  ValidatorAssignment: ExpirationTime.fromDays(365),    // 365 days for validator audit trails
} as const;

export const ARKIV_EXPIRATION_POLICIES = {
  // V1 Policies
  ProcurementRequest: ExpirationTime.fromDays(14),     // 14-day auction tender lifetime
  ProcurementBid: ExpirationTime.fromDays(7),          // 7-day bidding window
  DeliveryEvidence: ExpirationTime.fromDays(30),       // 30-day delivery audit retention
  ValidatorReview: ExpirationTime.fromDays(30),        // 30-day validator record
  // V2 Policies
  SubCampaign: ARKIV_V2_EXPIRATION_POLICIES.SubCampaign,
  RankedBidHistory: ARKIV_V2_EXPIRATION_POLICIES.RankedBidHistory,
  VendorReplacementLog: ARKIV_V2_EXPIRATION_POLICIES.VendorReplacementLog,
  ValidatorAssignment: ARKIV_V2_EXPIRATION_POLICIES.ValidatorAssignment,
} as const;

export const SCHEMAS_BY_TYPE = {
  // V1 Schemas
  ProcurementRequest: ProcurementRequestSchema,
  ProcurementBid: ProcurementBidSchema,
  DeliveryEvidence: DeliveryEvidenceSchema,
  ValidatorReview: ValidatorReviewSchema,
  // V2 Schemas
  SubCampaign: SubCampaignSchema,
  RankedBidHistory: RankedBidHistorySchema,
  VendorReplacementLog: VendorReplacementLogSchema,
  ValidatorAssignment: ValidatorAssignmentSchema,
} as const;

export type SupportedEntityType = keyof typeof SCHEMAS_BY_TYPE;
