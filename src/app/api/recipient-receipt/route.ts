import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "../../../server/rate-limit";
import {
  isValidFieldElement,
  isValidProofString,
  worldIdVerifier,
} from "../../../lib/worldid/verifier";
import { WorldIdProofPayload } from "../../../lib/worldid/types";
import {
  computeRecipientReceiptAction,
  computeSubCampaignId,
  recipientReceiptStore,
} from "../../../lib/worldid/recipient-receipt";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(req: NextRequest) {
  const rl = rateLimit(`recipient-receipt:${clientIp(req.headers)}`, 30, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  try {
    let body: any;
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

    const { campaignId, subVaultId, deliveryManifestCid } = body;

    if (
      campaignId === undefined ||
      campaignId === null ||
      subVaultId === undefined ||
      subVaultId === null ||
      !deliveryManifestCid ||
      typeof deliveryManifestCid !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          status: "rejected",
          error_code: "INVALID_PAYLOAD",
          error_message:
            "Missing required campaign context: 'campaignId', 'subVaultId', and 'deliveryManifestCid' are mandatory.",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // Extract proof payload from either nested or flat format
    let payload: WorldIdProofPayload;
    if (body.proof && typeof body.proof === "object") {
      payload = {
        merkle_root: body.proof.merkle_root || body.merkle_root || "",
        nullifier_hash: body.proof.nullifier_hash || body.nullifier_hash || "",
        proof: body.proof.proof || "",
        verification_level: body.proof.verification_level || body.verification_level || "orb",
        action: body.proof.action || body.action,
        signal: body.proof.signal || body.signal,
      };
    } else {
      payload = {
        merkle_root: body.merkle_root || "",
        nullifier_hash: body.nullifier_hash || "",
        proof: typeof body.proof === "string" ? body.proof : "",
        verification_level: body.verification_level || "orb",
        action: body.action,
        signal: body.signal,
      };
    }

    // 1. Parameter completeness check
    if (!payload.merkle_root || !payload.nullifier_hash || !payload.proof) {
      return NextResponse.json(
        {
          success: false,
          status: "rejected",
          error_code: "INVALID_PAYLOAD",
          error_message:
            "Missing required cryptographic parameters: 'merkle_root', 'nullifier_hash', and 'proof' are required.",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // 2. Validate BN254 scalar field elements
    if (!isValidFieldElement(payload.merkle_root)) {
      return NextResponse.json(
        {
          success: false,
          status: "rejected",
          error_code: "INVALID_PAYLOAD",
          error_message: "Invalid 'merkle_root': Must be a valid 256-bit scalar field element in BN254.",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    if (!isValidFieldElement(payload.nullifier_hash)) {
      return NextResponse.json(
        {
          success: false,
          status: "rejected",
          error_code: "INVALID_PAYLOAD",
          error_message: "Invalid 'nullifier_hash': Must be a valid 256-bit scalar field element in BN254.",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    if (!isValidProofString(payload.proof)) {
      return NextResponse.json(
        {
          success: false,
          status: "rejected",
          error_code: "INVALID_PAYLOAD",
          error_message: "Invalid 'proof': Must be a non-empty cryptographic proof string.",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    // 3. Action computation: action = keccak256(campaignId, subVaultId, deliveryManifestCid)
    const expectedAction = computeRecipientReceiptAction(
      campaignId,
      subVaultId,
      deliveryManifestCid
    );

    if (payload.action && payload.action.trim().toLowerCase() !== expectedAction.toLowerCase()) {
      return NextResponse.json(
        {
          success: false,
          status: "rejected",
          error_code: "ACTION_MISMATCH",
          error_message: `Proof action mismatch: Expected '${expectedAction}', got '${payload.action}'.`,
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers: SECURITY_HEADERS }
      );
    }

    const normalizedNullifier = payload.nullifier_hash.trim().toLowerCase();
    const subCampaignId = computeSubCampaignId(campaignId, subVaultId);

    // 4. Anti-Replay: check if nullifier was already consumed for this specific actionId
    if (recipientReceiptStore.hasActionNullifier(expectedAction, normalizedNullifier)) {
      return NextResponse.json(
        {
          success: false,
          status: "rejected",
          error_code: "ALREADY_VERIFIED",
          error_message:
            "Replay attack detected: This unique World ID identity has already submitted a receipt for this sub-campaign action.",
          nullifier_hash: normalizedNullifier,
          action: expectedAction,
          subCampaignId,
          timestamp: new Date().toISOString(),
        },
        { status: 409, headers: SECURITY_HEADERS }
      );
    }

    // 5. Semaphore ZK-SNARK verification through World ID verifier
    const currentConfig = worldIdVerifier.getConfig();
    if (!currentConfig.appId || !currentConfig.appId.startsWith("app_")) {
      worldIdVerifier.setConfig({
        ...currentConfig,
        appId: "app_staging_openaid_receipts",
      });
    }

    const verifyResult = await worldIdVerifier.verifyProof(
      payload,
      expectedAction,
      payload.signal
    );

    if (!verifyResult.success) {
      const statusCode = verifyResult.error_code === "ALREADY_VERIFIED" ? 409 : 400;
      return NextResponse.json(
        {
          success: false,
          status: verifyResult.status,
          error_code: verifyResult.error_code,
          error_message: verifyResult.error_message,
          timestamp: new Date().toISOString(),
        },
        { status: statusCode, headers: SECURITY_HEADERS }
      );
    }

    // 6. Decoupled Record: Set HasReceived(subCampaignId, nullifier) = true
    // Provides evidence to human validators; strictly does NOT trigger direct on-chain payout.
    recipientReceiptStore.recordReceipt({
      campaignId: String(campaignId),
      subVaultId: String(subVaultId),
      subCampaignId,
      deliveryManifestCid,
      actionId: expectedAction,
      nullifierHash: normalizedNullifier,
      verificationLevel: payload.verification_level === "device" ? "device" : "orb",
      timestamp: Math.floor(Date.now() / 1000),
    });

    return NextResponse.json(
      {
        success: true,
        status: "verified",
        actionId: expectedAction,
        subCampaignId,
        nullifier_hash: normalizedNullifier,
        hasReceived: true,
        isDecoupledFromPayout: true,
        receiptCount: recipientReceiptStore.getReceiptCount(subCampaignId),
        message:
          "Recipient delivery receipt confirmed. Recorded as evidence for human validator panel; does not release on-chain funds directly.",
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: SECURITY_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        status: "error",
        error_code: "INTERNAL_ERROR",
        error_message: error?.message || "Internal receipt verification error.",
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers: SECURITY_HEADERS }
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaignId");
  const subVaultId = url.searchParams.get("subVaultId");
  const nullifier = url.searchParams.get("nullifier");

  if (!campaignId || !subVaultId) {
    return NextResponse.json(
      { success: false, error: "Missing campaignId or subVaultId query parameters." },
      { status: 400, headers: SECURITY_HEADERS }
    );
  }

  const subCampaignId = computeSubCampaignId(campaignId, subVaultId);
  const totalCount = recipientReceiptStore.getReceiptCount(subCampaignId);

  let hasReceived = false;
  if (nullifier) {
    hasReceived = recipientReceiptStore.hasReceived(subCampaignId, nullifier);
  }

  return NextResponse.json(
    {
      success: true,
      subCampaignId,
      totalCount,
      hasReceived: nullifier ? hasReceived : totalCount > 0,
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: SECURITY_HEADERS }
  );
}
