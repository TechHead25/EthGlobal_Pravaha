/**
 * @file runner.ts
 * @notice CLI runner to execute and verify the Chainlink CRE delivery verification workflow.
 */

import { creWorkflow, CreWorkflowInput } from "./workflow";

async function main() {
  console.log("======================================================================");
  console.log("       Chainlink Runtime Environment (CRE) Workflow Execution         ");
  console.log("             OpenAid Protocol — Delivery Evidence Oracle              ");
  console.log("======================================================================\n");

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
    arkivEvidenceId: "openaid.v1.evidence:1:bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  };

  console.log("[1] Trigger Event Ingested:");
  console.log(`    Campaign ID: #${sampleInput.campaignId}`);
  console.log(`    Vendor:      ${sampleInput.vendorAddress}`);
  console.log(`    Manifest:    ${sampleInput.manifestCid}`);
  console.log(`    Carrier:     ${sampleInput.carrierName} (Waybill: ${sampleInput.waybillNumber})`);
  console.log(`    Items:       ${sampleInput.claimedItemCount} units`);
  console.log(`    Perimeter:   ${sampleInput.targetRegion} [${sampleInput.coordinates.latitude}, ${sampleInput.coordinates.longitude}]`);
  console.log(`    Arkiv Ref:   ${sampleInput.arkivEvidenceId}`);

  console.log("\n[2] Executing Decentralized Oracle Network (DON) Multi-Node Verification...");
  const startTime = Date.now();
  const result = await creWorkflow.execute(sampleInput, {
    mode: "DON_SIMULATION",
    nodeCount: 4,
    simulateFaultyNode: false,
  });
  const durationMs = Date.now() - startTime;

  console.log("\n======================================================================");
  console.log("                      CRE Consensus Report                            ");
  console.log("======================================================================");
  console.log(`Execution Mode:     ${result.executionMode}`);
  console.log(`Workflow Status:    ${result.isVerified ? "VERIFIED (SUCCESS)" : "FAILED (REJECTED)"}`);
  console.log(`Confidence Score:   ${result.confidenceScore} / 100`);
  console.log(`Recommendation:     ${result.recommendation}`);
  console.log(`Attestation Digest: ${result.attestationDigest}`);
  console.log(`Duration:           ${durationMs}ms`);
  console.log(`Summary Reason:     ${result.reason}`);

  console.log("\n--- Capability Verification Matrix ---");
  console.log(` [${result.checks.manifestIntegrity ? "PASS" : "FAIL"}] IPFS Manifest CID Format & Multihash Integrity`);
  console.log(` [${result.checks.carrierDeliveryConfirmed ? "PASS" : "FAIL"}] Logistics Carrier Tracking Gateway (Status: ${result.carrierDetails?.status || "UNKNOWN"})`);
  console.log(` [${result.checks.itemCountSatisfied ? "PASS" : "FAIL"}] Minimum Item Quantity Requirement`);
  console.log(` [${result.checks.geoCoordinatesInZone ? "PASS" : "FAIL"}] Spatial GPS Geofence (Zone: ${result.geofenceDetails?.matchedZone}, Dist: ${result.geofenceDetails?.distanceKmFromCenter}km)`);
  console.log(` [${result.checks.donConsensusReached ? "PASS" : "FAIL"}] Multi-Node DON Consensus (${result.donConsensus?.affirmativeVotes}/${result.donConsensus?.totalNodes} nodes affirmative)`);

  console.log("\n======================================================================");
  console.log(" [PROTOCOL TRUST BOUNDARY NOTICE]");
  console.log(" CRE authority is strictly BOUNDED ADVISORY: This attestation serves as");
  console.log(" cryptographically verified input for the on-chain Validator Portal.");
  console.log(" It CANNOT unilaterally trigger settlement or bypass the 3-of-5 human");
  console.log(" validator quorum enforced by OpenAidEscrow.sol on Arc Testnet.");
  console.log("======================================================================\n");
}

main().catch(console.error);
