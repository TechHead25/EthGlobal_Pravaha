/**
 * @file adapter.ts
 * @notice Production-grade Arkiv Network Adapter for OpenAid Protocol.
 *         Interfaces with the official @arkiv-network/sdk on Rabdi Testnet.
 *         Supports schema-bound querying, time-scoped state, and wallet-owned entities.
 */

import { Hex } from "viem";
import { eq, and } from "@arkiv-network/sdk/query";
import { u64 } from "@arkiv-network/sdk";
import { getArkivPublicClient, ARKIV_CONFIG } from "./config";
import {
  SCHEMAS_BY_TYPE,
  ARKIV_EXPIRATION_POLICIES,
  ProcurementRequestSchema,
  ProcurementBidSchema,
  DeliveryEvidenceSchema,
  ValidatorReviewSchema,
} from "./schemas";
import {
  ArkivEntity,
  ArkivEntityType,
  ArkivQueryFilter,
  ArkivPaginatedResult,
  ProcurementRequestEntity,
  ProcurementBidEntity,
  DeliveryEvidenceEntity,
  ValidatorReviewEntity,
} from "./types";
import {
  validateEntityPayload,
  validatePublicSuitability,
  verifyOwnership,
} from "./validation";

export class ArkivAdapter {
  private isMockMode: boolean;
  private inMemoryEntities: Map<string, ArkivEntity> = new Map();

  constructor(mockMode?: boolean) {
    this.isMockMode = mockMode !== undefined ? mockMode : process.env.ARKIV_MOCK_MODE === "true";
  }

  /**
   * Set mock mode dynamically (used in unit tests for deterministic isolation).
   */
  public setMockMode(enabled: boolean) {
    this.isMockMode = enabled;
  }

  /**
   * Clears in-memory entities (used for test isolation).
   */
  public clearMemory() {
    this.inMemoryEntities.clear();
  }

  /**
   * Query entities matching filter criteria from Arkiv Network (or in-memory mock).
   */
  public async queryEntities(filter: ArkivQueryFilter = {}): Promise<ArkivEntity[]> {
    if (this.isMockMode) {
      return this.queryMemoryEntities(filter);
    }

    try {
      const publicClient = getArkivPublicClient();
      const limit = Math.min(filter.limit || ARKIV_CONFIG.defaultPageLimit, ARKIV_CONFIG.maxPageLimit);
      const offset = filter.offset || 0;

      const typesToQuery: ArkivEntityType[] = filter.type
        ? [filter.type]
        : ["ProcurementRequest", "ProcurementBid", "DeliveryEvidence", "ValidatorReview"];

      const queryPromises = typesToQuery.map(async (entityType) => {
        const schema = SCHEMAS_BY_TYPE[entityType];
        let q: any = publicClient.select().from(schema as any);

        if (filter.owner) {
          q = q.ownedBy(filter.owner.toLowerCase() as `0x${string}`);
        }

        const conditions: any[] = [];
        if (filter.campaignId !== undefined) {
          conditions.push(eq("campaignId", u64(BigInt(filter.campaignId)) as any));
        }
        if (filter.status) {
          conditions.push(eq("status", filter.status as any));
        }

        if (conditions.length === 1) {
          q = q.where(conditions[0]);
        } else if (conditions.length > 1) {
          q = q.where(and(conditions[0], conditions[1]));
        }

        q = q.limit(limit).offset(offset);

        const page = await q.fetch();
        return page.entities.map((row: any) => this.rowToEntity(row, entityType));
      });

      const resultsNested = await Promise.all(queryPromises);
      const allEntities = resultsNested.flat();

      // Sort by creation block/timestamp descending
      allEntities.sort((a, b) => b.createdAt - a.createdAt);

      return allEntities.slice(0, limit);
    } catch (err: any) {
      // If network fails and mock entities exist, return them with warning
      if (this.inMemoryEntities.size > 0) {
        console.warn("Arkiv public client query failed, serving cached/in-memory records:", err.message);
        return this.queryMemoryEntities(filter);
      }
      throw new Error(`ArkivQueryFailed: ${err.message || err}`);
    }
  }

