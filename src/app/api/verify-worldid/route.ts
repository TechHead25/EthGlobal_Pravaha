import { NextRequest, NextResponse } from "next/server";
import { worldIdVerifier } from "../../../lib/worldid/verifier";
import { WorldIdProofPayload, WorldIdVerifyRequestBody } from "../../../lib/worldid/types";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(req: NextRequest) {
  try {
    let body: WorldIdVerifyRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          status: "rejected",
          error_code: "INVALID_PAYLOAD",
          error_message: "Invalid or malformed JSON in request body.",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          status: "rejected",
          error_code: "INVALID_PAYLOAD",
          error_message: "Request body must be a JSON object.",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // Normalize proof payload whether submitted nested under `proof` or flattened
    let payload: WorldIdProofPayload;

    if (body.proof && typeof body.proof === "object") {
      // Nested format from IDKit widget: { proof: { merkle_root, nullifier_hash, proof, verification_level }, action, signal }
      payload = {
        merkle_root: body.proof.merkle_root,
        nullifier_hash: body.proof.nullifier_hash,
        proof: body.proof.proof,
        verification_level: body.proof.verification_level || body.verification_level,
        action: body.action || body.proof.action,
        signal: body.signal || body.proof.signal,
      };
    } else {
      // Flat format: { merkle_root, nullifier_hash, proof: "0x...", verification_level, action, signal }
      payload = {
        merkle_root: body.merkle_root || "",
        nullifier_hash: body.nullifier_hash || "",
        proof: typeof body.proof === "string" ? body.proof : "",
        verification_level: body.verification_level,
        action: body.action,
        signal: body.signal,
      };
    }

    // Require essential proof parameters
    if (!payload.merkle_root || !payload.nullifier_hash || !payload.proof) {
      return NextResponse.json(
        {
          success: false,
          status: "rejected",
          error_code: "INVALID_PAYLOAD",
          error_message:
            "Missing required cryptographic parameters: 'merkle_root', 'nullifier_hash', and 'proof' must all be provided.",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // Perform zero-knowledge proof verification
    const verificationResult = await worldIdVerifier.verifyProof(
      payload,
      body.action,
      body.signal
    );

    if (!verificationResult.success) {
      let httpStatus = 400;
      if (verificationResult.error_code === "ALREADY_VERIFIED") {
        httpStatus = 409; // Conflict
      } else if (
        verificationResult.error_code === "SERVICE_UNAVAILABLE" ||
        verificationResult.error_code === "CONFIGURATION_ERROR"
      ) {
        httpStatus = 503; // Service Unavailable
      } else if (verificationResult.error_code === "UNAUTHORIZED") {
        httpStatus = 401; // Unauthorized
      }

      return NextResponse.json(verificationResult, {
        status: httpStatus,
        headers: SECURITY_HEADERS,
      });
    }

    return NextResponse.json(verificationResult, {
      status: 200,
      headers: SECURITY_HEADERS,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        status: "verification-unavailable",
        error_code: "INTERNAL_ERROR",
        error_message: error.message || "An unexpected error occurred during verification.",
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}
