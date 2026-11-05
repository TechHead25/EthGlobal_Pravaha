import { NextRequest, NextResponse } from "next/server";
import { arkiv } from "@/lib/arkiv/adapter";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") as any;
    const status = searchParams.get("status") || undefined;
    const activeOnly = searchParams.get("activeOnly") === "true";
    const campaignId = searchParams.get("campaignId") ? parseInt(searchParams.get("campaignId")!) : undefined;

    const entities = await arkiv.queryEntities({
      type,
      status,
      activeOnly,
      campaignId,
    });

    return NextResponse.json({ success: true, count: entities.length, entities });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { entity, callerAddress } = body;

    if (!entity || !callerAddress) {
      return NextResponse.json({ success: false, error: "Missing entity or callerAddress" }, { status: 400 });
    }

    const created = await arkiv.createEntity(entity, callerAddress);
    return NextResponse.json({ success: true, entity: created });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, updates, callerAddress } = body;

    if (!id || !updates || !callerAddress) {
      return NextResponse.json({ success: false, error: "Missing id, updates, or callerAddress" }, { status: 400 });
    }

    const updated = await arkiv.updateEntity(id, updates, callerAddress);
    return NextResponse.json({ success: true, entity: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
