import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "../../../server/rate-limit";
import { creWorkflow, CreWorkflowInput } from "@/lib/cre/workflow";

export async function POST(req: NextRequest) {
  const rl = rateLimit(`cre:${clientIp(req.headers)}`, 30, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds), "Cache-Control": "no-store" } });
  }
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
      { success: false, error: "Internal CRE execution error" },
      { status: 500 }
    );
  }
}
