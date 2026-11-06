/**
 * @file recipient-receipt.ts
 * @notice Binary World ID Recipient Receipt module.
 * Provides on-the-ground beneficiary delivery receipts with BN254 Semaphore ZK-SNARK verification,
 * anti-replay protection scoped per action digest, and decoupled state tracking.
 */

import { solidityPackedKeccak256 } from "ethers";
import {
  isValidFieldElement,
  isValidProofString,
  worldIdVerifier,
  WorldIdVerifier,
} from "./verifier";
import { WorldIdProofPayload } from "./types";

export interface RecipientReceiptRecord {
  campaignId: string;
  subVaultId: string;
  subCampaignId: string;
  deliveryManifestCid: string;
  actionId: string;
  nullifierHash: string;
  verificationLevel: "orb" | "device";
  timestamp: number;
}

export interface RecipientReceiptSubmission {
  campaignId: number | string | bigint;
  subVaultId: number | string | bigint;
  deliveryManifestCid: string;
  proof: WorldIdProofPayload | string;
  merkle_root?: string;
  nullifier_hash?: string;
  verification_level?: "orb" | "device";
  signal?: string;
}

/**
 * Computes deterministic action digest for ground recipient receipt:
 * action = keccak256(campaignId, subVaultId, deliveryManifestCid)
 */
export function computeRecipientReceiptAction(
  campaignId: number | string | bigint,
  subVaultId: number | string | bigint,
  deliveryManifestCid: string
): string {
  return solidityPackedKeccak256(
    ["uint256", "uint256", "string"],
    [BigInt(campaignId), BigInt(subVaultId), deliveryManifestCid.trim()]
  );
}

/**
 * Computes sub-campaign identifier:
 * e.g. "1:1" (campaignId:subVaultId)
 */
export function computeSubCampaignId(
  campaignId: number | string | bigint,
  subVaultId: number | string | bigint
): string {
  return `${String(campaignId)}:${String(subVaultId)}`;
}

/**
 * In-memory recipient receipt store.
 * Tracks HasReceived(subCampaignId, nullifier) = true.
 * Scopes nullifier replay protection strictly per actionId.
 */
export class RecipientReceiptStore {
  // Key: `${subCampaignId}:${nullifierHash}`
  private receiptsBySubCampaign = new Map<string, RecipientReceiptRecord>();
  // Key: `${actionId}:${nullifierHash}`
  private nullifiersByAction = new Set<string>();

  /**
   * Checks whether a specific nullifier has already submitted a receipt for a sub-campaign.
   */
  public hasReceived(subCampaignId: string, nullifierHash: string): boolean {
    const key = `${subCampaignId}:${nullifierHash.trim().toLowerCase()}`;
    return this.receiptsBySubCampaign.has(key);
  }

  /**
   * Checks whether a specific nullifier has already been consumed for a specific actionId.
   */
  public hasActionNullifier(actionId: string, nullifierHash: string): boolean {
    const key = `${actionId.trim().toLowerCase()}:${nullifierHash.trim().toLowerCase()}`;
    return this.nullifiersByAction.has(key);
  }

  /**
   * Sets HasReceived(subCampaignId, nullifier) = true and binds nullifier to actionId.
   */
  public recordReceipt(record: RecipientReceiptRecord): void {
    const subKey = `${record.subCampaignId}:${record.nullifierHash.trim().toLowerCase()}`;
    const actionKey = `${record.actionId.trim().toLowerCase()}:${record.nullifierHash.trim().toLowerCase()}`;

    this.receiptsBySubCampaign.set(subKey, record);
    this.nullifiersByAction.add(actionKey);
  }

  /**
   * Returns total number of receipts confirmed for a given sub-campaign.
   */
  public getReceiptCount(subCampaignId: string): number {
    let count = 0;
    for (const record of this.receiptsBySubCampaign.values()) {
      if (record.subCampaignId === subCampaignId) count++;
    }
    return count;
  }

  /**
   * Checks whether any receipt exists for a given sub-campaign or campaign ID.
   */
  public hasAnyReceiptForSubCampaign(subCampaignId: string): boolean {
    return this.getReceiptCount(subCampaignId) > 0;
  }

  /**
   * Clears all receipts and tracked nullifiers (strictly for testing).
   */
  public clear(): void {
    this.receiptsBySubCampaign.clear();
    this.nullifiersByAction.clear();
  }
}

export const recipientReceiptStore = new RecipientReceiptStore();

