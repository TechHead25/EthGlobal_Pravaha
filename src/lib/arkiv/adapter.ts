/**
 * @file adapter.ts
 * @notice Arkiv Decentralized Database Adapter for OpenAid Protocol.
 *         Provides wallet-owned procurement entities, queryable listings,
 *         and expiring shared state on top of the Arkiv protocol paradigms.
 */

import { ArkivEntity, ArkivQueryFilter, ProcurementRequestEntity, ProcurementBidEntity, DeliveryEvidenceEntity, ValidatorReviewEntity } from "./types";

export class ArkivAdapter {
  private entities: Map<string, ArkivEntity> = new Map();

  constructor() {
    this.seedDemoEntities();
  }

  /**
   * @notice Seed initial demo data for the 500 blankets procurement scenario.
   */
  private seedDemoEntities() {
    const now = Math.floor(Date.now() / 1000);
    const demoNgo = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const demoVendorAlpha = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
    const demoVendorBeta = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";

    // 1. Initial Procurement Request (500 Blankets)
    const blanketRequest: ProcurementRequestEntity = {
      id: "req_campaign_1",
      type: "ProcurementRequest",
      owner: demoNgo.toLowerCase(),
      createdAt: now - 3600,
      expiresAt: now + 86400 * 14, // 14-day expiry
      campaignId: 1,
      title: "Emergency Thermal Blankets (500 units) - Flood Relief",
      itemCategory: "Disaster Shelter & Warmth",
      itemCount: 500,
      itemUnit: "blankets",
      budgetCeilingUSDC: 10000,
      targetRegion: "Flood Zone 4, District Delta",
      status: "OpenForBids",
      metadataCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    };
    this.entities.set(blanketRequest.id, blanketRequest);

    // 2. Sealed Bids in Arkiv
    const bidAlpha: ProcurementBidEntity = {
      id: "bid_1_alpha",
      type: "ProcurementBid",
      owner: demoVendorAlpha.toLowerCase(),
      createdAt: now - 1800,
      expiresAt: now + 86400 * 7,
      campaignId: 1,
      vendorAddress: demoVendorAlpha.toLowerCase(),
      commitHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      revealedBidUSDC: 9200,
      status: "Revealed",
    };
    this.entities.set(bidAlpha.id, bidAlpha);

    const bidBeta: ProcurementBidEntity = {
      id: "bid_1_beta",
      type: "ProcurementBid",
      owner: demoVendorBeta.toLowerCase(),
      createdAt: now - 1500,
      expiresAt: now + 86400 * 7,
      campaignId: 1,
      vendorAddress: demoVendorBeta.toLowerCase(),
      commitHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      revealedBidUSDC: 8500,
      status: "Won",
    };
    this.entities.set(bidBeta.id, bidBeta);
  }

  /**
   * @notice Store a new entity with verified wallet ownership and expiry.
   */
  public async createEntity(entity: ArkivEntity, callerAddress: string): Promise<ArkivEntity> {
    if (!callerAddress || callerAddress.toLowerCase() !== entity.owner.toLowerCase()) {
      throw new Error(`Unauthorized: Caller ${callerAddress} does not match entity owner ${entity.owner}`);
    }

    if (entity.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new Error("InvalidExpiry: Expiration timestamp must be in the future");
    }

    // Safety: ensure no raw sensitive personal data or secrets are stored
    this.validatePublicSuitability(entity);

    this.entities.set(entity.id, {
      ...entity,
      owner: entity.owner.toLowerCase(),
    });

    return this.entities.get(entity.id)!;
  }

  /**
   * @notice Update an entity, strictly enforcing wallet ownership.
   */
  public async updateEntity(
    id: string,
    updates: Partial<ArkivEntity>,
    callerAddress: string
  ): Promise<ArkivEntity> {
    const existing = this.entities.get(id);
    if (!existing) {
      throw new Error(`EntityNotFound: Entity with ID ${id} does not exist`);
    }

    if (existing.owner.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new Error(`UnauthorizedUpdate: Caller ${callerAddress} is not the owner of ${id}`);
    }

    const updated = {
      ...existing,
      ...updates,
      id: existing.id,
      owner: existing.owner, // Immutable ownership
      type: existing.type,   // Immutable type
    } as ArkivEntity;

    this.validatePublicSuitability(updated);
    this.entities.set(id, updated);

    return updated;
  }

  /**
   * @notice Query entities matching given filters and time-scoped expiration.
   */
  public async queryEntities(filter: ArkivQueryFilter = {}): Promise<ArkivEntity[]> {
    const now = Math.floor(Date.now() / 1000);
    const results: ArkivEntity[] = [];

    for (const entity of this.entities.values()) {
      // Expiry filter
      if (filter.activeOnly && entity.expiresAt <= now) {
        continue;
      }

      // Type filter
      if (filter.type && entity.type !== filter.type) {
        continue;
      }

      // Owner filter
      if (filter.owner && entity.owner.toLowerCase() !== filter.owner.toLowerCase()) {
        continue;
      }

      // Campaign ID filter
      if (filter.campaignId !== undefined) {
        if ("campaignId" in entity && entity.campaignId !== filter.campaignId) {
          continue;
        }
      }

      // Status filter
      if (filter.status) {
        if ("status" in entity && (entity as any).status !== filter.status) {
          continue;
        }
      }

      results.push(entity);
    }

    return results;
  }

  /**
   * @notice Retrieve an entity by ID.
   */
  public async getEntity(id: string): Promise<ArkivEntity | null> {
    return this.entities.get(id) || null;
  }

  /**
   * @notice Enforce privacy by rejecting sensitive fields.
   */
  private validatePublicSuitability(entity: ArkivEntity) {
    const serialized = JSON.stringify(entity).toLowerCase();
    const forbiddenKeywords = ["password", "privatekey", "secret", "seed", "ssn", "passport", "phonenumber"];
    for (const kw of forbiddenKeywords) {
      if (serialized.includes(kw)) {
        throw new Error(`PrivacyViolation: Entity contains forbidden keyword '${kw}'. Arkiv stores public/shared data only.`);
      }
    }
  }
}

export const arkiv = new ArkivAdapter();
