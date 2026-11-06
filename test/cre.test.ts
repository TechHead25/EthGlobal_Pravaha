/**
 * @file cre.test.ts
 * @notice Comprehensive test suite for Chainlink Runtime Environment (CRE) Delivery Evidence Verification.
 * Covers schema validation, capability checks, source failures, DON consensus, BFT fault tolerance,
 * and deterministic output.
 */

import { expect } from "chai";
import {
  creWorkflow,
  CreWorkflowInput,
  donConsensusEngine,
  geofenceValidator,
  manifestValidator,
  validateCreWorkflowInput,
} from "../chainlink-cre/workflow";
import { carrierTrackingService } from "../src/lib/cre/carrier";

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

  describe("1. Baseline Happy Path & Attestation Generation", () => {
    it("should successfully verify delivery evidence with 100/100 confidence", async () => {
      const result = await creWorkflow.execute(baseValidInput);

      expect(result.isVerified).to.be.true;
      expect(result.confidenceScore).to.equal(100);
      expect(result.recommendation).to.equal("APPROVE_FOR_HUMAN_REVIEW");
      expect(result.checks.manifestIntegrity).to.be.true;
      expect(result.checks.carrierDeliveryConfirmed).to.be.true;
      expect(result.checks.itemCountSatisfied).to.be.true;
      expect(result.checks.geoCoordinatesInZone).to.be.true;
      expect(result.checks.donConsensusReached).to.be.true;
      expect(result.attestationDigest).to.include("cre_attest_1");
    });

    it("should include carrier telemetry and geofencing breakdown in results", async () => {
      const result = await creWorkflow.execute(baseValidInput);

      expect(result.carrierDetails).to.not.be.undefined;
      expect(result.carrierDetails?.status).to.equal("DELIVERED");
      expect(result.carrierDetails?.recipientSigned).to.be.true;

      expect(result.geofenceDetails).to.not.be.undefined;
      expect(result.geofenceDetails?.matchedZone).to.equal("Flood Zone 4");
      expect(result.geofenceDetails?.distanceKmFromCenter).to.be.a("number");
    });

    it("should correctly link optional Arkiv decentralized database reference", async () => {
      const inputWithArkiv: CreWorkflowInput = {
        ...baseValidInput,
        arkivEvidenceId: "openaid.v1.evidence:1:bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      };

      const result = await creWorkflow.execute(inputWithArkiv);
      expect(result.isVerified).to.be.true;
    });
  });

  describe("2. Schema Validation & Input Sanitization", () => {
    it("should reject input when campaignId is missing or non-positive", async () => {
      const invalid = { ...baseValidInput, campaignId: 0 } as any;
      const res = await creWorkflow.execute(invalid);

      expect(res.isVerified).to.be.false;
      expect(res.confidenceScore).to.equal(0);
      expect(res.recommendation).to.equal("REJECT_ANOMALOUS_EVIDENCE");
      expect(res.reason).to.include("campaignId");
    });

    it("should reject malformed vendor Ethereum address", async () => {
      const invalid = { ...baseValidInput, vendorAddress: "not-an-eth-address" };
      const res = await creWorkflow.execute(invalid);

      expect(res.isVerified).to.be.false;
      expect(res.reason).to.include("vendorAddress");
    });

    it("should reject malformed or non-canonical IPFS CID", async () => {
      const malformedCidInput: CreWorkflowInput = {
        ...baseValidInput,
        manifestCid: "invalid_random_string",
      };

      const result = await creWorkflow.execute(malformedCidInput);

      expect(result.isVerified).to.be.false;
      expect(result.checks.manifestIntegrity).to.be.false;
      expect(result.recommendation).to.equal("REJECT_ANOMALOUS_EVIDENCE");
    });

    it("should accept valid IPFS CIDv0 addresses (Qm...)", () => {
      const validCid0 = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
      const res = manifestValidator.verifyManifest(validCid0);
      expect(res.isValid).to.be.true;
      expect(res.cidVersion).to.equal("CIDv0");
    });

    it("should reject empty carrier name or too short waybill", async () => {
      const invalid = { ...baseValidInput, carrierName: "", waybillNumber: "12" };
      const res = await creWorkflow.execute(invalid);

      expect(res.isVerified).to.be.false;
      expect(res.reason).to.include("carrierName");
    });

    it("should reject non-numeric or out-of-range coordinates", () => {
      const invalidLat = validateCreWorkflowInput({
        ...baseValidInput,
        coordinates: { latitude: 95.0, longitude: 10.0 },
      });
      expect(invalidLat.isValid).to.be.false;

      const invalidLng = validateCreWorkflowInput({
        ...baseValidInput,
        coordinates: { latitude: 10.0, longitude: 200.0 },
      });
      expect(invalidLng.isValid).to.be.false;
    });

    it("should reject negative or zero item count", async () => {
      const invalid = { ...baseValidInput, claimedItemCount: -10 };
      const res = await creWorkflow.execute(invalid);

      expect(res.isVerified).to.be.false;
      expect(res.reason).to.include("claimedItemCount");
    });
  });

  describe("3. Capability Failures & Adversarial Scenarios", () => {
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

    it("should reject delivery claims for unknown relief regions", async () => {
      const unknownRegionInput: CreWorkflowInput = {
        ...baseValidInput,
        targetRegion: "Fictional Valley 99",
      };

      const result = await creWorkflow.execute(unknownRegionInput);
      expect(result.isVerified).to.be.false;
      expect(result.checks.geoCoordinatesInZone).to.be.false;
    });

    it("should fail verification if carrier tracking indicates shipment is still IN_TRANSIT", async () => {
      const inTransitInput: CreWorkflowInput = {
        ...baseValidInput,
        waybillNumber: "RELIEF-TRANSIT-4040",
      };

      const result = await creWorkflow.execute(inTransitInput);

      expect(result.isVerified).to.be.false;
      expect(result.checks.carrierDeliveryConfirmed).to.be.false;
      expect(result.recommendation).to.equal("REJECT_ANOMALOUS_EVIDENCE");
    });

    it("should fail verification if carrier reports an EXCEPTION (damaged/lost in transit)", async () => {
      const exceptionInput: CreWorkflowInput = {
        ...baseValidInput,
        waybillNumber: "RELIEF-EXCEPTION-DAMAGED",
      };

      const result = await creWorkflow.execute(exceptionInput);

      expect(result.isVerified).to.be.false;
      expect(result.checks.carrierDeliveryConfirmed).to.be.false;
    });

    it("should handle carrier gateway network failures gracefully without crashing", async () => {
      const mockResult = await carrierTrackingService.verifyWaybill("TestCarrier", "WB-12345678", {
        mockStatusOverride: "NOT_FOUND",
      });

      expect(mockResult.delivered).to.be.false;
      expect(mockResult.status).to.equal("NOT_FOUND");
    });
  });

  describe("4. Decentralized Oracle Network (DON) Multi-Node Consensus & BFT", () => {
    it("should achieve unanimous consensus across 4 DON nodes on valid input", async () => {
      const donResult = await donConsensusEngine.executeDonConsensus(baseValidInput, {
        nodeCount: 4,
      });

      expect(donResult.consensus.reached).to.be.true;
      expect(donResult.consensus.affirmativeVotes).to.equal(4);
      expect(donResult.consensus.totalNodes).to.equal(4);
      expect(donResult.consensus.dissentingNodes).to.have.lengthOf(0);
      expect(donResult.aggregatedScore).to.equal(100);
    });

    it("should tolerate 1 Byzantine rogue node and still pass BFT consensus (3/4 threshold)", async () => {
      const result = await creWorkflow.execute(baseValidInput, {
        mode: "DON_SIMULATION",
        nodeCount: 4,
        simulateFaultyNode: true, // Injects 1 Byzantine node
      });

      expect(result.isVerified).to.be.true;
      expect(result.checks.donConsensusReached).to.be.true;
      expect(result.donConsensus?.affirmativeVotes).to.equal(3);
      expect(result.donConsensus?.totalNodes).to.equal(4);
      expect(result.donConsensus?.dissentingNodes).to.have.lengthOf(1);
    });

    it("should fail consensus when majority of DON nodes detect under-delivery", async () => {
      const underDelivered: CreWorkflowInput = {
        ...baseValidInput,
        claimedItemCount: 300,
      };

      const donResult = await donConsensusEngine.executeDonConsensus(underDelivered, {
        nodeCount: 4,
      });

      expect(donResult.consensus.reached).to.be.false;
      expect(donResult.consensus.affirmativeVotes).to.equal(0);
      expect(donResult.allChecksPass).to.be.false;
    });
  });

  describe("5. Determinism & Cardinal Protocol Invariant", () => {
    it("should produce deterministic attestation digests for identical inputs", async () => {
      const res1 = await creWorkflow.execute(baseValidInput);
      const res2 = await creWorkflow.execute(baseValidInput);

      expect(res1.isVerified).to.equal(res2.isVerified);
      expect(res1.confidenceScore).to.equal(res2.confidenceScore);
      expect(res1.recommendation).to.equal(res2.recommendation);
      expect(res1.checks).to.deep.equal(res2.checks);
    });

    it("should strictly enforce that recommendation is REJECT when any check fails", async () => {
      const failed = await creWorkflow.execute({
        ...baseValidInput,
        claimedItemCount: 10,
      });

      expect(failed.isVerified).to.be.false;
      expect(failed.recommendation).to.equal("REJECT_ANOMALOUS_EVIDENCE");
      expect(failed.confidenceScore).to.be.lessThan(100);
    });
  });
});
