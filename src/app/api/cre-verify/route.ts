import { NextRequest, NextResponse } from "next/server";
import { creWorkflow, CreWorkflowInput } from "@/lib/cre/workflow";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Accept either direct CreWorkflowInput or { input, options } payload
    const input: CreWorkflowInput = body.input || body;
    const options = body.options;

    if (!input || !input.manifestCid || !input.campaignId) {
      return NextResponse.json(
        { success: false, error: "Missing required evidence parameters (campaignId, manifestCid)." },
        { status: 400 }
      );
    }

    const result = await creWorkflow.execute(input, options);

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal CRE execution error" },
      { status: 500 }
    );
  }
}
