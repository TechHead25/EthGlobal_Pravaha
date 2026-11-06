import { NextRequest, NextResponse } from "next/server";
import { geminiExtractor, ExtractedInvoice, DocumentInput } from "@/lib/ai/gemini";
import { specComparator, ProcurementSpec } from "@/lib/ai/comparator";
import { vendorTrustEngine } from "@/lib/trust/engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      document,
      spec,
      waybillNumber,
      manifestHash,
      campaignId,
      vendorAddress,
      mockOverride,
    } = body;

    // 1. Proof-of-Work Deduplication Check (HTTP 409 on duplicate)
    if (waybillNumber && manifestHash) {
      const dedupCheck = vendorTrustEngine.checkAndRegisterProof(
        waybillNumber,
        manifestHash,
        {
          campaignId: campaignId || spec?.campaignId || 1,
          vendorAddress: vendorAddress || spec?.vendorAddress || "0x0000000000000000000000000000000000000000",
        }
      );

      if (!dedupCheck.success) {
        return NextResponse.json(
          {
            success: false,
            verified: false,
            error: dedupCheck.error,
            statusCode: 409,
          },
          { status: 409 }
        );
      }
    }

    // 2. Document Extraction with Google Gemini (Fails closed)
    if (!document && !mockOverride?.data) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          error: "AI extraction failure: No document provided for inspection.",
        },
        { status: 400 }
      );
    }

    const extractionResult = await geminiExtractor.extractInvoice(
      document,
      mockOverride
    );

    if (!extractionResult.verified || !extractionResult.data) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          error: extractionResult.error || "AI extraction failure",
        },
        { status: 422 }
      );
    }

    const extractedInvoice: ExtractedInvoice = extractionResult.data;

    // 3. Automated Spec Comparison (if procurement spec provided)
    let comparisonResult = null;
    if (spec && Array.isArray(spec.items) && typeof spec.winningBidAmount === "number") {
      comparisonResult = specComparator.compare(extractedInvoice, spec as ProcurementSpec);
    }

    return NextResponse.json({
      success: true,
      verified: true,
      invoice: extractedInvoice,
      comparison: comparisonResult,
      rawResponse: extractionResult.rawResponse,
    });
  } catch (error: any) {
    // Fail closed
    return NextResponse.json(
      {
        success: false,
        verified: false,
        error: `AI extraction failure: ${error?.message || "Internal server error"}`,
      },
      { status: 500 }
    );
  }
}
