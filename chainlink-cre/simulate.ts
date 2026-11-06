/**
 * @file simulate.ts
 * @notice Multi-scenario CLI simulator for Chainlink Runtime Environment (CRE) DON execution.
 * Demonstrates BFT consensus, fault tolerance, and adversarial failure modes.
 */

import { creWorkflow, CreWorkflowInput } from "./workflow";

async function runScenario(
  title: string,
  input: CreWorkflowInput,
  options?: { nodeCount?: number; simulateFaultyNode?: boolean; requiredItemCountOverride?: number }
) {
  console.log(`\n>>> Scenario: ${title}`);
  const result = await creWorkflow.execute(input, {
    mode: "DON_SIMULATION",
    nodeCount: options?.nodeCount ?? 4,
    simulateFaultyNode: options?.simulateFaultyNode ?? false,
    requiredItemCountOverride: options?.requiredItemCountOverride,
  });

  const statusBadge = result.isVerified ? "[PASSED]" : "[REJECTED]";
  console.log(`    Status:         ${statusBadge}`);
  console.log(`    Recommendation: ${result.recommendation}`);
  console.log(`    Score:          ${result.confidenceScore} / 100`);
  console.log(`    Reason:         ${result.reason}`);
  if (result.donConsensus) {
    console.log(`    DON Consensus:  ${result.donConsensus.affirmativeVotes}/${result.donConsensus.totalNodes} nodes (${result.donConsensus.threshold} threshold required)`);
    if (result.donConsensus.dissentingNodes.length > 0) {
      console.log(`    Dissenting:     ${result.donConsensus.dissentingNodes.join(", ")}`);
    }
  }
}

async function main() {
  console.log("======================================================================");
  console.log("       Chainlink CRE Multi-Scenario DON Consensus Simulator           ");
  console.log("======================================================================");

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

  // Scenario 1: Standard Verified Delivery
  await runScenario("1. Fully Compliant Delivery (4/4 Consensus)", baseValidInput);

  // Scenario 2: Byzantine Fault Tolerance (1 Rogue Node)
  await runScenario(
    "2. Byzantine Fault Tolerance (1 faulty node injected, 3/4 consensus passes)",
    baseValidInput,
    { simulateFaultyNode: true }
  );

  // Scenario 3: Under-delivery shortage
  await runScenario("3. Under-Delivery Shortage (450 blankets < 500 required)", {
    ...baseValidInput,
    claimedItemCount: 450,
  });

  // Scenario 4: GPS Out of Perimeter
  await runScenario("4. GPS Coordinates Outside Disaster Perimeter (New York coordinates)", {
    ...baseValidInput,
    coordinates: { latitude: 40.7128, longitude: -74.006 },
  });

  // Scenario 5: Carrier Exception
  await runScenario("5. Logistics Carrier Tracking Exception / Lost Shipment", {
    ...baseValidInput,
    waybillNumber: "RELIEF-FAIL-DAMAGED-9999",
  });

  // Scenario 6: Malformed IPFS CID
  await runScenario("6. Malformed / Tampered IPFS CID", {
    ...baseValidInput,
    manifestCid: "invalid_tampered_cid_hash_string",
  });

  console.log("\n======================================================================");
  console.log(" All 6 Chainlink CRE simulation scenarios completed successfully.");
  console.log("======================================================================\n");
}

main().catch(console.error);
