import { expect } from "chai";
const { NextRequest } = require("next/server");
import {
  WorldIdVerifier,
  worldIdVerifier,
  isValidFieldElement,
  isValidProofString,
  MemoryNullifierStore,
  SNARK_SCALAR_FIELD,
} from "../src/lib/worldid/verifier";
import {
  WorldIdProofPayload,
  WorldIdVerificationResponse,
} from "../src/lib/worldid/types";
import { getWorldIdConfig } from "../src/lib/worldid/config";
import { POST } from "../src/app/api/verify-worldid/route";

describe("World ID Server-Side Verification Engine", () => {
  const validMerkleRoot =
    "0x1f8b4c7d2e9a6f3b0c5e8a1d4f7b2e9a6f3b0c5e8a1d4f7b2e9a6f3b0c5e8a1d";
  const validNullifierHash =
    "0x2a9e7f4c1b8d5a3e6f0c9b2e5a8d1f4b7e0c3a6d9f2e5a8b1c4d7e0a3f6b9c2e";
  const validProofString =
    "0x3b8d6f2e9a1c4b7e0a3f5c8d1e4b7a0f2c5e8b1d4a7f0e3b6c9d2a5f8e1b4c7a2b9e7f4c1b8d5a3e6f0c9b2e5a8d1f4b7e0c3a6d9f2e5a8b1c4d7e0a3f6b9c2e";

  const standardProof: WorldIdProofPayload = {
    merkle_root: validMerkleRoot,
    nullifier_hash: validNullifierHash,
    proof: validProofString,
    verification_level: "orb",
    action: "verify-human-reviewer",
    signal: "0xvalidator1_vote",
  };

  describe("1. BN254 Cryptographic Parameter Validation", () => {
    it("should accept valid 256-bit scalar field elements", () => {
      expect(isValidFieldElement(validMerkleRoot)).to.be.true;
      expect(isValidFieldElement(validNullifierHash)).to.be.true;
      expect(isValidFieldElement("0x0")).to.be.true;
      expect(isValidFieldElement("0x1")).to.be.true;
    });

    it("should reject non-hex, empty, or out-of-bounds field elements", () => {
      expect(isValidFieldElement("")).to.be.false;
      expect(isValidFieldElement("not-a-hex-value")).to.be.false;
      expect(isValidFieldElement(null)).to.be.false;
      expect(isValidFieldElement(undefined)).to.be.false;

      // Exactly equal to SNARK scalar field modulus -> invalid
      const modulusHex = "0x" + SNARK_SCALAR_FIELD.toString(16);
      expect(isValidFieldElement(modulusHex)).to.be.false;

      // Greater than SNARK scalar field modulus -> invalid
      const overflowHex = "0x" + (SNARK_SCALAR_FIELD + 1n).toString(16);
      expect(isValidFieldElement(overflowHex)).to.be.false;
    });

    it("should reject malformed proof strings", () => {
      expect(isValidProofString("")).to.be.false;
      expect(isValidProofString("short")).to.be.false;
      expect(isValidProofString(null)).to.be.false;
      expect(isValidProofString(validProofString)).to.be.true;
    });
  });

  describe("2. Server Configuration Guards", () => {
    it("should fail closed if App ID is unconfigured or set to placeholder", async () => {
      const unconfiguredVerifier = new WorldIdVerifier({
        config: {
          appId: "app_staging_placeholder",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 5000,
          minimumLevel: "orb",
        },
      });

      const res = await unconfiguredVerifier.verifyProof(standardProof);
      expect(res.success).to.be.false;
      expect(res.status).to.equal("verification-unavailable");
      expect(res.error_code).to.equal("CONFIGURATION_ERROR");
    });

    it("should fail closed if App ID is empty", async () => {
      const emptyAppVerifier = new WorldIdVerifier({
        config: {
          appId: "",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 5000,
          minimumLevel: "orb",
        },
      });

      const res = await emptyAppVerifier.verifyProof(standardProof);
      expect(res.success).to.be.false;
      expect(res.status).to.equal("verification-unavailable");
      expect(res.error_code).to.equal("CONFIGURATION_ERROR");
    });
  });

  describe("3. Upstream Verification & Payload Handling", () => {
    it("should successfully verify genuine proof when upstream returns 200 OK", async () => {
      let capturedBody: any = null;
      let capturedUrl = "";

      const mockFetch: typeof fetch = async (input, init) => {
        capturedUrl = input.toString();
        capturedBody = JSON.parse((init?.body as string) || "{}");
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const verifier = new WorldIdVerifier({
        config: {
          appId: "app_staging_test_12345",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 5000,
          minimumLevel: "orb",
        },
        fetchFn: mockFetch,
      });

      const res = await verifier.verifyProof(standardProof);
      expect(res.success).to.be.true;
      expect(res.status).to.equal("verified");
      expect(res.nullifier_hash).to.equal(validNullifierHash.toLowerCase());
      expect(capturedUrl).to.equal(
        "https://developer.worldcoin.org/api/v2/verify/app_staging_test_12345"
      );
      expect(capturedBody.action).to.equal("verify-human-reviewer");
      expect(capturedBody.signal_hash).to.be.a("string");
      expect(capturedBody.signal_hash.startsWith("0x")).to.be.true;
    });

    it("should reject proof when upstream returns 400 invalid_proof", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            code: "invalid_proof",
            detail: "The zero-knowledge proof verification failed cryptographically.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      };

      const verifier = new WorldIdVerifier({
        config: {
          appId: "app_staging_test_12345",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 5000,
          minimumLevel: "orb",
        },
        fetchFn: mockFetch,
      });

      const res = await verifier.verifyProof(standardProof);
      expect(res.success).to.be.false;
      expect(res.status).to.equal("rejected");
      expect(res.error_code).to.equal("INVALID_PROOF");
      expect(res.upstream_code).to.equal("invalid_proof");
    });

    it("should reject proofs with mismatched action context", async () => {
      const verifier = new WorldIdVerifier({
        config: {
          appId: "app_staging_test_12345",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 5000,
          minimumLevel: "orb",
        },
      });

      const mismatchedProof: WorldIdProofPayload = {
        ...standardProof,
        action: "some-unauthorized-action",
      };

      const res = await verifier.verifyProof(mismatchedProof);
      expect(res.success).to.be.false;
      expect(res.status).to.equal("rejected");
      expect(res.error_code).to.equal("ACTION_MISMATCH");
    });

    it("should reject verification when credential level is device but orb is required", async () => {
      const verifier = new WorldIdVerifier({
        config: {
          appId: "app_staging_test_12345",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 5000,
          minimumLevel: "orb",
        },
      });

      const deviceProof: WorldIdProofPayload = {
        ...standardProof,
        verification_level: "device",
      };

      const res = await verifier.verifyProof(deviceProof);
      expect(res.success).to.be.false;
      expect(res.status).to.equal("rejected");
      expect(res.error_code).to.equal("VERIFICATION_LEVEL_TOO_LOW");
    });
  });

  describe("4. Replay Prevention & Nullifier Semantics", () => {
    it("should prevent duplicate nullifier submissions for the same action", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const verifier = new WorldIdVerifier({
        config: {
          appId: "app_staging_test_12345",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 5000,
          minimumLevel: "orb",
        },
        fetchFn: mockFetch,
      });

      // First verification: should succeed
      const first = await verifier.verifyProof(standardProof);
      expect(first.success).to.be.true;

      // Second verification with identical nullifier: must be rejected locally
      const second = await verifier.verifyProof(standardProof);
      expect(second.success).to.be.false;
      expect(second.status).to.equal("rejected");
      expect(second.error_code).to.equal("ALREADY_VERIFIED");
    });

    it("should handle max_verifications_reached from upstream developer portal", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            code: "max_verifications_reached",
            detail: "This user has already verified for this action.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      };

      const verifier = new WorldIdVerifier({
        config: {
          appId: "app_staging_test_12345",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 5000,
          minimumLevel: "orb",
        },
        fetchFn: mockFetch,
      });

      const res = await verifier.verifyProof({
        ...standardProof,
        nullifier_hash: "0x2333333333333333333333333333333333333333333333333333333333333333",
      });

      expect(res.success).to.be.false;
      expect(res.status).to.equal("rejected");
      expect(res.error_code).to.equal("ALREADY_VERIFIED");
      expect(res.upstream_code).to.equal("max_verifications_reached");
    });
  });

  describe("5. Upstream Failures, Gateway Errors & Timeouts", () => {
    it("should handle upstream HTTP 500/502/503 safely without crashing", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        });
      };

      const verifier = new WorldIdVerifier({
        config: {
          appId: "app_staging_test_12345",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 5000,
          minimumLevel: "orb",
        },
        fetchFn: mockFetch,
      });

      const res = await verifier.verifyProof(standardProof);
      expect(res.success).to.be.false;
      expect(res.status).to.equal("verification-unavailable");
      expect(res.error_code).to.equal("SERVICE_UNAVAILABLE");
    });

    it("should handle non-JSON responses (HTML gateway error) safely", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response("<html><head><title>502 Bad Gateway</title></head></html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        });
      };

      const verifier = new WorldIdVerifier({
        config: {
          appId: "app_staging_test_12345",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 5000,
          minimumLevel: "orb",
        },
        fetchFn: mockFetch,
      });

      const res = await verifier.verifyProof(standardProof);
      expect(res.success).to.be.false;
      expect(res.status).to.equal("verification-unavailable");
      expect(res.error_code).to.equal("SERVICE_UNAVAILABLE");
    });

    it("should handle upstream timeout and fail closed (never turning timeout into verified)", async () => {
      const mockFetch: typeof fetch = async (_input, init) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              const abortErr = new Error("This operation was aborted");
              abortErr.name = "AbortError";
              reject(abortErr);
            });
          }
        });
      };

      const fastTimeoutVerifier = new WorldIdVerifier({
        config: {
          appId: "app_staging_test_12345",
          action: "verify-human-reviewer",
          apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
          timeoutMs: 50, // Short timeout for test
          minimumLevel: "orb",
        },
        fetchFn: mockFetch,
      });

      const res = await fastTimeoutVerifier.verifyProof(standardProof);
      expect(res.success).to.be.false;
      expect(res.status).to.equal("verification-unavailable");
      expect(res.error_code).to.equal("SERVICE_UNAVAILABLE");
      expect(res.error_message).to.include("timed out");
    });
  });

  describe("6. API Route Integration (POST /api/verify-worldid)", () => {
    beforeEach(() => {
      // Configure global verifier for test route execution
      worldIdVerifier.setConfig({
        appId: "app_staging_route_test",
        action: "verify-human-reviewer",
        apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
        timeoutMs: 3000,
        minimumLevel: "orb",
      });
      worldIdVerifier.resetTestNullifiers();
    });

    it("should reject malformed non-JSON requests with 400 Bad Request", async () => {
      const req = new NextRequest("http://localhost:3000/api/verify-worldid", {
        method: "POST",
        body: "invalid-raw-text",
      });

      const res = await POST(req);
      expect(res.status).to.equal(400);

      const body = await res.json();
      expect(body.success).to.be.false;
      expect(body.status).to.equal("rejected");
      expect(body.error_code).to.equal("INVALID_PAYLOAD");
    });

    it("should reject requests missing required cryptographic fields", async () => {
      const req = new NextRequest("http://localhost:3000/api/verify-worldid", {
        method: "POST",
        body: JSON.stringify({
          action: "verify-human-reviewer",
        }),
      });

      const res = await POST(req);
      expect(res.status).to.equal(400);

      const body = await res.json();
      expect(body.success).to.be.false;
      expect(body.error_code).to.equal("INVALID_PAYLOAD");
    });

    it("should reject client-side forged 'success: true' claims", async () => {
      // A malicious client tries to send success: true with dummy proof
      const req = new NextRequest("http://localhost:3000/api/verify-worldid", {
        method: "POST",
        body: JSON.stringify({
          success: true,
          status: "verified",
          merkle_root: validMerkleRoot,
          nullifier_hash: validNullifierHash,
          proof: "0x_invalid_fake_proof",
          action: "verify-human-reviewer",
        }),
      });

      const res = await POST(req);
      // Because app_staging_route_test is not real on network, it fails closed (503 or 400)
      expect(res.status).to.be.oneOf([400, 503]);
      const body = await res.json();
      expect(body.success).to.be.false;
    });

    it("should return 200 OK with verified status for valid nested IDKit payload", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
      worldIdVerifier.setFetchFn(mockFetch);

      const req = new NextRequest("http://localhost:3000/api/verify-worldid", {
        method: "POST",
        body: JSON.stringify({
          proof: {
            merkle_root: validMerkleRoot,
            nullifier_hash: validNullifierHash,
            proof: validProofString,
            verification_level: "orb",
          },
          action: "verify-human-reviewer",
          signal: "0xvalidator1_vote",
        }),
      });

      const res = await POST(req);
      expect(res.status).to.equal(200);

      const body = await res.json();
      expect(body.success).to.be.true;
      expect(body.status).to.equal("verified");
      expect(body.nullifier_hash).to.equal(validNullifierHash.toLowerCase());
      expect(body.action).to.equal("verify-human-reviewer");
      expect(body.timestamp).to.be.a("string");
    });

    it("should return 200 OK with verified status for valid flat payload", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
      worldIdVerifier.setFetchFn(mockFetch);

      const uniqueNullifier =
        "0x1111111111111111111111111111111111111111111111111111111111111111";

      const req = new NextRequest("http://localhost:3000/api/verify-worldid", {
        method: "POST",
        body: JSON.stringify({
          merkle_root: validMerkleRoot,
          nullifier_hash: uniqueNullifier,
          proof: validProofString,
          verification_level: "orb",
          action: "verify-human-reviewer",
          signal: "0xvalidator_attestation_signal",
        }),
      });

      const res = await POST(req);
      expect(res.status).to.equal(200);

      const body = await res.json();
      expect(body.success).to.be.true;
      expect(body.status).to.equal("verified");
    });

    it("should return 409 Conflict when a replay attack occurs on the API route", async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
      worldIdVerifier.setFetchFn(mockFetch);

      const replayNullifier =
        "0x2222222222222222222222222222222222222222222222222222222222222222";

      const req1 = new NextRequest("http://localhost:3000/api/verify-worldid", {
        method: "POST",
        body: JSON.stringify({
          merkle_root: validMerkleRoot,
          nullifier_hash: replayNullifier,
          proof: validProofString,
          action: "verify-human-reviewer",
        }),
      });

      const res1 = await POST(req1);
      expect(res1.status).to.equal(200);

      // Second attempt with same nullifier
      const req2 = new NextRequest("http://localhost:3000/api/verify-worldid", {
        method: "POST",
        body: JSON.stringify({
          merkle_root: validMerkleRoot,
          nullifier_hash: replayNullifier,
          proof: validProofString,
          action: "verify-human-reviewer",
        }),
      });

      const res2 = await POST(req2);
      expect(res2.status).to.equal(409);

      const body2 = await res2.json();
      expect(body2.success).to.be.false;
      expect(body2.status).to.equal("rejected");
      expect(body2.error_code).to.equal("ALREADY_VERIFIED");
    });

    it("should return 503 Service Unavailable when upstream times out", async () => {
      const mockFetch: typeof fetch = async () => {
        const timeoutErr = new Error("The operation was aborted due to timeout");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      };
      worldIdVerifier.setFetchFn(mockFetch);

      const req = new NextRequest("http://localhost:3000/api/verify-worldid", {
        method: "POST",
        body: JSON.stringify({
          merkle_root: validMerkleRoot,
          nullifier_hash: "0x1234567812345678123456781234567812345678123456781234567812345678",
          proof: validProofString,
          action: "verify-human-reviewer",
        }),
      });

      const res = await POST(req);
      expect(res.status).to.equal(503);

      const body = await res.json();
      expect(body.success).to.be.false;
      expect(body.status).to.equal("verification-unavailable");
      expect(body.error_code).to.equal("SERVICE_UNAVAILABLE");
    });

    it("should set anti-caching and security headers on responses", async () => {
      const req = new NextRequest("http://localhost:3000/api/verify-worldid", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.headers.get("Cache-Control")).to.include("no-store");
      expect(res.headers.get("X-Content-Type-Options")).to.equal("nosniff");
    });
  });
});
