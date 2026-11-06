/**
 * @file schemas.ts
 * @notice Zod-free deterministic runtime schemas and input sanitization for CRE workflow.
 */

import { CreCoordinates, CreWorkflowInput } from "./types";

const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const IPFS_CIDV1_PREFIX = "bafy";
const IPFS_CIDV0_PREFIX = "Qm";

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  errors: ValidationIssue[];
}

export function validateCoordinates(coords: unknown): ValidationResult<CreCoordinates> {
  const errors: ValidationIssue[] = [];

  if (!coords || typeof coords !== "object") {
    return {
      isValid: false,
      errors: [{ field: "coordinates", message: "Coordinates object is required." }],
    };
  }

  const { latitude, longitude } = coords as Record<string, unknown>;

  if (typeof latitude !== "number" || isNaN(latitude)) {
    errors.push({ field: "coordinates.latitude", message: "Latitude must be a valid number." });
  } else if (latitude < -90 || latitude > 90) {
    errors.push({ field: "coordinates.latitude", message: "Latitude must be between -90 and 90 degrees." });
  }

  if (typeof longitude !== "number" || isNaN(longitude)) {
    errors.push({ field: "coordinates.longitude", message: "Longitude must be a valid number." });
  } else if (longitude < -180 || longitude > 180) {
    errors.push({ field: "coordinates.longitude", message: "Longitude must be between -180 and 180 degrees." });
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    data: { latitude: latitude as number, longitude: longitude as number },
    errors: [],
  };
}

export function validateCreWorkflowInput(raw: unknown): ValidationResult<CreWorkflowInput> {
  const errors: ValidationIssue[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      isValid: false,
      errors: [{ field: "root", message: "Input payload must be a non-null object." }],
    };
  }

  const input = raw as Record<string, unknown>;

  // 1. Campaign ID
  if (typeof input.campaignId !== "number" || !Number.isInteger(input.campaignId) || input.campaignId <= 0) {
    errors.push({ field: "campaignId", message: "Campaign ID must be a positive integer greater than 0." });
  }

  // 2. Vendor Address
  if (typeof input.vendorAddress !== "string" || !ETH_ADDRESS_REGEX.test(input.vendorAddress.trim())) {
    errors.push({ field: "vendorAddress", message: "Vendor address must be a valid 42-character hexadecimal Ethereum address." });
  }

  // 3. Manifest CID
  if (typeof input.manifestCid !== "string" || input.manifestCid.trim().length < 46) {
    errors.push({ field: "manifestCid", message: "Manifest CID must be a non-empty IPFS content identifier (minimum 46 characters)." });
  } else {
    const trimmedCid = input.manifestCid.trim();
    if (!trimmedCid.startsWith(IPFS_CIDV1_PREFIX) && !trimmedCid.startsWith(IPFS_CIDV0_PREFIX)) {
      errors.push({ field: "manifestCid", message: "Manifest CID must be a valid canonical IPFS CID (starting with 'bafy' or 'Qm')." });
    }
  }

  // 4. Carrier Name
  if (typeof input.carrierName !== "string" || input.carrierName.trim().length === 0) {
    errors.push({ field: "carrierName", message: "Carrier name cannot be empty." });
  } else if (input.carrierName.length > 120) {
    errors.push({ field: "carrierName", message: "Carrier name exceeds maximum allowed length (120 characters)." });
  }

  // 5. Waybill Number
  if (typeof input.waybillNumber !== "string" || input.waybillNumber.trim().length < 4) {
    errors.push({ field: "waybillNumber", message: "Waybill tracking number must be at least 4 alphanumeric characters." });
  }

  // 6. Claimed Item Count
  if (typeof input.claimedItemCount !== "number" || !Number.isInteger(input.claimedItemCount) || input.claimedItemCount <= 0) {
    errors.push({ field: "claimedItemCount", message: "Claimed item count must be a positive integer greater than 0." });
  }

  // 7. Target Region
  if (typeof input.targetRegion !== "string" || input.targetRegion.trim().length === 0) {
    errors.push({ field: "targetRegion", message: "Target disaster region must be specified." });
  }

  // 8. Coordinates
  const coordResult = validateCoordinates(input.coordinates);
  if (!coordResult.isValid) {
    errors.push(...coordResult.errors);
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  const sanitized: CreWorkflowInput = {
    campaignId: input.campaignId as number,
    vendorAddress: (input.vendorAddress as string).trim().toLowerCase(),
    manifestCid: (input.manifestCid as string).trim(),
    carrierName: (input.carrierName as string).trim(),
    waybillNumber: (input.waybillNumber as string).trim(),
    claimedItemCount: input.claimedItemCount as number,
    targetRegion: (input.targetRegion as string).trim(),
    coordinates: coordResult.data!,
    requiredItemCount: typeof input.requiredItemCount === "number" ? input.requiredItemCount : undefined,
    arkivEvidenceId: typeof input.arkivEvidenceId === "string" ? input.arkivEvidenceId.trim() : undefined,
    carrierEndpointUrl: typeof input.carrierEndpointUrl === "string" ? input.carrierEndpointUrl.trim() : undefined,
  };

  return {
    isValid: true,
    data: sanitized,
    errors: [],
  };
}
