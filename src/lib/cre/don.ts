/**
 * @file don.ts
 * @notice Multi-node Decentralized Oracle Network (DON) consensus simulator for Chainlink CRE.
 */

import { CarrierTrackingService } from "./carrier";
import { GeofenceValidator } from "./geofence";
import { ManifestValidator } from "./manifest";
import {
  CreWorkflowInput,
  DonConsensusResult,
  DonNodeVote,
} from "./types";

export interface DonSimulationConfig {
  nodeCount?: number;
  consensusThresholdRatio?: number; // Default 0.67 (2/3 supermajority)
  simulateFaultyNode?: boolean;
}

export class DonConsensusEngine {
  private carrierService: CarrierTrackingService;
  private geofenceValidator: GeofenceValidator;
  private manifestValidator: ManifestValidator;

  constructor(
    carrierService?: CarrierTrackingService,
    geofenceValidator?: GeofenceValidator,
    manifestValidator?: ManifestValidator
  ) {
    this.carrierService = carrierService || new CarrierTrackingService();
    this.geofenceValidator = geofenceValidator || new GeofenceValidator();
    this.manifestValidator = manifestValidator || new ManifestValidator();
  }

  /**
   * Executes independent verification across multiple simulated DON oracle nodes
   * and aggregates results through BFT threshold consensus.
   */
  public async executeDonConsensus(
    input: CreWorkflowInput,
    config?: DonSimulationConfig
  ): Promise<{
    consensus: DonConsensusResult;
    nodeVotes: DonNodeVote[];
    aggregatedScore: number;
    allChecksPass: boolean;
  }> {
    const nodeCount = config?.nodeCount || 4;
    const thresholdRatio = config?.consensusThresholdRatio || 0.67;
    const requiredAffirmative = Math.ceil(nodeCount * thresholdRatio);

    const nodeVotes: DonNodeVote[] = [];

    const requiredItems = input.requiredItemCount ?? 500;

    for (let i = 1; i <= nodeCount; i++) {
      const nodeId = `don-node-${i}.cre.openaid.eth`;
      const isFaulty = config?.simulateFaultyNode && i === nodeCount;

      if (isFaulty) {
        // Simulating 1 Byzantine / rogue node with dissenting opinion
        nodeVotes.push({
          nodeId,
          isApproved: false,
          confidenceScore: 15,
          reason: "Simulated Byzantine node dissent: Synthetic network timeout",
          timestamp: Math.floor(Date.now() / 1000),
        });
        continue;
      }

      // 1. Manifest verification
      const manifestRes = this.manifestValidator.verifyManifest(
        input.manifestCid,
        input.arkivEvidenceId
      );

      // 2. Carrier verification
      let carrierDelivered = false;
      try {
        const carrierRes = await this.carrierService.verifyWaybill(
          input.carrierName,
          input.waybillNumber
        );
        carrierDelivered = carrierRes.delivered;
      } catch {
        carrierDelivered = false;
      }

      // 3. Item count verification
      const itemCountSatisfied = input.claimedItemCount >= requiredItems;

      // 4. Geofence verification
      const geofenceRes = this.geofenceValidator.verifyCoordinates(
        input.targetRegion,
        input.coordinates
      );

      const nodePass =
        manifestRes.isValid &&
        carrierDelivered &&
        itemCountSatisfied &&
        geofenceRes.inZone;

      let score = 0;
      if (manifestRes.isValid) score += 25;
      if (carrierDelivered) score += 35;
      if (itemCountSatisfied) score += 20;
      if (geofenceRes.inZone) score += 20;

      const failures: string[] = [];
      if (!manifestRes.isValid) failures.push(manifestRes.reason);
      if (!carrierDelivered) failures.push("Carrier tracking status unconfirmed");
      if (!itemCountSatisfied) failures.push(`Insufficient item count (${input.claimedItemCount} < ${requiredItems})`);
      if (!geofenceRes.inZone) failures.push(geofenceRes.reason);

      nodeVotes.push({
        nodeId,
        isApproved: nodePass,
        confidenceScore: score,
        reason: nodePass ? "All independent oracle checks verified." : failures.join("; "),
        timestamp: Math.floor(Date.now() / 1000),
      });
    }

    const affirmativeVotes = nodeVotes.filter((v) => v.isApproved).length;
    const dissentingNodes = nodeVotes.filter((v) => !v.isApproved).map((v) => v.nodeId);
    const consensusReached = affirmativeVotes >= requiredAffirmative;

    // Median score calculation
    const sortedScores = [...nodeVotes.map((v) => v.confidenceScore)].sort((a, b) => a - b);
    const mid = Math.floor(sortedScores.length / 2);
    const medianScore =
      sortedScores.length % 2 !== 0
        ? sortedScores[mid]
        : Math.round((sortedScores[mid - 1] + sortedScores[mid]) / 2);

    return {
      consensus: {
        reached: consensusReached,
        threshold: `${requiredAffirmative}/${nodeCount}`,
        affirmativeVotes,
        totalNodes: nodeCount,
        dissentingNodes,
      },
      nodeVotes,
      aggregatedScore: medianScore,
      allChecksPass: consensusReached,
    };
  }
}

export const donConsensusEngine = new DonConsensusEngine();
