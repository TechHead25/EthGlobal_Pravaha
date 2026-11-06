/**
 * @file validation.ts
 * @notice Validation rules and privacy enforcement for Arkiv entities.
 *         Ensures no PII, secrets, or malformed data are committed to the public Arkiv database.
 */

import { isAddress } from "viem";
import { ArkivEntityType } from "./types";

export const FORBIDDEN_PRIVACY_KEYWORDS = [
  "password",
  "privatekey",
  "private_key",
  "secret",
  "seed",
  "ssn",
  "passport",
  "phonenumber",
  "phone_number",
  "creditcard",
  "credit_card",
  "mnemonic",
] as const;

/**
 * Validates that an entity contains only public, non-sensitive data.
 */
export function validatePublicSuitability(data: unknown): void {
  const serialized = JSON.stringify(data).toLowerCase();
  for (const kw of FORBIDDEN_PRIVACY_KEYWORDS) {
    if (serialized.includes(kw)) {
      throw new Error(
        `PrivacyViolation: Entity contains forbidden keyword '${kw}'. Arkiv stores public/shared data only.`
      );
    }
  }
}

/**
 * Validates domain-specific fields before creating or updating an entity.
 */
export function validateEntityPayload(type: ArkivEntityType, payload: Record<string, any>): void {
  validatePublicSuitability(payload);

  if (!payload.campaignId || typeof payload.campaignId !== "number" || payload.campaignId <= 0) {
    throw new Error("InvalidCampaignId: campaignId must be a positive integer");
  }

  switch (type) {
    case "ProcurementRequest": {
      if (!payload.title || typeof payload.title !== "string" || payload.title.trim() === "") {
        throw new Error("InvalidTitle: Procurement request title cannot be empty");
      }
      if (!payload.itemCount || typeof payload.itemCount !== "number" || payload.itemCount <= 0) {
        throw new Error("InvalidItemCount: itemCount must be greater than zero");
      }
      if (!payload.budgetCeilingUSDC || typeof payload.budgetCeilingUSDC !== "number" || payload.budgetCeilingUSDC <= 0) {
        throw new Error("InvalidBudget: budgetCeilingUSDC must be greater than zero");
      }
      if (!payload.metadataCid || typeof payload.metadataCid !== "string") {
        throw new Error("InvalidMetadataCid: metadataCid is required");
      }
      break;
    }

    case "ProcurementBid": {
      if (!payload.vendorAddress || !isAddress(payload.vendorAddress)) {
        throw new Error(`InvalidVendorAddress: ${payload.vendorAddress} is not a valid Ethereum address`);
      }
      if (!payload.commitHash || typeof payload.commitHash !== "string" || !payload.commitHash.startsWith("0x")) {
        throw new Error("InvalidCommitHash: commitHash must be a valid hex string starting with 0x");
      }
      break;
    }

    case "DeliveryEvidence": {
      if (!payload.vendorAddress || !isAddress(payload.vendorAddress)) {
        throw new Error(`InvalidVendorAddress: ${payload.vendorAddress} is not a valid Ethereum address`);
      }
      if (!payload.manifestCid || typeof payload.manifestCid !== "string") {
        throw new Error("InvalidManifestCid: manifestCid is required");
      }
      if (!payload.waybillNumber || typeof payload.waybillNumber !== "string") {
        throw new Error("InvalidWaybill: waybillNumber is required");
      }
      break;
    }

    case "ValidatorReview": {
      if (!payload.validatorAddress || !isAddress(payload.validatorAddress)) {
        throw new Error(`InvalidValidatorAddress: ${payload.validatorAddress} is not a valid Ethereum address`);
      }
      if (payload.decision !== "APPROVE" && payload.decision !== "REJECT") {
        throw new Error("InvalidDecision: decision must be strictly 'APPROVE' or 'REJECT'");
      }
      break;
    }

    default:
      throw new Error(`UnsupportedEntityType: Unknown entity type '${type}'`);
  }
}

/**
 * Verifies that the caller's address matches the entity's owner.
 */
export function verifyOwnership(entityOwner: string, callerAddress: string): boolean {
  if (!entityOwner || !callerAddress) return false;
  return entityOwner.toLowerCase() === callerAddress.toLowerCase();
}
