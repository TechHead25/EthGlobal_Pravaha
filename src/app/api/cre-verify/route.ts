import { NextRequest, NextResponse } from "next/server";
import { creWorkflow, CreWorkflowInput } from "@/lib/cre/workflow";

export async function POST(req: NextRequest) {
  try {
    const input: CreWorkflowInput = await req.json();

    if (!input.manifestCid || !input.campaignId) {
      return NextResponse.json({ success: false, error: "Missing required evidence parameters" }, { status: 400 });
    }

    const result = await creWorkflow.execute(input);

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
