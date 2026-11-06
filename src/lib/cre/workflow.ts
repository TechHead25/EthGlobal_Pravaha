/**
 * @file workflow.ts
 * @notice Chainlink Runtime Environment (CRE) Delivery Evidence Verification Workflow.
 * Orchestrates off-chain logistics verification, carrier tracking, and spatial geofencing
 * across a Decentralized Oracle Network (DON) consensus layer.
 */

import { carrierTrackingService } from "./carrier";
import { donConsensusEngine } from "./don";
import { geofenceValidator } from "./geofence";
import { manifestValidator } from "./manifest";
import { validateCreWorkflowInput } from "./schemas";
import {
  CreExecutionOptions,
  CreVerificationResult,
  CreWorkflowInput,
} from "./types";

export * from "./types";

export class ChainlinkCreWorkflow {
  private allowedRegions: string[];

  constructor() {
    this.allowedRegions = geofenceValidator.getAllowedRegions();
  }

  /**
   * Executes the Chainlink CRE delivery evidence verification workflow.
   *
   * @param input Raw or typed workflow input containing campaign and delivery evidence parameters.
   * @param options Execution configuration (simulation mode, node count, fault injection).
   * @returns Comprehensive CreVerificationResult with individual checks and DON attestation.
   */
  public async execute(
    input: CreWorkflowInput,
    options?: CreExecutionOptions
  ): Promise<CreVerificationResult> {
    const timestamp = Math.floor(Date.now() / 1000);
    const mode = options?.mode || "DON_SIMULATION";

    // 1. Schema Validation & Input Sanitization
    const validation = validateCreWorkflowInput(input);
    if (!validation.isValid) {
      const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
      const fallbackCampaignId = typeof input?.campaignId === "number" ? input.campaignId : 0;
      const fallbackCid = typeof input?.manifestCid === "string" ? input.manifestCid : "invalid";

      return {
        campaignId: fallbackCampaignId,
        manifestCid: fallbackCid,
        isVerified: false,
        confidenceScore: 0,
        checks: {
          manifestIntegrity: false,
          carrierDeliveryConfirmed: false,
          itemCountSatisfied: false,
          geoCoordinatesInZone: false,
          donConsensusReached: false,
        },
        attestationDigest: `cre_attest_failed_${fallbackCampaignId}_${timestamp}`,
        timestamp,
        recommendation: "REJECT_ANOMALOUS_EVIDENCE",
        reason: `Input schema validation failed: ${errorMsg}`,
        executionMode: mode,
      };
    }

    const cleanInput = validation.data!;
    const requiredItems = options?.requiredItemCountOverride ?? cleanInput.requiredItemCount ?? 500;

    // 2. Individual Capability Checks
    // Capability A: Manifest CID & Arkiv Integrity
    const manifestResult = manifestValidator.verifyManifest(
      cleanInput.manifestCid,
      cleanInput.arkivEvidenceId
    );
    const manifestIntegrity = manifestResult.isValid;

    // Capability B: Logistics Carrier Tracking API
    let carrierDeliveryConfirmed = false;
    let carrierDetails = undefined;
    try {
      carrierDetails = await carrierTrackingService.verifyWaybill(
        cleanInput.carrierName,
        cleanInput.waybillNumber
      );
      carrierDeliveryConfirmed = carrierDetails.delivered;
    } catch {
      carrierDeliveryConfirmed = false;
    }

    // Capability C: Minimum Campaign RFP Item Quantity
    const itemCountSatisfied = cleanInput.claimedItemCount >= requiredItems;

    // Capability D: Spatial Geofencing & Disaster Perimeter Verification
    const geofenceResult = geofenceValidator.verifyCoordinates(
      cleanInput.targetRegion,
      cleanInput.coordinates
    );
    const geoCoordinatesInZone = geofenceResult.inZone;

    // 3. Multi-Node DON Consensus Layer Execution
    let donConsensusReached = true;
    let donDetails = undefined;
    let finalScore = 0;

    if (mode === "DON_SIMULATION" || mode === "LIVE_DON") {
      const donResult = await donConsensusEngine.executeDonConsensus(cleanInput, {
        nodeCount: options?.nodeCount ?? 4,
        simulateFaultyNode: options?.simulateFaultyNode ?? false,
      });

      donConsensusReached = donResult.consensus.reached;
      donDetails = donResult.consensus;
      finalScore = donResult.aggregatedScore;
    } else {
      // Local single-node scoring
      if (manifestIntegrity) finalScore += 25;
      if (carrierDeliveryConfirmed) finalScore += 35;
      if (itemCountSatisfied) finalScore += 20;
      if (geoCoordinatesInZone) finalScore += 20;
    }

    const allPassed =
      manifestIntegrity &&
      carrierDeliveryConfirmed &&
      itemCountSatisfied &&
      geoCoordinatesInZone &&
      donConsensusReached;

    // 4. Cryptographic Attestation Digest Generation
    // Canonical format: cre_attest_<campaignId>_<cidPrefix>_<timestamp>
    const cidPrefix = cleanInput.manifestCid.slice(0, 10);
    const attestationDigest = `cre_attest_${cleanInput.campaignId}_${cidPrefix}_${timestamp}`;

    let recommendation: CreVerificationResult["recommendation"] = "APPROVE_FOR_HUMAN_REVIEW";
    let reason = "All automated carrier, spatial, and delivery evidence checks passed.";

    if (!allPassed) {
      recommendation = "REJECT_ANOMALOUS_EVIDENCE";
      const failures: string[] = [];
      if (!manifestIntegrity) failures.push(manifestResult.reason);
      if (!carrierDeliveryConfirmed) failures.push("Carrier tracking status unconfirmed (not delivered)");
      if (!itemCountSatisfied) {
        failures.push(`Insufficient item count (${cleanInput.claimedItemCount} < ${requiredItems})`);
      }
      if (!geoCoordinatesInZone) failures.push(geofenceResult.reason);
      if (!donConsensusReached) {
        failures.push(`DON oracle consensus failed: ${donDetails?.affirmativeVotes}/${donDetails?.totalNodes} affirmative votes`);
      }
      reason = `Evidence check failed: ${failures.join("; ")}`;
    }

    return {
      campaignId: cleanInput.campaignId,
      manifestCid: cleanInput.manifestCid,
      isVerified: allPassed,
      confidenceScore: allPassed ? 100 : finalScore,
      checks: {
        manifestIntegrity,
        carrierDeliveryConfirmed,
        itemCountSatisfied,
        geoCoordinatesInZone,
        donConsensusReached,
      },
      attestationDigest,
      timestamp,
      recommendation,
      reason,
      executionMode: mode,
      carrierDetails,
      geofenceDetails: {
        matchedZone: geofenceResult.matchedZone?.name,
        distanceKmFromCenter: geofenceResult.distanceKmFromCenter,
      },
      donConsensus: donDetails,
    };
  }

  /**
   * Legacy helper for waybill checking (maintained for backwards compatibility).
   */
  public verifyCarrierWaybill(carrier: string, waybill: string): boolean {
    if (!carrier || !waybill) return false;
    if (waybill.startsWith("WB-") || waybill.startsWith("RELIEF-") || waybill.length >= 8) {
      return true;
    }
    return false;
  }
}

export const creWorkflow = new ChainlinkCreWorkflow();
