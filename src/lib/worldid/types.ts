/**
 * @file types.ts
 * @notice Type definitions for World IDKit verification payload and responses.
 */

export interface WorldIdProofPayload {
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
  verification_level: "orb" | "device";
  action: string;
  signal?: string;
}

export interface WorldIdVerificationResponse {
  success: boolean;
  nullifier_hash?: string;
  verification_level?: "orb" | "device";
  error_code?: "INVALID_PROOF" | "ALREADY_VERIFIED" | "ACTION_MISMATCH" | "SERVICE_UNAVAILABLE" | "USER_CANCELLED";
  error_message?: string;
}
