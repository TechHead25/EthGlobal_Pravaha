import { NextRequest, NextResponse } from "next/server";
import { arkiv } from "@/lib/arkiv/adapter";
import { getArkivServerWalletClient } from "@/lib/arkiv/config";
import { ArkivEntityType } from "@/lib/arkiv/types";
import { validateEntityPayload, validatePublicSuitability } from "@/lib/arkiv/validation";
import { Hex } from "viem";

/**
 * GET /api/arkiv
 * Public read endpoint for querying time-scoped, wallet-owned entities from Arkiv Rabdi testnet.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") as ArkivEntityType) || undefined;
    const status = searchParams.get("status") || undefined;
    const owner = searchParams.get("owner") || undefined;
    const activeOnly = searchParams.get("activeOnly") === "true";
    const campaignId = searchParams.get("campaignId") ? parseInt(searchParams.get("campaignId")!, 10) : undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : undefined;

    const entities = await arkiv.queryEntities({
      type,
      status,
      owner,
      activeOnly,
      campaignId,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      network: "rabdi",
      count: entities.length,
      entities,
    });
  } catch (error: any) {
    console.error("Arkiv query API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to query Arkiv Network",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/arkiv
 * Server-assisted entity creation.
 * Security: Requires an explicit ARKIV_SERVER_SIGNER_KEY when executing server-side writes.
 * Client browser writes should preferably be signed directly by the user's wallet.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, payload } = body;

    if (!type || !payload) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: 'type' and 'payload'" },
        { status: 400 }
      );
    }

    validateEntityPayload(type, payload);

    const serverKey = process.env.ARKIV_SERVER_SIGNER_KEY as Hex | undefined;

    // In mock mode or when testing without real funds
    if (process.env.ARKIV_MOCK_MODE === "true" || !serverKey) {
      if (!serverKey && process.env.NODE_ENV === "production") {
        return NextResponse.json(
          {
            success: false,
            error:
              "Server-side signing key (ARKIV_SERVER_SIGNER_KEY) is not configured. Writes must be signed directly by the client's Web3 wallet.",
          },
          { status: 403 }
        );
      }

      // Use local adapter mock write
      const created = await arkiv.createEntityWithWallet(null, type, payload);
      return NextResponse.json({ success: true, entity: created, mode: "mock" });
    }

    const walletClient = getArkivServerWalletClient(serverKey);
    const created = await arkiv.createEntityWithWallet(walletClient, type, payload);

    return NextResponse.json({ success: true, entity: created, mode: "network" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

/**
 * PATCH /api/arkiv
 * Server-assisted entity update.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, type, updates } = body;

    if (!id || !type || !updates) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: 'id', 'type', or 'updates'" },
        { status: 400 }
      );
    }

    validatePublicSuitability(updates);

    const serverKey = process.env.ARKIV_SERVER_SIGNER_KEY as Hex | undefined;

    if (process.env.ARKIV_MOCK_MODE === "true" || !serverKey) {
      const updated = await arkiv.patchEntityWithWallet(null, type, id, updates);
      return NextResponse.json({ success: true, entity: updated, mode: "mock" });
    }

    const walletClient = getArkivServerWalletClient(serverKey);
    const updated = await arkiv.patchEntityWithWallet(walletClient, type, id, updates);

    return NextResponse.json({ success: true, entity: updated, mode: "network" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
