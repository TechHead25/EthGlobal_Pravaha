import { expect } from "chai";
import { worldIdVerifier, WorldIdVerifier } from "../src/lib/worldid/verifier";
import { WorldIdProofPayload } from "../src/lib/worldid/types";

describe("World IDKit Server-Side Verification Engine", () => {
  beforeEach(() => {
    worldIdVerifier.resetTestNullifiers();
  });

  const validProof: WorldIdProofPayload = {
    merkle_root: "0x1f8b4c7d2e9a6f3b0c5e8a1d4f7b2e9a6f3b0c5e8a1d4f7b2e9a6f3b0c5e8a1d",
    nullifier_hash: "0x2a9e7f4c1b8d5a3e6f0c9b2e5a8d1f4b7e0c3a6d9f2e5a8b1c4d7e0a3f6b9c2e",
    proof: "0x3b8d6f2e9a1c4b7e0a3f5c8d1e4b7a0f2c5e8b1d4a7f0e3b6c9d2a5f8e1b4c7a",
    verification_level: "orb",
    action: "verify-human-reviewer",
    signal: "0xvalidator1_vote",
  };

  it("should successfully verify a valid human reviewer proof", async () => {
    const result = await worldIdVerifier.verifyProof(validProof);
    expect(result.success).to.be.true;
    expect(result.nullifier_hash).to.equal(validProof.nullifier_hash);
  });

  it("should prevent nullifier reuse (double-voting Sybil attack)", async () => {
    const firstResult = await worldIdVerifier.verifyProof(validProof);
    expect(firstResult.success).to.be.true;

    // Second attempt with identical nullifier must be rejected
    const secondResult = await worldIdVerifier.verifyProof(validProof);
    expect(secondResult.success).to.be.false;
    expect(secondResult.error_code).to.equal("ALREADY_VERIFIED");
  });

  it("should reject proofs with mismatched action context", async () => {
    const mismatchedActionProof: WorldIdProofPayload = {
      ...validProof,
      nullifier_hash: "0x_unique_nullifier_999",
      action: "unauthorized-action-context",
    };

    const result = await worldIdVerifier.verifyProof(mismatchedActionProof);
    expect(result.success).to.be.false;
    expect(result.error_code).to.equal("ACTION_MISMATCH");
  });

  it("should reject malformed proofs missing cryptographic root parameters", async () => {
    const malformedProof: any = {
      action: "verify-human-reviewer",
      verification_level: "orb",
    };

    const result = await worldIdVerifier.verifyProof(malformedProof);
    expect(result.success).to.be.false;
    expect(result.error_code).to.equal("INVALID_PROOF");
  });

  it("should reject simulated invalid proofs", async () => {
    const invalidSimProof: WorldIdProofPayload = {
      ...validProof,
      nullifier_hash: "0x_unique_nullifier_invalid",
      proof: "0x_invalid_simulation_proof",
    };

    const result = await worldIdVerifier.verifyProof(invalidSimProof);
    expect(result.success).to.be.false;
    expect(result.error_code).to.equal("INVALID_PROOF");
  });
});
