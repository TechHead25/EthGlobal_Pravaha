/**
 * @file verifier.ts
 * @notice Server-side verification engine for World ID zero-knowledge proofs.
 *         Protects human reviewer actions (validator quorum attestations, challenges)
 *         against automated Sybil attacks using Semaphore ZK-SNARK verification.
 */

import { hashToField } from "@worldcoin/idkit-core/hashing";
import {
  WorldIdProofPayload,
  WorldIdVerificationResponse,
  WorldIdVerificationLevel,
  INullifierStore,
  WorldIdUpstreamResponse,
} from "./types";
import {
  WorldIdConfig,
  getWorldIdConfig,
  isWorldIdConfigured,
} from "./config";

/**
 * BN254 / Alt_bn128 scalar field size (r).
 * Semaphore roots and nullifiers are field elements modulo this prime.
 */
export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Validates that a string is a valid field element within [0, SNARK_SCALAR_FIELD).
 */
export function isValidFieldElement(val: unknown): boolean {
  if (typeof val !== "string" || !val.trim()) return false;
  const trimmed = val.trim();
  try {
    const big = BigInt(trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed : `0x${trimmed}`);
    return big >= 0n && big < SNARK_SCALAR_FIELD;
  } catch {
    return false;
  }
}

/**
 * Validates that proof is a non-empty string.
 */
export function isValidProofString(proof: unknown): boolean {
  if (typeof proof !== "string") return false;
  const trimmed = proof.trim();
  return trimmed.length > 10;
}

/**
 * In-memory action-scoped nullifier store.
 * Replay protection tracks nullifiers bound to the specific action.
 */
export class MemoryNullifierStore implements INullifierStore {
  private nullifiers = new Set<string>();

  private key(action: string, nullifierHash: string): string {
    return `${action}:${nullifierHash.trim().toLowerCase()}`;
  }

  public has(action: string, nullifierHash: string): boolean {
    return this.nullifiers.has(this.key(action, nullifierHash));
  }

  public add(action: string, nullifierHash: string): void {
    this.nullifiers.add(this.key(action, nullifierHash));
  }

  public clear(): void {
    this.nullifiers.clear();
  }
}

export interface VerifierOptions {
  config?: WorldIdConfig;
  nullifierStore?: INullifierStore;
  fetchFn?: typeof fetch;
}

export class WorldIdVerifier {
  private config: WorldIdConfig;
  private nullifierStore: INullifierStore;
  private fetchFn: typeof fetch;

  constructor(options?: VerifierOptions) {
    this.config = options?.config ?? getWorldIdConfig();
    this.nullifierStore = options?.nullifierStore ?? new MemoryNullifierStore();
    this.fetchFn = options?.fetchFn ?? fetch;
  }

  /**
   * Return the active configuration.
   */
  public getConfig(): WorldIdConfig {
    return this.config;
  }

  /**
   * Update configuration dynamically (useful in tests or hot reloads).
   */
  public setConfig(config: WorldIdConfig): void {
    this.config = config;
  }

  /**
   * Set custom fetch implementation (useful in unit testing).
   */
  public setFetchFn(fetchFn: typeof fetch): void {
    this.fetchFn = fetchFn;
  }

  /**
   * Reset the nullifier store (strictly for testing).
   */
  public async resetTestNullifiers(): Promise<void> {
    await this.nullifierStore.clear();
  }

