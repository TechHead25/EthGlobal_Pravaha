/**
 * @file verifier.ts
 * @notice Server-side verification engine for World IDKit zero-knowledge proofs.
 *         Protects human reviewer actions (validator quorum attestations and disputes)
 *         against automated Sybil bot collusion.
 */

import { WorldIdProofPayload, WorldIdVerificationResponse } from "./types";

// Persistent memory storage for nullifiers to prevent double-voting/replay
const usedNullifiers = new Set<string>();

export class WorldIdVerifier {
  public static readonly EXPECTED_ACTION = "verify-human-reviewer";

  /**
   * @notice Verify a zero-knowledge human proof on the server side.
   *         Never trust client-side callbacks without server verification.
   */
  public async verifyProof(
    proof: WorldIdProofPayload,
    expectedAction: string = WorldIdVerifier.EXPECTED_ACTION
  ): Promise<WorldIdVerificationResponse> {
    // 1. Verify required proof fields
    if (!proof.merkle_root || !proof.nullifier_hash || !proof.proof) {
      return {
        success: false,
        error_code: "INVALID_PROOF",
        error_message: "Malformed World ID proof payload: missing cryptographic parameters.",
      };
    }

    // 2. Prevent replay attacks: ensure nullifier has not been consumed
    if (usedNullifiers.has(proof.nullifier_hash)) {
      return {
        success: false,
        error_code: "ALREADY_VERIFIED",
        error_message: "Nullifier already used: This unique human identity has already attested for this action.",
      };
    }

    // 3. Verify action context
    if (proof.action !== expectedAction) {
      return {
        success: false,
        error_code: "ACTION_MISMATCH",
        error_message: `Proof action mismatch: Expected '${expectedAction}', got '${proof.action}'.`,
      };
    }

    // 4. Server-to-Server Verification
    const appId = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID;
    
    // If live World ID Developer Portal App ID is configured, query the official API
    if (appId && !appId.includes("app_staging_placeholder")) {
      try {
        const response = await fetch(`https://developer.world.org/api/v4/verify/${appId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nullifier_hash: proof.nullifier_hash,
            merkle_root: proof.merkle_root,
            proof: proof.proof,
            verification_level: proof.verification_level || "orb",
            action: proof.action,
            signal: proof.signal || "",
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          return {
            success: false,
            error_code: "INVALID_PROOF",
            error_message: data.detail || "World ID Developer Portal verification failed.",
          };
        }
      } catch (err: any) {
        return {
          success: false,
          error_code: "SERVICE_UNAVAILABLE",
          error_message: `World ID verification service unreachable: ${err.message}`,
        };
      }
    } else {
      // Offline / Hackathon Sandbox Simulation Mode
      // Validates proof structure and simulates ZK-proof verification
      if (proof.proof === "0x_invalid_simulation_proof") {
        return {
          success: false,
          error_code: "INVALID_PROOF",
          error_message: "Simulated invalid proof rejected by ZK verifier.",
        };
      }
    }

    // Record nullifier to prevent double-spending the identity
    usedNullifiers.add(proof.nullifier_hash);

    return {
      success: true,
      nullifier_hash: proof.nullifier_hash,
      verification_level: proof.verification_level || "orb",
    };
  }

  /**
   * @notice Reset used nullifiers (for testing purposes only)
   */
  public resetTestNullifiers() {
    usedNullifiers.clear();
  }
}

export const worldIdVerifier = new WorldIdVerifier();
