/**
 * @file validator-selection.test.ts
 * @notice Comprehensive unit tests for:
 *   1. Dynamic Validator Panel Selection (Efraimidis-Spirakis weighted sampling, conflict filtering, alternate replacement)
 *   2. Binary World ID Recipient Receipt (BN254 Semaphore proof validation, action binding, anti-replay, decoupled state)
 *   3. Chainlink CRE to Gemini Handshake (4-node DON BFT consensus: carrier, geofence, Gemini invoice, World ID receipt)
 */

import { expect } from "chai";
const { NextRequest } = require("next/server");
import {
  DEFAULT_VALIDATOR_POOL,
  computeSelectionSeed,
  isValidatorConflicted,
  selectValidatorPanel,
  replaceValidator,
  RegisteredValidator,
} from "../src/lib/validator/selection";
import {
  computeRecipientReceiptAction,
  computeSubCampaignId,
  recipientReceiptStore,
} from "../src/lib/worldid/recipient-receipt";
import {
  worldIdVerifier,
  SNARK_SCALAR_FIELD,
} from "../src/lib/worldid/verifier";
import { POST as recipientReceiptPOST, GET as recipientReceiptGET } from "../src/app/api/recipient-receipt/route";
import { creWorkflow, CreWorkflowInput } from "../src/lib/cre/workflow";
import { donConsensusEngine } from "../src/lib/cre/don";

