import { NextRequest, NextResponse } from "next/server";
import { vendorTrustEngine, VendorDeliveryHistory } from "@/lib/trust/engine";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vendorAddress = searchParams.get("vendorAddress");

    if (!vendorAddress) {
      return NextResponse.json(
        { success: false, error: "Query parameter 'vendorAddress' is required." },
        { status: 400 }
      );
    }

    const trust = vendorTrustEngine.getVendorTrust(vendorAddress);

    return NextResponse.json({
      success: true,
      trust,
      explanation: trust.explanation,
      qualifies: trust.qualifies,
      minThreshold: trust.minThreshold,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to retrieve vendor trust score." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vendorAddress, history, record, action } = body;

    if (!vendorAddress) {
      return NextResponse.json(
        { success: false, error: "Field 'vendorAddress' is required." },
        { status: 400 }
      );
    }

    // Direct score calculation from provided history fixture
    if (history) {
      const trust = vendorTrustEngine.calculateTrustScore({
        ...history,
        vendorAddress,
      } as VendorDeliveryHistory);

      return NextResponse.json({
        success: true,
        trust,
        explanation: trust.explanation,
        qualifies: trust.qualifies,
      });
    }

    // Record delivery event
    if (action === "recordDelivery" && record) {
      const trust = vendorTrustEngine.recordDelivery(vendorAddress, record);
      return NextResponse.json({ success: true, trust });
    }

    // Record dispute event
    if (action === "recordDispute") {
      const trust = vendorTrustEngine.recordDispute(vendorAddress);
      return NextResponse.json({ success: true, trust });
    }

    // Default: fetch from memory
    const trust = vendorTrustEngine.getVendorTrust(vendorAddress);
    return NextResponse.json({ success: true, trust });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Internal vendor trust processing error." },
      { status: 500 }
    );
  }
}
