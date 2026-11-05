/**
 * @file runner.ts
 * @notice CLI runner to execute and simulate the Chainlink CRE delivery verification workflow.
 */

import { creWorkflow, CreWorkflowInput } from "./workflow";

async function main() {
  console.log("=== Chainlink Runtime Environment (CRE) Workflow Simulation ===");

  const sampleInput: CreWorkflowInput = {
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

  console.log("1. Ingesting Delivery Evidence Reference:", sampleInput.manifestCid);
  console.log("2. Executing Off-Chain DON Checks (Carrier API, GPS Boundaries, Item Count)...");

  const result = await creWorkflow.execute(sampleInput);

  console.log("\n=== Workflow Execution Result ===");
  console.log(`Status: ${result.isVerified ? "VERIFIED" : "FAILED"}`);
  console.log(`Confidence Score: ${result.confidenceScore}/100`);
  console.log(`Recommendation: ${result.recommendation}`);
  console.log(`Attestation Digest: ${result.attestationDigest}`);
  console.log(`Reason: ${result.reason}`);
  console.log("Checks Breakdown:", JSON.stringify(result.checks, null, 2));

  console.log("\n[Notice] CRE authority is strictly bounded: This attestation serves as verified input for human validators and does not bypass the on-chain 3-of-5 quorum.");
}

main().catch(console.error);
