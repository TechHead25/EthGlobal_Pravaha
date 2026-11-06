/**
 * @file types.ts
 * @notice Type definitions for the Chainlink Runtime Environment (CRE) OpenAid Delivery Verification Module.
 */

export interface CreCoordinates {
  latitude: number;
  longitude: number;
}

export interface CreWorkflowInput {
  campaignId: number;
  vendorAddress: string;
  manifestCid: string;
  carrierName: string;
  waybillNumber: string;
  claimedItemCount: number;
  targetRegion: string;
  coordinates: CreCoordinates;
  requiredItemCount?: number;
  arkivEvidenceId?: string;
  carrierEndpointUrl?: string;
}

export type CarrierTrackingStatus = "DELIVERED" | "IN_TRANSIT" | "EXCEPTION" | "NOT_FOUND";

export interface CarrierTrackingResponse {
  carrier: string;
  waybill: string;
  status: CarrierTrackingStatus;
  delivered: boolean;
  timestamp: number;
  recipientSigned: boolean;
  destinationCity?: string;
  destinationRegion?: string;
}

export interface GeofenceZone {
  id: string;
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

export interface DonNodeVote {
  nodeId: string;
  isApproved: boolean;
  confidenceScore: number;
  reason: string;
  timestamp: number;
}

export interface DonConsensusResult {
  reached: boolean;
  threshold: string;
  affirmativeVotes: number;
  totalNodes: number;
  dissentingNodes: string[];
}

export interface CreChecksBreakdown {
  manifestIntegrity: boolean;
  carrierDeliveryConfirmed: boolean;
  itemCountSatisfied: boolean;
  geoCoordinatesInZone: boolean;
  donConsensusReached?: boolean;
}

export type CreExecutionMode =
  | "LOCAL_SIMULATION"
  | "DON_SIMULATION"
  | "CRE_CLI_SIMULATE"
  | "LIVE_DON";

export interface CreVerificationResult {
  campaignId: number;
  manifestCid: string;
  isVerified: boolean;
  confidenceScore: number; // 0 - 100
  checks: CreChecksBreakdown;
  attestationDigest: string;
  timestamp: number;
  recommendation: "APPROVE_FOR_HUMAN_REVIEW" | "REJECT_ANOMALOUS_EVIDENCE";
  reason: string;
  executionMode: CreExecutionMode;
  carrierDetails?: CarrierTrackingResponse;
  geofenceDetails?: {
    matchedZone?: string;
    distanceKmFromCenter?: number;
  };
  donConsensus?: DonConsensusResult;
}

export interface CreExecutionOptions {
  mode?: CreExecutionMode;
  nodeCount?: number;
  simulateFaultyNode?: boolean;
  requiredItemCountOverride?: number;
}
