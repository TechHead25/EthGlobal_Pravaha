import { expect } from "chai";
import { creWorkflow, CreWorkflowInput } from "../chainlink-cre/workflow";

describe("Chainlink CRE Delivery Evidence Verification Workflow", () => {
  const baseValidInput: CreWorkflowInput = {
    campaignId: 1,
    vendorAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    manifestCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    carrierName: "Regional Humanitarian Freight Logistics",
    waybillNumber: "RELIEF-BLANKETS-2026-0042",
    claimedItemCount: 500,
    targetRegion: "Flood Zone 4",
    coordinates: {
      latitude: 14.5995,
      longitude: 120.9842,
    },
  };

  it("should successfully verify delivery evidence with 100/100 confidence", async () => {
    const result = await creWorkflow.execute(baseValidInput);

    expect(result.isVerified).to.be.true;
    expect(result.confidenceScore).to.equal(100);
    expect(result.recommendation).to.equal("APPROVE_FOR_HUMAN_REVIEW");
    expect(result.checks.manifestIntegrity).to.be.true;
    expect(result.checks.carrierDeliveryConfirmed).to.be.true;
    expect(result.checks.itemCountSatisfied).to.be.true;
    expect(result.checks.geoCoordinatesInZone).to.be.true;
    expect(result.attestationDigest).to.include("cre_attest_1");
  });

  it("should fail verification if item count is less than campaign requirement (500 blankets)", async () => {
    const insufficientInput: CreWorkflowInput = {
      ...baseValidInput,
      claimedItemCount: 450, // Shortage: only 450 blankets
    };

    const result = await creWorkflow.execute(insufficientInput);

    expect(result.isVerified).to.be.false;
    expect(result.checks.itemCountSatisfied).to.be.false;
    expect(result.recommendation).to.equal("REJECT_ANOMALOUS_EVIDENCE");
    expect(result.reason).to.include("Insufficient item count");
  });

  it("should fail verification if GPS coordinates are outside the disaster relief zone", async () => {
    const outOfBoundsInput: CreWorkflowInput = {
      ...baseValidInput,
      coordinates: {
        latitude: 40.7128, // New York coordinates instead of target flood zone
        longitude: -74.006,
      },
    };

    const result = await creWorkflow.execute(outOfBoundsInput);

    expect(result.isVerified).to.be.false;
    expect(result.checks.geoCoordinatesInZone).to.be.false;
    expect(result.recommendation).to.equal("REJECT_ANOMALOUS_EVIDENCE");
  });

  it("should fail verification if manifest CID is invalid or malformed", async () => {
    const malformedCidInput: CreWorkflowInput = {
      ...baseValidInput,
      manifestCid: "invalid_random_string",
    };

    const result = await creWorkflow.execute(malformedCidInput);

    expect(result.isVerified).to.be.false;
    expect(result.checks.manifestIntegrity).to.be.false;
  });
});
