import { NextRequest, NextResponse } from "next/server";
import { worldIdVerifier } from "@/lib/worldid/verifier";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { proof, action, signal } = body;

    if (!proof) {
      return NextResponse.json(
        { success: false, error_code: "INVALID_PROOF", error_message: "Proof payload missing" },
        { status: 400 }
      );
    }

    const verificationResult = await worldIdVerifier.verifyProof(proof, action || "verify-human-reviewer");

    if (!verificationResult.success) {
      return NextResponse.json(verificationResult, { status: 400 });
    }

    return NextResponse.json(verificationResult, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error_code: "INTERNAL_ERROR", error_message: error.message },
      { status: 500 }
    );
  }
}