describe("OpenAid Protocol V2: Validator Panel, Recipient Receipt & CRE Handshake", () => {
  // Test Fixtures
  const validMerkleRoot =
    "0x1f8b4c7d2e9a6f3b0c5e8a1d4f7b2e9a6f3b0c5e8a1d4f7b2e9a6f3b0c5e8a1d";
  const validNullifierHash =
    "0x2a9e7f4c1b8d5a3e6f0c9b2e5a8d1f4b7e0c3a6d9f2e5a8b1c4d7e0a3f6b9c2e";
  const validProofString =
    "0x3b8d6f2e9a1c4b7e0a3f5c8d1e4b7a0f2c5e8b1d4a7f0e3b6c9d2a5f8e1b4c7a2b9e7f4c1b8d5a3e6f0c9b2e5a8d1f4b7e0c3a6d9f2e5a8b1c4d7e0a3f6b9c2e";
  const testManifestCid =
    "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

  beforeEach(async () => {
    // Reset stores and mock fetch before each test
    recipientReceiptStore.clear();
    worldIdVerifier.setConfig({
      appId: "app_staging_test_openaid",
      action: "verify-recipient-receipt",
      apiBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
      timeoutMs: 3000,
      minimumLevel: "orb",
    });
    await worldIdVerifier.resetTestNullifiers();

    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    worldIdVerifier.setFetchFn(mockFetch);
  });

  // =========================================================================
  // 1. DYNAMIC VALIDATOR PANEL SELECTION (Efraimidis-Spirakis Sampling)
  // =========================================================================
  describe("1. Dynamic Validator Panel Selection (src/lib/validator/selection.ts)", () => {
    it("should maintain a pool of 12-15 registered, World ID-verified validators", () => {
      expect(DEFAULT_VALIDATOR_POOL.length).to.be.at.least(12);
      expect(DEFAULT_VALIDATOR_POOL.length).to.be.at.most(15);

      for (const val of DEFAULT_VALIDATOR_POOL) {
        expect(val.id).to.be.a("string").and.not.empty;
        expect(val.address).to.match(/^0x[a-fA-F0-9]{40}$/);
        expect(val.name).to.be.a("string").and.not.empty;
        expect(val.score).to.be.within(1, 100);
        expect(val.isWorldIdVerified).to.be.true;
        expect(val.isActive).to.be.true;
      }
    });

    it("should compute deterministic selection seeds from prevrandao, campaignId, and subVaultId", () => {
      const seed1 = computeSelectionSeed("0xabc", 1, 1);
      const seed2 = computeSelectionSeed("0xabc", 1, 1);
      const seedDiffSubVault = computeSelectionSeed("0xabc", 1, 2);
      const seedDiffCampaign = computeSelectionSeed("0xabc", 2, 1);

      expect(seed1).to.equal(seed2);
      expect(seed1).to.not.equal(seedDiffSubVault);
      expect(seed1).to.not.equal(seedDiffCampaign);
    });

    it("should draw a panel of exactly 5 distinct, unconflicted validators and 3 alternates", () => {
      const ngoAddress = "0xNGO1111111111111111111111111111111111111";
      const biddingVendors = ["0xVENDOR2222222222222222222222222222222222"];

      const result = selectValidatorPanel({
        campaignId: 1,
        subVaultId: 1,
        ngoAddress,
        biddingVendors,
      });

      // Panel must contain exactly 5 validators
      expect(result.panel).to.have.lengthOf(5);
      // Alternates must contain exactly 3 validators
      expect(result.alternates).to.have.lengthOf(3);

      // Check distinctness: no duplicates in panel
      const panelIds = new Set(result.panel.map((v) => v.id));
      expect(panelIds.size).to.equal(5);

      // No intersection between panel and alternates
      const alternateIds = new Set(result.alternates.map((v) => v.id));
      for (const altId of alternateIds) {
        expect(panelIds.has(altId)).to.be.false;
      }

      // Check weights are capped at min(score, 80)
      for (const val of result.allSampled) {
        expect(val.weight).to.be.at.most(80);
        expect(val.weight).to.equal(Math.min(val.score, 80));
        expect(val.u_i).to.be.within(0, 1);
        expect(val.key).to.be.within(0, 1);
      }

      // Check key order: sampled list is sorted in descending key order
      for (let i = 1; i < result.allSampled.length; i++) {
        expect(result.allSampled[i - 1].key).to.be.at.least(result.allSampled[i].key);
      }
    });

    it("should strictly filter out conflicted validators affiliated with NGO or bidding vendors", () => {
      const ngoAddress = "0xNGO1111111111111111111111111111111111111"; // val-02 is affiliated
      const biddingVendors = ["0xVENDOR2222222222222222222222222222222222"]; // val-04 is affiliated

      const result = selectValidatorPanel({
        campaignId: 42,
        subVaultId: 2,
        ngoAddress,
        biddingVendors,
      });

      // Conflicted array must record val-02 and val-04
      const conflictedIds = result.conflicted.map((v) => v.id);
      expect(conflictedIds).to.include("val-02");
      expect(conflictedIds).to.include("val-04");

      // Neither panel nor alternates can contain conflicted validators
      const selectedIds = [...result.panel, ...result.alternates].map((v) => v.id);
      expect(selectedIds).to.not.include("val-02");
      expect(selectedIds).to.not.include("val-04");

      for (const selected of [...result.panel, ...result.alternates]) {
        expect(isValidatorConflicted(selected, ngoAddress, biddingVendors)).to.be.false;
      }
    });

    it("should preserve key order when replacing timed-out or withdrawn validators without stalling", () => {
      const result = selectValidatorPanel({
        campaignId: 10,
        subVaultId: 1,
      });

      const initialPanel = [...result.panel];
      const initialAlternates = [...result.alternates];

      expect(initialAlternates).to.have.lengthOf(3);
      const firstAlternate = initialAlternates[0];
      const secondAlternate = initialAlternates[1];
      const thirdAlternate = initialAlternates[2];

      // Validator 2 in the panel times out
      const timedOutValidator = initialPanel[1];
      const replacement1 = replaceValidator(
        initialPanel,
        initialAlternates,
        timedOutValidator.id,
        "TIMEOUT",
        1
      );

      // Verify replacement slot
      expect(replacement1.previousValidator.id).to.equal(timedOutValidator.id);
      expect(replacement1.newValidator.id).to.equal(firstAlternate.id);
      expect(replacement1.updatedPanel[1].id).to.equal(firstAlternate.id);
      expect(replacement1.epoch).to.equal(2);
      expect(replacement1.remainingAlternates).to.have.lengthOf(2);
      expect(replacement1.remainingAlternates[0].id).to.equal(secondAlternate.id);
      expect(replacement1.remainingAlternates[1].id).to.equal(thirdAlternate.id);

      // Second validator withdraws
      const withdrawnValidator = replacement1.updatedPanel[4];
      const replacement2 = replaceValidator(
        replacement1.updatedPanel,
        replacement1.remainingAlternates,
        withdrawnValidator.id,
        "WITHDRAWAL",
        replacement1.epoch
      );

      expect(replacement2.newValidator.id).to.equal(secondAlternate.id);
      expect(replacement2.updatedPanel[4].id).to.equal(secondAlternate.id);
      expect(replacement2.epoch).to.equal(3);
      expect(replacement2.remainingAlternates).to.have.lengthOf(1);
      expect(replacement2.remainingAlternates[0].id).to.equal(thirdAlternate.id);

      // Third replacement exhausts the alternate pool
      const replacement3 = replaceValidator(
        replacement2.updatedPanel,
        replacement2.remainingAlternates,
        replacement2.updatedPanel[0].id,
        "TIMEOUT",
        replacement2.epoch
      );
      expect(replacement3.newValidator.id).to.equal(thirdAlternate.id);
      expect(replacement3.remainingAlternates).to.have.lengthOf(0);

      // Attempting a 4th replacement throws error cleanly
      expect(() => {
        replaceValidator(
          replacement3.updatedPanel,
          replacement3.remainingAlternates,
          replacement3.updatedPanel[0].id,
          "TIMEOUT",
          replacement3.epoch
        );
      }).to.throw("No remaining alternates available in backup pool");
    });

    it("should throw error if attempting to replace a validator not present in the panel", () => {
      const result = selectValidatorPanel({ campaignId: 1, subVaultId: 1 });
      expect(() => {
        replaceValidator(result.panel, result.alternates, "non-existent-validator-id");
      }).to.throw("is not currently present in the active validator panel");
    });
  });

  // =========================================================================
  // 2. BINARY WORLD ID RECIPIENT RECEIPT (POST /api/recipient-receipt)
  // =========================================================================
  describe("2. Binary World ID Recipient Receipt (src/app/api/recipient-receipt/route.ts)", () => {
    it("should correctly compute the deterministic action digest", () => {
      const action = computeRecipientReceiptAction(1, 2, testManifestCid);
      expect(action).to.match(/^0x[a-fA-F0-9]{64}$/);

      // Determinism
      const actionRepeat = computeRecipientReceiptAction(1, 2, testManifestCid);
      expect(action).to.equal(actionRepeat);

      // Sensitivity
      const actionDiffSub = computeRecipientReceiptAction(1, 3, testManifestCid);
      expect(action).to.not.equal(actionDiffSub);
    });

    it("should reject submissions with missing campaign context or malformed BN254 parameters", async () => {
      // Missing subVaultId
      const reqMissing = new NextRequest("http://localhost:3000/api/recipient-receipt", {
        method: "POST",
        body: JSON.stringify({
          campaignId: 1,
          deliveryManifestCid: testManifestCid,
          merkle_root: validMerkleRoot,
          nullifier_hash: validNullifierHash,
          proof: validProofString,
        }),
      });
      const resMissing = await recipientReceiptPOST(reqMissing);
      expect(resMissing.status).to.equal(400);

      // Out of bounds BN254 scalar field element
      const overflowHex = "0x" + (SNARK_SCALAR_FIELD + 1n).toString(16);
      const reqOverflow = new NextRequest("http://localhost:3000/api/recipient-receipt", {
        method: "POST",
        body: JSON.stringify({
          campaignId: 1,
          subVaultId: 1,
          deliveryManifestCid: testManifestCid,
          merkle_root: overflowHex,
          nullifier_hash: validNullifierHash,
          proof: validProofString,
        }),
      });
      const resOverflow = await recipientReceiptPOST(reqOverflow);
      expect(resOverflow.status).to.equal(400);
      const dataOverflow = await resOverflow.json();
      expect(dataOverflow.error_message).to.include("BN254");
    });

    it("should reject submission if client action does not match computed action", async () => {
      const reqMismatch = new NextRequest("http://localhost:3000/api/recipient-receipt", {
        method: "POST",
        body: JSON.stringify({
          campaignId: 1,
          subVaultId: 1,
          deliveryManifestCid: testManifestCid,
          merkle_root: validMerkleRoot,
          nullifier_hash: validNullifierHash,
          proof: validProofString,
          action: "0xforged_action_digest_000000000000000000000000000000000000000000000000",
        }),
      });
      const resMismatch = await recipientReceiptPOST(reqMismatch);
      expect(resMismatch.status).to.equal(400);
      const data = await resMismatch.json();
      expect(data.error_code).to.equal("ACTION_MISMATCH");
    });

    it("should accept valid receipt, record HasReceived=true, and reject replay attacks with HTTP 409", async () => {
      const recipientNullifier = "0x2222222222222222222222222222222222222222222222222222222222222222";
      const expectedAction = computeRecipientReceiptAction(1, 1, testManifestCid);

      // 1. Initial valid submission
      const reqInitial = new NextRequest("http://localhost:3000/api/recipient-receipt", {
        method: "POST",
        body: JSON.stringify({
          campaignId: 1,
          subVaultId: 1,
          deliveryManifestCid: testManifestCid,
          merkle_root: validMerkleRoot,
          nullifier_hash: recipientNullifier,
          proof: validProofString,
        }),
      });

      const resInitial = await recipientReceiptPOST(reqInitial);
      expect(resInitial.status).to.equal(200);

      const bodyInitial = await resInitial.json();
      expect(bodyInitial.success).to.be.true;
      expect(bodyInitial.status).to.equal("verified");
      expect(bodyInitial.hasReceived).to.be.true;
      expect(bodyInitial.isDecoupledFromPayout).to.be.true;
      expect(bodyInitial.actionId).to.equal(expectedAction);

      // In-memory store reflects reception
      const subCampaignId = computeSubCampaignId(1, 1);
      expect(recipientReceiptStore.hasReceived(subCampaignId, recipientNullifier)).to.be.true;
      expect(recipientReceiptStore.getReceiptCount(subCampaignId)).to.equal(1);

      // 2. Replay attack: submitting exact same proof and nullifier for same action
      const reqReplay = new NextRequest("http://localhost:3000/api/recipient-receipt", {
        method: "POST",
        body: JSON.stringify({
          campaignId: 1,
          subVaultId: 1,
          deliveryManifestCid: testManifestCid,
          merkle_root: validMerkleRoot,
          nullifier_hash: recipientNullifier,
          proof: validProofString,
        }),
      });

      const resReplay = await recipientReceiptPOST(reqReplay);
      expect(resReplay.status).to.equal(409);

      const bodyReplay = await resReplay.json();
      expect(bodyReplay.success).to.be.false;
      expect(bodyReplay.error_code).to.equal("ALREADY_VERIFIED");
      expect(bodyReplay.error_message).to.include("Replay attack detected");

      // 3. Different nullifier for same sub-campaign succeeds
      const uniqueNullifier2 = "0x1234567812345678123456781234567812345678123456781234567812345678";
      const reqSecond = new NextRequest("http://localhost:3000/api/recipient-receipt", {
        method: "POST",
        body: JSON.stringify({
          campaignId: 1,
          subVaultId: 1,
          deliveryManifestCid: testManifestCid,
          merkle_root: validMerkleRoot,
          nullifier_hash: uniqueNullifier2,
          proof: validProofString,
        }),
      });
      const resSecond = await recipientReceiptPOST(reqSecond);
      expect(resSecond.status).to.equal(200);
      expect(recipientReceiptStore.getReceiptCount(subCampaignId)).to.equal(2);
    });

    it("should allow querying receipt state via GET /api/recipient-receipt", async () => {
      const nullifier = "0x5555555555555555555555555555555555555555555555555555555555555555";
      recipientReceiptStore.recordReceipt({
        campaignId: "2",
        subVaultId: "1",
        subCampaignId: "2:1",
        deliveryManifestCid: testManifestCid,
        actionId: computeRecipientReceiptAction(2, 1, testManifestCid),
        nullifierHash: nullifier,
        verificationLevel: "orb",
        timestamp: Math.floor(Date.now() / 1000),
      });

      const getReq = new NextRequest("http://localhost:3000/api/recipient-receipt?campaignId=2&subVaultId=1&nullifier=" + nullifier);
      const getRes = await recipientReceiptGET(getReq);
      expect(getRes.status).to.equal(200);
      const getData = await getRes.json();
      expect(getData.success).to.be.true;
      expect(getData.hasReceived).to.be.true;
      expect(getData.totalCount).to.equal(1);
    });
  });

  // =========================================================================
  // 3. CHAINLINK CRE TO GEMINI HANDSHAKE (src/lib/cre/workflow.ts)
  // =========================================================================
  describe("3. Chainlink CRE to Gemini Handshake (src/lib/cre/workflow.ts)", () => {
    const validCreInput: CreWorkflowInput = {
      campaignId: 1,
      subVaultId: 1,
      vendorAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
      manifestCid: testManifestCid,
      carrierName: "Regional Humanitarian Freight Logistics",
      waybillNumber: "RELIEF-BLANKETS-2026-0042",
      claimedItemCount: 500,
      targetRegion: "Flood Zone 4",
      coordinates: {
        latitude: 14.5995,
        longitude: 120.9842,
      },
    };

    it("should achieve unanimous consensus across all 4 specialized DON nodes", async () => {
      const result = await donConsensusEngine.executeDonConsensus(validCreInput, {
        nodeCount: 4,
      });

      expect(result.consensus.reached).to.be.true;
      expect(result.consensus.affirmativeVotes).to.equal(4);
      expect(result.consensus.totalNodes).to.equal(4);
      expect(result.consensus.dissentingNodes).to.be.empty;

      // Verify specialized roles of the 4 nodes
      expect(result.nodeVotes[0].role).to.equal("CarrierTracking");
      expect(result.nodeVotes[0].isApproved).to.be.true;

      expect(result.nodeVotes[1].role).to.equal("SpatialGeofencing");
      expect(result.nodeVotes[1].isApproved).to.be.true;

      expect(result.nodeVotes[2].role).to.equal("GeminiInvoiceMatch");
      expect(result.nodeVotes[2].isApproved).to.be.true;

      expect(result.nodeVotes[3].role).to.equal("WorldIdRecipientReceipt");
      expect(result.nodeVotes[3].isApproved).to.be.true;
    });

    it("should pass 3-of-4 BFT consensus and recommend APPROVE when 1 node dissents (faulty)", async () => {
      const result = await creWorkflow.execute(validCreInput, {
        mode: "DON_SIMULATION",
        simulateFaultyNode: true, // Node 4 simulates Byzantine dissent
      });

      expect(result.isVerified).to.be.true;
      expect(result.checks.donConsensusReached).to.be.true;
      expect(result.donConsensus?.affirmativeVotes).to.equal(3);
      expect(result.donConsensus?.totalNodes).to.equal(4);
      expect(result.recommendation).to.equal("APPROVE_FOR_HUMAN_REVIEW");
    });

    it("should pass 3-of-4 BFT consensus when Gemini invoice match succeeds but recipient receipt is pending", async () => {
      const inputWithoutReceipt: CreWorkflowInput = {
        ...validCreInput,
        hasWorldIdReceipt: false, // Node 4 dissents
      };

      const donResult = await donConsensusEngine.executeDonConsensus(inputWithoutReceipt, {
        nodeCount: 4,
      });

      // 3 of 4 votes affirmative (Node 1, 2, 3 pass; Node 4 dissents)
      expect(donResult.consensus.reached).to.be.true;
      expect(donResult.consensus.affirmativeVotes).to.equal(3);
      expect(donResult.nodeVotes[3].isApproved).to.be.false;
      expect(donResult.nodeVotes[3].reason).to.include("missing");
    });

    it("should fail consensus and recommend REJECT if 2 or more nodes dissent", async () => {
      const dualFailureInput: CreWorkflowInput = {
        ...validCreInput,
        waybillNumber: "RELIEF-EXCEPTION-DAMAGED", // Node 1 fails (Carrier)
        geminiSpecMatched: false,                  // Node 3 fails (Gemini spec mismatch)
      };

      const result = await creWorkflow.execute(dualFailureInput, {
        mode: "DON_SIMULATION",
      });

      expect(result.isVerified).to.be.false;
      expect(result.checks.donConsensusReached).to.be.false;
      expect(result.donConsensus?.affirmativeVotes).to.be.at.most(2);
      expect(result.recommendation).to.equal("REJECT_ANOMALOUS_EVIDENCE");
    });

    it("should reject and give 0 affirmative votes on fraudulent under-delivery", async () => {
      const fraudulentInput: CreWorkflowInput = {
        ...validCreInput,
        claimedItemCount: 200, // Less than required 500
      };

      const donResult = await donConsensusEngine.executeDonConsensus(fraudulentInput, {
        nodeCount: 4,
      });

      expect(donResult.consensus.reached).to.be.false;
      expect(donResult.consensus.affirmativeVotes).to.equal(0);
      expect(donResult.allChecksPass).to.be.false;
    });
  });
});
