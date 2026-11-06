/**
 * @file seed-arkiv.ts
 * @notice Re-runnable data import / seed script for Arkiv Network (Rabdi Testnet).
 *         Fulfills ETHGlobal Mumbai Arkiv partner track qualification criteria:
 *         "Include your data import script in the repository so it can be re-run".
 */

import { arkiv } from "../src/lib/arkiv/adapter";
import { getArkivServerWalletClient } from "../src/lib/arkiv/config";
import { ARKIV_CONFIG } from "../src/lib/arkiv/config";

async function main() {
  console.log("==========================================================");
  console.log("   OpenAid Protocol — Arkiv Rabdi Testnet Data Seed");
  console.log("==========================================================");
  console.log(`Network: ${ARKIV_CONFIG.network} (Chain ID: ${ARKIV_CONFIG.chainId})`);
  console.log(`RPC Endpoint: ${ARKIV_CONFIG.rpcUrl}`);
  console.log(`Explorer: ${ARKIV_CONFIG.explorerUrl}`);
  console.log("----------------------------------------------------------\n");

  const signerKey = process.env.ARKIV_SERVER_SIGNER_KEY;
  const walletClient = signerKey && signerKey.startsWith("0x")
    ? getArkivServerWalletClient(signerKey as any)
    : undefined;
  const isLive = Boolean(walletClient);
  console.log(`Mode: ${isLive ? "LIVE Rabdi Testnet Wallet Transaction" : "Deterministic Adapter Seed Mode"}`);

  // 1. Seed Humanitarian Procurement Tender (openaid.v1.requests)
  console.log("\n[1/4] Seeding Humanitarian Procurement Tender (openaid.v1.requests)...");
  const requestPayload = {
    campaignId: 1,
    title: "500 Thermal Relief Blankets for Flood Zone 4 Displaced Communities",
    status: "Funding",
    targetRegion: "Flood Zone 4",
    itemCategory: "Emergency Shelter",
    itemCount: 500,
    itemUnit: "blankets",
    budgetCeilingUSDC: 10000,
    metadataCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    owner: "0x1111111111111111111111111111111111111111",
  };
  const request = await arkiv.createEntityWithWallet(walletClient, "ProcurementRequest", requestPayload);
  console.log(`  ✓ Created Request Entity: ${request.id}`);
  console.log(`    Explorer Link: ${ARKIV_CONFIG.explorerUrl}/entity/${request.id}`);

  // 2. Seed Vendor Procurement Bid (openaid.v1.bids)
  console.log("\n[2/4] Seeding Vendor Auction Bid (openaid.v1.bids)...");
  const bidPayload = {
    campaignId: 1,
    vendorAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    status: "Revealed",
    commitHash: "0x4f8b2e1a3c5d7e9f0b2a4c6e8d1f3b5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d",
    revealedBidUSDC: 8500,
    owner: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  };
  const bid = await arkiv.createEntityWithWallet(walletClient, "ProcurementBid", bidPayload);
  console.log(`  ✓ Created Bid Entity: ${bid.id}`);
  console.log(`    Explorer Link: ${ARKIV_CONFIG.explorerUrl}/entity/${bid.id}`);

  // 3. Seed Verified Delivery Evidence (openaid.v1.evidence)
  console.log("\n[3/4] Seeding Logistics Delivery Evidence (openaid.v1.evidence)...");
  const evidencePayload = {
    campaignId: 1,
    vendorAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    carrierName: "Regional Humanitarian Freight Logistics",
    waybillNumber: "RELIEF-BLANKETS-2026-0042",
    manifestCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    packageCount: 50,
    verifiedItemCount: 500,
    owner: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  };
  const evidence = await arkiv.createEntityWithWallet(walletClient, "DeliveryEvidence", evidencePayload);
  console.log(`  ✓ Created Evidence Entity: ${evidence.id}`);
  console.log(`    Explorer Link: ${ARKIV_CONFIG.explorerUrl}/entity/${evidence.id}`);

  // 4. Seed World ID-Verified Validator Review (openaid.v1.reviews)
  console.log("\n[4/4] Seeding World ID-Verified Validator Review (openaid.v1.reviews)...");
  const reviewPayload = {
    campaignId: 1,
    validatorAddress: "0x8888888888888888888888888888888888888888",
    decision: "APPROVE",
    humanVerified: true,
    notes: "Chainlink CRE automated carrier tracking (DELIVERED) and spatial geofence polygon verified. Physical manifest photos inspected and verified.",
    owner: "0x8888888888888888888888888888888888888888",
  };
  const review = await arkiv.createEntityWithWallet(walletClient, "ValidatorReview", reviewPayload);
  console.log(`  ✓ Created Review Entity: ${review.id}`);
  console.log(`    Explorer Link: ${ARKIV_CONFIG.explorerUrl}/entity/${review.id}`);

  console.log("\n----------------------------------------------------------");
  console.log("✓ Arkiv Network data seeding completed successfully.");
  console.log("==========================================================");
}

main().catch((err) => {
  console.error("Arkiv seed error:", err);
  process.exit(1);
});
