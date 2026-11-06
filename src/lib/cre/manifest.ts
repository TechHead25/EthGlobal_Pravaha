/**
 * @file manifest.ts
 * @notice Delivery manifest and IPFS content identifier validation.
 */

const CIDV1_BASE32_REGEX = /^bafy[a-z0-9]{45,70}$/i;
const CIDV0_BASE58_REGEX = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;

export interface ManifestVerificationResult {
  isValid: boolean;
  cidVersion: "CIDv1" | "CIDv0" | "UNKNOWN";
  canonicalCid: string;
  reason: string;
  arkivLinked: boolean;
}

export class ManifestValidator {
  public verifyManifest(manifestCid: string, arkivEvidenceId?: string): ManifestVerificationResult {
    if (!manifestCid || typeof manifestCid !== "string") {
      return {
        isValid: false,
        cidVersion: "UNKNOWN",
        canonicalCid: "",
        reason: "Manifest CID is missing or not a string.",
        arkivLinked: false,
      };
    }

    const trimmed = manifestCid.trim();

    if (CIDV1_BASE32_REGEX.test(trimmed)) {
      return {
        isValid: true,
        cidVersion: "CIDv1",
        canonicalCid: trimmed,
        reason: "Valid IPFS CIDv1 base32 identifier.",
        arkivLinked: Boolean(arkivEvidenceId && arkivEvidenceId.length > 5),
      };
    }

    if (CIDV0_BASE58_REGEX.test(trimmed)) {
      return {
        isValid: true,
        cidVersion: "CIDv0",
        canonicalCid: trimmed,
        reason: "Valid IPFS CIDv0 base58 identifier.",
        arkivLinked: Boolean(arkivEvidenceId && arkivEvidenceId.length > 5),
      };
    }

    // Fallback: If starts with bafy and has reasonable length
    if (trimmed.startsWith("bafy") && trimmed.length >= 46 && /^[a-zA-Z0-9]+$/.test(trimmed)) {
      return {
        isValid: true,
        cidVersion: "CIDv1",
        canonicalCid: trimmed,
        reason: "Valid IPFS CIDv1 identifier.",
        arkivLinked: Boolean(arkivEvidenceId && arkivEvidenceId.length > 5),
      };
    }

    return {
      isValid: false,
      cidVersion: "UNKNOWN",
      canonicalCid: trimmed,
      reason: "Malformed IPFS CID: Does not conform to canonical CIDv0 (Qm...) or CIDv1 (bafy...) encoding.",
      arkivLinked: false,
    };
  }
}

export const manifestValidator = new ManifestValidator();
