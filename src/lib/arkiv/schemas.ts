/**
 * @file schemas.ts
 * @notice Official Arkiv Schema definitions for OpenAid Protocol.
 *         Uses unique, versioned namespaces under 'openaid.v1.*' to avoid collisions.
 *         Only fields required for sorting and filtering are marked as indexed.
 */

import { defineSchema, u64, str, addr, bool, ExpirationTime } from "@arkiv-network/sdk";

export const ARKIV_NAMESPACE = "openaid.v1";

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
 * Entity Expiration Policies:
 * Arkiv entities are time-scoped. These durations reflect expected operational lifecycles.
 */
export const ARKIV_EXPIRATION_POLICIES = {
  ProcurementRequest: ExpirationTime.fromDays(14), // 14-day auction tender lifetime
  ProcurementBid: ExpirationTime.fromDays(7),       // 7-day bidding window
  DeliveryEvidence: ExpirationTime.fromDays(30),   // 30-day delivery audit retention
  ValidatorReview: ExpirationTime.fromDays(30),    // 30-day validator record
} as const;

export const SCHEMAS_BY_TYPE = {
  ProcurementRequest: ProcurementRequestSchema,
  ProcurementBid: ProcurementBidSchema,
  DeliveryEvidence: DeliveryEvidenceSchema,
  ValidatorReview: ValidatorReviewSchema,
} as const;

export type SupportedEntityType = keyof typeof SCHEMAS_BY_TYPE;
