/**
 * @file engine.ts
 * @notice Vendor Trust-Score Calculation Engine & Proof-of-Work Deduplication Registry.
 * Implements the OpenAid official vendor trust formula:
 *   onTimeRate = (onTimeDeliveries / completedContracts) * 100
 *   specMatch = average spec-match rate over deliveries (0-100)
 *   disputeRate = (upheldDisputes / completedContracts) * 100
 *   rawScore = 0.5 * onTimeRate + 0.5 * specMatch - 1.0 * disputeRate
 *   score = clamp(rawScore, 0, 100)
 *
 * New vendors start at 50 baseline. Minimum qualification threshold is 40.
 */

export const MIN_TRUST_THRESHOLD = 40;
export const NEW_VENDOR_BASELINE_SCORE = 50;

export interface VendorDeliveryRecord {
  campaignId: number;
  subVaultId?: string;
  onTime: boolean;
  specMatchRate: number; // 0 - 100
  disputeUpheld: boolean;
  timestamp: number;
}

export interface VendorDeliveryHistory {
  vendorAddress: string;
  completedContracts: number;
  onTimeDeliveries: number;
  specMatchRates: number[];
  upheldDisputes: number;
  history?: VendorDeliveryRecord[];
}

export interface VendorTrustMetrics {
  completedContracts: number;
  onTimeDeliveries: number;
  onTimeRate: number; // 0 - 100
  specMatch: number; // 0 - 100
  upheldDisputes: number;
  disputeRate: number; // 0 - 100
  rawScore: number;
}

export interface VendorTrustScore {
  vendorAddress: string;
  score: number; // Clamped 0 - 100
  isNewVendor: boolean;
  qualifies: boolean; // score >= 40
  minThreshold: number; // 40
  metrics: VendorTrustMetrics;
  explanation: string;
  disqualifyReasons: string[];
}

export interface ProofRegistrationResult {
  success: boolean;
  status: 200 | 409;
  error?: string;
  registeredProof?: {
    waybillNumber: string;
    manifestHash: string;
    campaignId: number;
    vendorAddress: string;
    timestamp: number;
  };
}

export class VendorTrustEngine {
  private vendorStore: Map<string, VendorDeliveryHistory> = new Map();

  // Deduplication store: normalized waybill -> proof metadata
  private waybillStore: Map<
    string,
    { campaignId: number; vendorAddress: string; timestamp: number }
  > = new Map();

  // Deduplication store: normalized manifest hash -> proof metadata
  private manifestStore: Map<
    string,
    { campaignId: number; vendorAddress: string; timestamp: number }
  > = new Map();

