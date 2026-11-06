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
  "tax_id",
  "taxid",
  "beneficiary",
] as const;

/**
 * Validates that an entity contains only public, non-sensitive data.
 * Protects beneficiary privacy and cryptographic credentials from leakages.
 */
export function validatePublicSuitability(data: unknown): void {
  const serialized = JSON.stringify(data).toLowerCase();

  // If payload contains an explicit seed property that has 'phrase' or 'mnemonic', that is a leaked seed phrase
  if (data && typeof data === "object" && "seed" in data) {
    const seedVal = String((data as any).seed).toLowerCase();
    if (seedVal.includes("phrase") || seedVal.includes("mnemonic")) {
      throw new Error("PrivacyViolation: Entity contains forbidden keyword 'seed phrase'");
    }
  }

  // Strip allowed cryptographic randomness seed field key/value ("seed": "...")
  // so beacon entropy seeds are allowed while any seed phrase or leak in domain fields is still caught
  const strippedForSeed = serialized.replace(/\"seed\"\s*:\s*(\"[^\"]*\"|[^,}]*)/g, "");

  for (const kw of FORBIDDEN_PRIVACY_KEYWORDS) {
    const target = kw === "seed" ? strippedForSeed : serialized;
    if (target.includes(kw)) {
      throw new Error(
        `PrivacyViolation: Entity contains forbidden keyword '${kw}'. Arkiv stores public/shared data only.`
      );
    }
  }
}

/**
 * Recursively scrubs known PII properties and sensitive data fields from payloads.
 * Strips beneficiary details, national tax identifiers, private keys, passwords, and mnemonics.
 */
export function scrubPII<T>(data: T): T {
  if (data === null || typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => scrubPII(item)) as unknown as T;
  }

  const PII_PROP_REGEX = /^(beneficiary|tax_?id|ssn|tin|private_?key|password|secret|mnemonic)/i;
  const cleaned: Record<string, any> = {};

  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    if (PII_PROP_REGEX.test(key)) {
      continue; // Drop the PII field completely
    }
    cleaned[key] = scrubPII(value);
  }

  return cleaned as T;
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

    case "SubCampaign": {
      if (payload.subVaultId === undefined || typeof payload.subVaultId !== "number" || payload.subVaultId < 0) {
        throw new Error("InvalidSubVaultId: subVaultId must be a non-negative integer");
      }
      if (!payload.category || typeof payload.category !== "string" || payload.category.trim() === "") {
        throw new Error("InvalidCategory: category cannot be empty");
      }
      if (!payload.budgetCeiling || typeof payload.budgetCeiling !== "number" || payload.budgetCeiling <= 0) {
        throw new Error("InvalidBudgetCeiling: budgetCeiling must be greater than zero");
      }
      if (!payload.targetSpecifications || typeof payload.targetSpecifications !== "string" || payload.targetSpecifications.trim() === "") {
        throw new Error("InvalidTargetSpecifications: targetSpecifications cannot be empty");
      }
      if (!payload.ipfsManifestCid || typeof payload.ipfsManifestCid !== "string" || payload.ipfsManifestCid.trim() === "") {
        throw new Error("InvalidManifestCid: ipfsManifestCid is required");
      }
      break;
    }

    case "RankedBidHistory": {
      if (payload.subVaultId === undefined || typeof payload.subVaultId !== "number" || payload.subVaultId < 0) {
        throw new Error("InvalidSubVaultId: subVaultId must be a non-negative integer");
      }
      if (!payload.rank1Vendor || !isAddress(payload.rank1Vendor)) {
        throw new Error(`InvalidVendorAddress: rank1Vendor ${payload.rank1Vendor} is not a valid Ethereum address`);
      }
      if (!payload.rank1Amount || typeof payload.rank1Amount !== "number" || payload.rank1Amount <= 0) {
        throw new Error("InvalidBidAmount: rank1Amount must be greater than zero");
      }
      if (payload.rank2Vendor && !isAddress(payload.rank2Vendor)) {
        throw new Error(`InvalidVendorAddress: rank2Vendor ${payload.rank2Vendor} is not a valid Ethereum address`);
      }
      if (payload.rank2Amount !== undefined && (typeof payload.rank2Amount !== "number" || payload.rank2Amount < 0)) {
        throw new Error("InvalidBidAmount: rank2Amount must be a non-negative number");
      }
      break;
    }

    case "VendorReplacementLog": {
      if (payload.subVaultId === undefined || typeof payload.subVaultId !== "number" || payload.subVaultId < 0) {
        throw new Error("InvalidSubVaultId: subVaultId must be a non-negative integer");
      }
      if (!payload.defaultVendor || !isAddress(payload.defaultVendor)) {
        throw new Error(`InvalidVendorAddress: defaultVendor ${payload.defaultVendor} is not a valid Ethereum address`);
      }
      if (!payload.replacementVendor || !isAddress(payload.replacementVendor)) {
        throw new Error(`InvalidVendorAddress: replacementVendor ${payload.replacementVendor} is not a valid Ethereum address`);
      }
      if (!payload.reason || typeof payload.reason !== "string" || payload.reason.trim() === "") {
        throw new Error("InvalidReason: replacement reason cannot be empty");
      }
      if (payload.priceDeficit === undefined || typeof payload.priceDeficit !== "number" || payload.priceDeficit < 0) {
        throw new Error("InvalidPriceDeficit: priceDeficit must be a non-negative number");
      }
      break;
    }

    case "ValidatorAssignment": {
      if (payload.subVaultId === undefined || typeof payload.subVaultId !== "number" || payload.subVaultId < 0) {
        throw new Error("InvalidSubVaultId: subVaultId must be a non-negative integer");
      }
      if (!payload.panelValidatorAddresses) {
        throw new Error("InvalidPanelValidators: panelValidatorAddresses cannot be empty");
      }
      if (!payload.seed || typeof payload.seed !== "string" || payload.seed.trim() === "") {
        throw new Error("InvalidSeed: selection entropy seed cannot be empty");
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
