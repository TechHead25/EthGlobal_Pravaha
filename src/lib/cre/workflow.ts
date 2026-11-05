/**
 * @file workflow.ts
 * @notice Chainlink Runtime Environment (CRE) Delivery Evidence Verification Workflow.
 */

export interface CreWorkflowInput {
  campaignId: number;
  vendorAddress: string;
  manifestCid: string;
  carrierName: string;
  waybillNumber: string;
  claimedItemCount: number;
  targetRegion: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

export interface CreVerificationResult {
  campaignId: number;
  manifestCid: string;
  isVerified: boolean;
  confidenceScore: number; // 0 - 100
  checks: {
    manifestIntegrity: boolean;
    carrierDeliveryConfirmed: boolean;
    itemCountSatisfied: boolean;
    geoCoordinatesInZone: boolean;
  };
  attestationDigest: string;
  timestamp: number;
  recommendation: "APPROVE_FOR_HUMAN_REVIEW" | "REJECT_ANOMALOUS_EVIDENCE";
  reason: string;
}

export class ChainlinkCreWorkflow {
  private allowedRegions = ["Flood Zone 4", "District Delta", "Disaster Sector A"];

  public async execute(input: CreWorkflowInput): Promise<CreVerificationResult> {
    const timestamp = Math.floor(Date.now() / 1000);

    const manifestIntegrity = Boolean(input.manifestCid && input.manifestCid.startsWith("bafy"));
    const carrierDeliveryConfirmed = this.verifyCarrierWaybill(input.carrierName, input.waybillNumber);
    const itemCountSatisfied = input.claimedItemCount >= 500;

    const geoCoordinatesInZone =
      input.coordinates.latitude >= 14.0 &&
      input.coordinates.latitude <= 15.5 &&
      input.coordinates.longitude >= 120.0 &&
      input.coordinates.longitude <= 122.0 &&
      this.allowedRegions.some((r) => input.targetRegion.includes(r));

    const allPassed = manifestIntegrity && carrierDeliveryConfirmed && itemCountSatisfied && geoCoordinatesInZone;

    let score = 0;
    if (manifestIntegrity) score += 25;
    if (carrierDeliveryConfirmed) score += 35;
    if (itemCountSatisfied) score += 20;
    if (geoCoordinatesInZone) score += 20;

    const attestationDigest = `cre_attest_${input.campaignId}_${input.manifestCid.slice(0, 10)}_${timestamp}`;

    let reason = "All automated carrier and delivery evidence checks passed.";
    let recommendation: CreVerificationResult["recommendation"] = "APPROVE_FOR_HUMAN_REVIEW";

    if (!allPassed) {
      recommendation = "REJECT_ANOMALOUS_EVIDENCE";
      const failures: string[] = [];
      if (!manifestIntegrity) failures.push("Malformed IPFS CID");
      if (!carrierDeliveryConfirmed) failures.push("Carrier tracking status unconfirmed");
      if (!itemCountSatisfied) failures.push(`Insufficient item count (${input.claimedItemCount} < 500)`);
      if (!geoCoordinatesInZone) failures.push("GPS coordinates outside designated disaster relief perimeter");
      reason = `Evidence check failed: ${failures.join("; ")}`;
    }

    return {
      campaignId: input.campaignId,
      manifestCid: input.manifestCid,
      isVerified: allPassed,
      confidenceScore: score,
      checks: {
        manifestIntegrity,
        carrierDeliveryConfirmed,
        itemCountSatisfied,
        geoCoordinatesInZone,
      },
      attestationDigest,
      timestamp,
      recommendation,
      reason,
    };
  }

  private verifyCarrierWaybill(carrier: string, waybill: string): boolean {
    if (!carrier || !waybill) return false;
    if (waybill.startsWith("WB-") || waybill.startsWith("RELIEF-") || waybill.length >= 8) {
      return true;
    }
    return false;
  }
}

export const creWorkflow = new ChainlinkCreWorkflow();