  /**
   * Calculates vendor trust score strictly adhering to the official formula.
   */
  public calculateTrustScore(history: VendorDeliveryHistory): VendorTrustScore {
    const cleanAddress = history.vendorAddress.trim().toLowerCase();
    const completedContracts = history.completedContracts;

    // 1. Handle New Vendor Baseline
    if (completedContracts === 0) {
      return {
        vendorAddress: cleanAddress,
        score: NEW_VENDOR_BASELINE_SCORE,
        isNewVendor: true,
        qualifies: NEW_VENDOR_BASELINE_SCORE >= MIN_TRUST_THRESHOLD,
        minThreshold: MIN_TRUST_THRESHOLD,
        metrics: {
          completedContracts: 0,
          onTimeDeliveries: 0,
          onTimeRate: 100,
          specMatch: 100,
          upheldDisputes: 0,
          disputeRate: 0,
          rawScore: NEW_VENDOR_BASELINE_SCORE,
        },
        explanation: `New vendor with 0 completed contracts. Assigned baseline trust score of ${NEW_VENDOR_BASELINE_SCORE}/100 (exceeds minimum threshold of ${MIN_TRUST_THRESHOLD}/100 for procurement bidding and backup vendor eligibility).`,
        disqualifyReasons: [],
      };
    }

    // 2. Compute Rates
    const onTimeRate = (history.onTimeDeliveries / completedContracts) * 100;

    let specMatch = 100;
    if (history.specMatchRates && history.specMatchRates.length > 0) {
      const sum = history.specMatchRates.reduce((a, b) => a + b, 0);
      specMatch = sum / history.specMatchRates.length;
    }

    const disputeRate = (history.upheldDisputes / completedContracts) * 100;

    // 3. Official Formula:
    // rawScore = 0.5 * onTimeRate + 0.5 * specMatch - 1.0 * disputeRate
    const rawScore = 0.5 * onTimeRate + 0.5 * specMatch - 1.0 * disputeRate;
    const clampedScore = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));

    // 4. Qualification & Explanations
    const qualifies = clampedScore >= MIN_TRUST_THRESHOLD;
    const disqualifyReasons: string[] = [];

    if (!qualifies) {
      if (clampedScore < MIN_TRUST_THRESHOLD) {
        disqualifyReasons.push(
          `Trust score of ${clampedScore} falls below minimum threshold of ${MIN_TRUST_THRESHOLD}.`
        );
      }
      if (disputeRate > 20) {
        disqualifyReasons.push(`Excessive upheld dispute rate (${disputeRate.toFixed(1)}%).`);
      }
      if (onTimeRate < 60) {
        disqualifyReasons.push(`Substandard on-time delivery rate (${onTimeRate.toFixed(1)}%).`);
      }
      if (specMatch < 70) {
        disqualifyReasons.push(`Low average specification match rate (${specMatch.toFixed(1)}%).`);
      }
    }

    let explanation = `Vendor trust score: ${clampedScore}/100. `;
    if (qualifies) {
      explanation += `Qualifies for bidding and backup vendor fallback. Performance breakdown: ${onTimeRate.toFixed(1)}% on-time delivery, ${specMatch.toFixed(1)}% average spec match, ${disputeRate.toFixed(1)}% dispute rate across ${completedContracts} contract(s).`;
    } else {
      explanation += `Disqualified. ${disqualifyReasons.join(" ")}`;
    }

    return {
      vendorAddress: cleanAddress,
      score: clampedScore,
      isNewVendor: false,
      qualifies,
      minThreshold: MIN_TRUST_THRESHOLD,
      metrics: {
        completedContracts,
        onTimeDeliveries: history.onTimeDeliveries,
        onTimeRate: Math.round(onTimeRate * 10) / 10,
        specMatch: Math.round(specMatch * 10) / 10,
        upheldDisputes: history.upheldDisputes,
        disputeRate: Math.round(disputeRate * 10) / 10,
        rawScore: Math.round(rawScore * 10) / 10,
      },
      explanation,
      disqualifyReasons,
    };
  }

  /**
   * Retrieves or initializes vendor delivery history from memory.
   */
  public getVendorTrust(vendorAddress: string): VendorTrustScore {
    const clean = vendorAddress.trim().toLowerCase();
    const existing = this.vendorStore.get(clean);

    if (!existing) {
      return this.calculateTrustScore({
        vendorAddress: clean,
        completedContracts: 0,
        onTimeDeliveries: 0,
        specMatchRates: [],
        upheldDisputes: 0,
      });
    }

    return this.calculateTrustScore(existing);
  }

  /**
   * Records a completed delivery or review for a vendor.
   */
  public recordDelivery(
    vendorAddress: string,
    record: VendorDeliveryRecord
  ): VendorTrustScore {
    const clean = vendorAddress.trim().toLowerCase();
    let current = this.vendorStore.get(clean);

    if (!current) {
      current = {
        vendorAddress: clean,
        completedContracts: 0,
        onTimeDeliveries: 0,
        specMatchRates: [],
        upheldDisputes: 0,
        history: [],
      };
    }

    current.completedContracts += 1;
    if (record.onTime) {
      current.onTimeDeliveries += 1;
    }
    current.specMatchRates.push(record.specMatchRate);
    if (record.disputeUpheld) {
      current.upheldDisputes += 1;
    }
    current.history = current.history || [];
    current.history.push(record);

    this.vendorStore.set(clean, current);
    return this.calculateTrustScore(current);
  }

  /**
   * Records an upheld dispute against a vendor.
   */
  public recordDispute(vendorAddress: string): VendorTrustScore {
    const clean = vendorAddress.trim().toLowerCase();
    let current = this.vendorStore.get(clean);

    if (!current) {
      current = {
        vendorAddress: clean,
        completedContracts: 1,
        onTimeDeliveries: 0,
        specMatchRates: [50],
        upheldDisputes: 1,
        history: [],
      };
    } else {
      current.upheldDisputes += 1;
    }

    this.vendorStore.set(clean, current);
    return this.calculateTrustScore(current);
  }

  /**
   * Verifies and registers Proof-of-Work documents (waybill and manifest CID).
   * Rejects duplicate waybills or reused manifest hashes with HTTP 409.
   */
  public checkAndRegisterProof(
    waybillNumber: string,
    manifestHash: string,
    metadata: { campaignId: number; vendorAddress: string }
  ): ProofRegistrationResult {
    const cleanWaybill = (waybillNumber || "").trim().toUpperCase();
    const cleanManifest = (manifestHash || "").trim();

    if (!cleanWaybill || !cleanManifest) {
      return {
        success: false,
        status: 409,
        error: "Waybill number and manifest hash must be non-empty strings.",
      };
    }

    // 1. Check waybill deduplication
    const existingWaybill = this.waybillStore.get(cleanWaybill);
    if (existingWaybill) {
      return {
        success: false,
        status: 409,
        error: `Duplicate proof-of-work: Waybill '${cleanWaybill}' has already been submitted in campaign #${existingWaybill.campaignId} by vendor ${existingWaybill.vendorAddress}.`,
      };
    }

    // 2. Check manifest CID/hash deduplication
    const existingManifest = this.manifestStore.get(cleanManifest);
    if (existingManifest) {
      return {
        success: false,
        status: 409,
        error: `Duplicate proof-of-work: Manifest CID '${cleanManifest}' has already been registered in campaign #${existingManifest.campaignId} by vendor ${existingManifest.vendorAddress}.`,
      };
    }

    // Register both
    const timestamp = Math.floor(Date.now() / 1000);
    const entry = {
      campaignId: metadata.campaignId,
      vendorAddress: metadata.vendorAddress.trim().toLowerCase(),
      timestamp,
    };

    this.waybillStore.set(cleanWaybill, entry);
    this.manifestStore.set(cleanManifest, entry);

    return {
      success: true,
      status: 200,
      registeredProof: {
        waybillNumber: cleanWaybill,
        manifestHash: cleanManifest,
        campaignId: metadata.campaignId,
        vendorAddress: metadata.vendorAddress,
        timestamp,
      },
    };
  }

  /**
   * Clears internal stores (used for test isolation).
   */
  public reset(): void {
    this.vendorStore.clear();
    this.waybillStore.clear();
    this.manifestStore.clear();
  }
}

export const vendorTrustEngine = new VendorTrustEngine();
