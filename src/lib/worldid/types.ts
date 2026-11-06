/**
 * @file types.ts
 * @notice Type definitions for World ID verification payload, status codes, and responses.
 */

export type WorldIdVerificationLevel = "orb" | "device";

export type WorldIdVerificationStatus = "verified" | "rejected" | "verification-unavailable";

export type WorldIdErrorCode =
  | "INVALID_PAYLOAD"
  | "INVALID_PROOF"
  | "ALREADY_VERIFIED"
  | "ACTION_MISMATCH"
  | "APP_ID_MISMATCH"
  | "VERIFICATION_LEVEL_TOO_LOW"
  | "CONFIGURATION_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

export interface WorldIdProofPayload {
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
  verification_level?: WorldIdVerificationLevel;
  action?: string;
  signal?: string;
}

export interface WorldIdVerifyRequestBody {
  proof?: WorldIdProofPayload | string;
  merkle_root?: string;
  nullifier_hash?: string;
  verification_level?: WorldIdVerificationLevel;
  action?: string;
  signal?: string;
}

export interface WorldIdVerificationResponse {
  success: boolean;
  status: WorldIdVerificationStatus;
  nullifier_hash?: string;
  action?: string;
  verification_level?: WorldIdVerificationLevel;
  error_code?: WorldIdErrorCode;
  error_message?: string;
  upstream_code?: string;
  timestamp: string;
}

export interface WorldIdUpstreamResponse {
  success?: boolean;
  code?: string;
  detail?: string;
  attribute?: string | null;
  nullifier_hash?: string;
}

export interface INullifierStore {
  has(action: string, nullifierHash: string): Promise<boolean> | boolean;
  add(action: string, nullifierHash: string): Promise<void> | void;
  clear(): Promise<void> | void;
}