  /**
   * Server-side zero-knowledge proof verification.
   * Fails closed: Never simulates success if upstream check fails or config is missing.
   *
   * @param payload Cryptographic proof payload received from client
   * @param overrideAction Optional action context override
   * @param overrideSignal Optional signal context override
   */
  public async verifyProof(
    payload: WorldIdProofPayload,
    overrideAction?: string,
    overrideSignal?: string
  ): Promise<WorldIdVerificationResponse> {
    const timestamp = new Date().toISOString();

    // 1. Basic payload existence checks
    if (!payload || typeof payload !== "object") {
      return {
        success: false,
        status: "rejected",
        error_code: "INVALID_PAYLOAD",
        error_message: "Missing or malformed proof payload object.",
        timestamp,
      };
    }

    const { merkle_root, nullifier_hash, proof } = payload;

    // 2. Cryptographic parameter format validation (BN254 scalar field bounds)
    if (!isValidFieldElement(merkle_root)) {
      return {
        success: false,
        status: "rejected",
        error_code: "INVALID_PAYLOAD",
        error_message:
          "Invalid 'merkle_root': Must be a valid 256-bit scalar field element in BN254.",
        timestamp,
      };
    }

    if (!isValidFieldElement(nullifier_hash)) {
      return {
        success: false,
        status: "rejected",
        error_code: "INVALID_PAYLOAD",
        error_message:
          "Invalid 'nullifier_hash': Must be a valid 256-bit scalar field element in BN254.",
        timestamp,
      };
    }

    if (!isValidProofString(proof)) {
      return {
        success: false,
        status: "rejected",
        error_code: "INVALID_PAYLOAD",
        error_message: "Invalid 'proof': Must be a non-empty cryptographic proof string.",
        timestamp,
      };
    }

    // 3. Action Context Binding
    const expectedAction = (overrideAction || this.config.action).trim();
    const payloadAction = (payload.action || expectedAction).trim();

    if (payloadAction !== expectedAction) {
      return {
        success: false,
        status: "rejected",
        error_code: "ACTION_MISMATCH",
        error_message: `Proof action mismatch: Expected '${expectedAction}', got '${payloadAction}'.`,
        timestamp,
      };
    }

    // 4. Verification Level Validation
    const verificationLevel: WorldIdVerificationLevel =
      payload.verification_level === "device" ? "device" : "orb";

    if (this.config.minimumLevel === "orb" && verificationLevel === "device") {
      return {
        success: false,
        status: "rejected",
        error_code: "VERIFICATION_LEVEL_TOO_LOW",
        error_message:
          "Verification level 'device' is insufficient. Protocol requires 'orb' biometric proof.",
        timestamp,
      };
    }

    // 5. Replay Protection: Check if nullifier has already been consumed for this action
    const normalizedNullifier = nullifier_hash.trim().toLowerCase();
    const alreadyConsumed = await this.nullifierStore.has(expectedAction, normalizedNullifier);
    if (alreadyConsumed) {
      return {
        success: false,
        status: "rejected",
        error_code: "ALREADY_VERIFIED",
        error_message:
          "Nullifier already consumed: This unique human identity has already attested for this action.",
        nullifier_hash: normalizedNullifier,
        action: expectedAction,
        timestamp,
      };
    }

    // 6. Server Configuration Validation
    if (!isWorldIdConfigured(this.config)) {
      return {
        success: false,
        status: "verification-unavailable",
        error_code: "CONFIGURATION_ERROR",
        error_message:
          "World ID App ID is not configured on the server. Live or staging World ID App ID required.",
        timestamp,
      };
    }

    // 7. Compute signal hash according to World ID protocol standard
    const signal = overrideSignal ?? payload.signal ?? "";
    let signalHash: string;
    try {
      signalHash = hashToField(signal).digest;
    } catch {
      signalHash = hashToField("").digest;
    }

    // 8. Upstream Server-to-Server Verification
    const endpoint = `${this.config.apiBaseUrl.replace(/\/+$/, "")}/${this.config.appId}`;

    let controller: AbortController | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller?.abort(), this.config.timeoutMs);

      const response = await this.fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "OpenAidProtocol/1.0",
          ...(process.env.WORLD_ID_SIGNER_KEY || process.env.WORLD_ID_API_KEY ? { Authorization: `Bearer ${process.env.WORLD_ID_SIGNER_KEY || process.env.WORLD_ID_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          merkle_root: payload.merkle_root,
          nullifier_hash: payload.nullifier_hash,
          proof: payload.proof,
          verification_level: verificationLevel,
          action: expectedAction,
          signal_hash: signalHash,
        }),
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      let data: WorldIdUpstreamResponse = {};
      try {
        const text = await response.text();
        if (text) {
          data = JSON.parse(text);
        }
      } catch {
        // Response body was not JSON (e.g. HTML gateway error)
        data = { success: false, detail: "Malformed non-JSON response from upstream service." };
      }

      if (response.ok && data.success !== false) {
        // Record nullifier to prevent double-spending the identity
        await this.nullifierStore.add(expectedAction, normalizedNullifier);

        return {
          success: true,
          status: "verified",
          nullifier_hash: normalizedNullifier,
          action: expectedAction,
          verification_level: verificationLevel,
          timestamp,
        };
      }

      // Upstream rejected proof (HTTP 4xx or explicit failure)
      if (response.status === 400 || !response.ok) {
        const upstreamCode = data.code || "";
        const detail = data.detail || "World ID verification rejected by upstream service.";

        if (upstreamCode === "max_verifications_reached") {
          return {
            success: false,
            status: "rejected",
            error_code: "ALREADY_VERIFIED",
            error_message: detail,
            upstream_code: upstreamCode,
            timestamp,
          };
        }

        if (upstreamCode === "invalid_action") {
          return {
            success: false,
            status: "rejected",
            error_code: "ACTION_MISMATCH",
            error_message: detail,
            upstream_code: upstreamCode,
            timestamp,
          };
        }

        if (response.status >= 500) {
          return {
            success: false,
            status: "verification-unavailable",
            error_code: "SERVICE_UNAVAILABLE",
            error_message: `Upstream World ID service error: HTTP ${response.status}`,
            upstream_code: upstreamCode,
            timestamp,
          };
        }

        return {
          success: false,
          status: "rejected",
          error_code: "INVALID_PROOF",
          error_message: detail,
          upstream_code: upstreamCode,
          timestamp,
        };
      }

      return {
        success: false,
        status: "rejected",
        error_code: "INVALID_PROOF",
        error_message: data.detail || "World ID verification failed.",
        timestamp,
      };
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);

      const isTimeout =
        err.name === "AbortError" ||
        err.name === "TimeoutError" ||
        err.message?.toLowerCase().includes("timeout") ||
        err.message?.toLowerCase().includes("aborted");

      return {
        success: false,
        status: "verification-unavailable",
        error_code: "SERVICE_UNAVAILABLE",
        error_message: isTimeout
          ? `World ID verification timed out after ${this.config.timeoutMs}ms.`
          : `World ID verification service unreachable: ${err.message}`,
        timestamp,
      };
    }
  }
}

export const worldIdVerifier = new WorldIdVerifier();