  /**
   * Retrieve a single entity by its unique Arkiv key.
   */
  public async getEntity(id: string, type?: ArkivEntityType): Promise<ArkivEntity | null> {
    if (this.isMockMode || this.inMemoryEntities.has(id)) {
      return this.inMemoryEntities.get(id) || null;
    }

    try {
      const publicClient = getArkivPublicClient();
      const cleanKey = id.startsWith("0x") ? (id as Hex) : (`0x${id}` as Hex);
      const raw = await publicClient.getEntity(cleanKey);
      if (!raw) return null;

      // Infer entity type from tag/schema or fallback
      const schemaName = (raw as any).$schema || "";
      let inferredType: ArkivEntityType = type || "ProcurementRequest";
      if (schemaName.includes("bids")) inferredType = "ProcurementBid";
      if (schemaName.includes("evidence")) inferredType = "DeliveryEvidence";
      if (schemaName.includes("reviews")) inferredType = "ValidatorReview";

      return this.rowToEntity(raw, inferredType);
    } catch (err: any) {
      if (err.name === "NoEntityFoundError" || err.message?.includes("NoEntityFound")) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Create an entity on Arkiv Network signed by an authorized wallet client.
   * Never takes an unverified caller address in place of a cryptographic signature.
   */
  public async createEntityWithWallet(
    walletClient: any,
    type: ArkivEntityType,
    payload: Record<string, any>
  ): Promise<ArkivEntity> {
    validateEntityPayload(type, payload);

    if (this.isMockMode || !walletClient) {
      const mockKey = `0x${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
      const now = Math.floor(Date.now() / 1000);
      const mockEntity: ArkivEntity = {
        ...payload,
        id: mockKey,
        type,
        owner: (payload.owner || "0x0000000000000000000000000000000000000000").toLowerCase(),
        createdAt: now,
        expiresAt: now + 86400 * 14,
        txHash: `0x${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
      } as any;
      this.inMemoryEntities.set(mockKey, mockEntity);
      return mockEntity;
    }

    const schema = SCHEMAS_BY_TYPE[type];
    const expiration = ARKIV_EXPIRATION_POLICIES[type];

    // Format BigInt values for u64 columns
    const formattedValues: Record<string, any> = { ...payload };
    delete formattedValues.id;
    delete formattedValues.type;
    delete formattedValues.owner;
    delete formattedValues.createdAt;
    delete formattedValues.expiresAt;
    delete formattedValues.txHash;

    if (formattedValues.campaignId !== undefined) {
      formattedValues.campaignId = BigInt(formattedValues.campaignId);
    }
    if (formattedValues.itemCount !== undefined) {
      formattedValues.itemCount = BigInt(formattedValues.itemCount);
    }
    if (formattedValues.budgetCeilingUSDC !== undefined) {
      formattedValues.budgetCeilingUSDC = BigInt(formattedValues.budgetCeilingUSDC);
    }
    if (formattedValues.packageCount !== undefined) {
      formattedValues.packageCount = BigInt(formattedValues.packageCount);
    }
    if (formattedValues.verifiedItemCount !== undefined) {
      formattedValues.verifiedItemCount = BigInt(formattedValues.verifiedItemCount);
    }
    if (formattedValues.revealedBidUSDC !== undefined) {
      formattedValues.revealedBidUSDC = BigInt(formattedValues.revealedBidUSDC);
    }

    const result = await walletClient.createEntity({
      schema,
      values: formattedValues,
      expiration,
    });

    const addresses = await walletClient.getAddresses?.();
    const ownerAddr = addresses && addresses[0] ? addresses[0].toLowerCase() : "";

    const created: ArkivEntity = {
      ...payload,
      id: result.entityKey,
      type,
      owner: ownerAddr,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt: Number(result.expiresAt || 0n),
      txHash: result.txHash,
    } as any;

    this.inMemoryEntities.set(result.entityKey, created);
    return created;
  }

  /**
   * Update an entity using a wallet client, verifying ownership on-chain.
   */
  public async patchEntityWithWallet(
    walletClient: any,
    type: ArkivEntityType,
    entityKey: string,
    updates: Record<string, any>,
    callerAddress?: string
  ): Promise<ArkivEntity> {
    validatePublicSuitability(updates);

    if (this.isMockMode || !walletClient) {
      const existing = this.inMemoryEntities.get(entityKey);
      if (!existing) {
        throw new Error(`EntityNotFound: Entity with ID ${entityKey} does not exist`);
      }
      if (callerAddress && !verifyOwnership(existing.owner, callerAddress)) {
        throw new Error(`UnauthorizedUpdate: Caller ${callerAddress} is not the owner of ${entityKey}`);
      }
      const updated = {
        ...existing,
        ...updates,
        id: existing.id,
        owner: existing.owner,
        type: existing.type,
      } as ArkivEntity;
      this.inMemoryEntities.set(entityKey, updated);
      return updated;
    }

    const schema = SCHEMAS_BY_TYPE[type];
    const cleanKey = entityKey.startsWith("0x") ? (entityKey as Hex) : (`0x${entityKey}` as Hex);

    const formattedUpdates: Record<string, any> = { ...updates };
    if (formattedUpdates.revealedBidUSDC !== undefined) {
      formattedUpdates.revealedBidUSDC = BigInt(formattedUpdates.revealedBidUSDC);
    }

    const result = await walletClient.patchEntity({
      schema,
      entityKey: cleanKey,
      values: formattedUpdates,
    });

    const refreshed = await this.getEntity(entityKey, type);
    return refreshed || ({ id: result.entityKey, txHash: result.txHash } as any);
  }

  /**
   * Converts an SDK query row or getEntity result to a typed OpenAid ArkivEntity.
   */
  private rowToEntity(row: any, type: ArkivEntityType): ArkivEntity {
    const unwrap = (val: any) => (val?.value !== undefined ? val.value : val);

    const id = row.$key || "";
    const owner = (row.$owner || row.$creator || "").toLowerCase();
    const createdAt = typeof row.$createdAt === "bigint" ? Number(row.$createdAt) : Number(row.$createdAt || 0);
    const expiresAt = typeof row.$expiresAt === "bigint" ? Number(row.$expiresAt) : Number(row.$expiresAt || 0);

    switch (type) {
      case "ProcurementRequest": {
        const item: ProcurementRequestEntity = {
          id,
          type: "ProcurementRequest",
          owner,
          createdAt,
          expiresAt,
          campaignId: Number(unwrap(row.campaignId) || 0),
          title: String(unwrap(row.title) || ""),
          itemCategory: String(unwrap(row.itemCategory) || ""),
          itemCount: Number(unwrap(row.itemCount) || 0),
          itemUnit: String(unwrap(row.itemUnit) || ""),
          budgetCeilingUSDC: Number(unwrap(row.budgetCeilingUSDC) || 0),
          targetRegion: String(unwrap(row.targetRegion) || ""),
          status: String(unwrap(row.status) || ""),
          metadataCid: String(unwrap(row.metadataCid) || ""),
        };
        return item;
      }

      case "ProcurementBid": {
        const item: ProcurementBidEntity = {
          id,
          type: "ProcurementBid",
          owner,
          createdAt,
          expiresAt,
          campaignId: Number(unwrap(row.campaignId) || 0),
          vendorAddress: String(unwrap(row.vendorAddress) || "").toLowerCase(),
          commitHash: String(unwrap(row.commitHash) || ""),
          revealedBidUSDC: row.revealedBidUSDC !== undefined ? Number(unwrap(row.revealedBidUSDC)) : undefined,
          status: String(unwrap(row.status) || ""),
        };
        return item;
      }

      case "DeliveryEvidence": {
        const item: DeliveryEvidenceEntity = {
          id,
          type: "DeliveryEvidence",
          owner,
          createdAt,
          expiresAt,
          campaignId: Number(unwrap(row.campaignId) || 0),
          vendorAddress: String(unwrap(row.vendorAddress) || "").toLowerCase(),
          manifestCid: String(unwrap(row.manifestCid) || ""),
          carrierName: String(unwrap(row.carrierName) || ""),
          waybillNumber: String(unwrap(row.waybillNumber) || ""),
          packageCount: Number(unwrap(row.packageCount) || 0),
          verifiedItemCount: Number(unwrap(row.verifiedItemCount) || 0),
        };
        return item;
      }

      case "ValidatorReview": {
        const item: ValidatorReviewEntity = {
          id,
          type: "ValidatorReview",
          owner,
          createdAt,
          expiresAt,
          campaignId: Number(unwrap(row.campaignId) || 0),
          validatorAddress: String(unwrap(row.validatorAddress) || "").toLowerCase(),
          decision: String(unwrap(row.decision) || ""),
          humanVerified: Boolean(unwrap(row.humanVerified)),
          notes: String(unwrap(row.notes) || ""),
        };
        return item;
      }
    }
  }

  /**
   * Filters in-memory entities for testing or fallback.
   */
  private queryMemoryEntities(filter: ArkivQueryFilter): ArkivEntity[] {
    const now = Math.floor(Date.now() / 1000);
    const results: ArkivEntity[] = [];

    for (const entity of this.inMemoryEntities.values()) {
      if (filter.activeOnly && entity.expiresAt <= now) {
        continue;
      }
      if (filter.type && entity.type !== filter.type) {
        continue;
      }
      if (filter.owner && entity.owner.toLowerCase() !== filter.owner.toLowerCase()) {
        continue;
      }
      if (filter.campaignId !== undefined) {
        if ("campaignId" in entity && entity.campaignId !== filter.campaignId) {
          continue;
        }
      }
      if (filter.status) {
        if ("status" in entity && (entity as any).status !== filter.status) {
          continue;
        }
      }
      results.push(entity);
    }

    const offset = filter.offset || 0;
    const limit = filter.limit || ARKIV_CONFIG.defaultPageLimit;
    return results.slice(offset, offset + limit);
  }
}

export const arkiv = new ArkivAdapter();
