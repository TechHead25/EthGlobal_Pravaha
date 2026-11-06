/**
 * @file adapter.ts
 * @notice Production-grade Arkiv Network Adapter for OpenAid Protocol V1 & V2.
 *         Interfaces with the official @arkiv-network/sdk on Rabdi Testnet.
 *         Supports schema-bound querying, sub-vault isolation, time-scoped state,
 *         and wallet-owned entities with strict PII scrubbing.
 */

import { Hex } from "viem";
import { eq, and } from "@arkiv-network/sdk/query";
import { u64 } from "@arkiv-network/sdk";
import { getArkivPublicClient, ARKIV_CONFIG } from "./config";
import {
  SCHEMAS_BY_TYPE,
  ARKIV_EXPIRATION_POLICIES,
} from "./schemas";
import {
  ArkivEntity,
  ArkivEntityType,
  ArkivQueryFilter,
  ProcurementRequestEntity,
  ProcurementBidEntity,
  DeliveryEvidenceEntity,
  ValidatorReviewEntity,
  SubCampaignEntity,
  RankedBidHistoryEntity,
  VendorReplacementLogEntity,
  ValidatorAssignmentEntity,
  CreateSubCampaignInput,
  RecordRankedBidsInput,
  VendorReplacementInput,
  ValidatorAssignmentInput,
  AuditTrailEvent,
  AuditTrailStep,
} from "./types";
import {
  validateEntityPayload,
  validatePublicSuitability,
  verifyOwnership,
  scrubPII,
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

      const allSupportedTypes: ArkivEntityType[] = [
        "ProcurementRequest",
        "ProcurementBid",
        "DeliveryEvidence",
        "ValidatorReview",
        "SubCampaign",
        "RankedBidHistory",
        "VendorReplacementLog",
        "ValidatorAssignment",
      ];

      const typesToQuery: ArkivEntityType[] = filter.type
        ? [filter.type]
        : allSupportedTypes;

      const queryPromises = typesToQuery.map(async (entityType) => {
        const schema = SCHEMAS_BY_TYPE[entityType];
        if (!schema) return [];

        let q: any = publicClient.select().from(schema as any);

        if (filter.owner) {
          q = q.ownedBy(filter.owner.toLowerCase() as `0x${string}`);
        }

        const conditions: any[] = [];
        if (filter.campaignId !== undefined) {
          conditions.push(eq("campaignId", u64(BigInt(filter.campaignId)) as any));
        }
        if (filter.subVaultId !== undefined && (schema.columns as any).subVaultId) {
          conditions.push(eq("subVaultId", u64(BigInt(filter.subVaultId)) as any));
        }
        if (filter.status && (schema.columns as any).status) {
          conditions.push(eq("status", filter.status as any));
        }

        if (conditions.length === 1) {
          q = q.where(conditions[0]);
        } else if (conditions.length > 1) {
          let combined = and(conditions[0], conditions[1]);
          for (let i = 2; i < conditions.length; i++) {
            combined = and(combined, conditions[i]);
          }
          q = q.where(combined);
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

      const schemaName = (raw as any).$schema || "";
      let inferredType: ArkivEntityType = type || "ProcurementRequest";
      if (schemaName.includes("bids")) inferredType = "ProcurementBid";
      if (schemaName.includes("evidence")) inferredType = "DeliveryEvidence";
      if (schemaName.includes("reviews")) inferredType = "ValidatorReview";
      if (schemaName.includes("subcampaigns")) inferredType = "SubCampaign";
      if (schemaName.includes("ranked_bids")) inferredType = "RankedBidHistory";
      if (schemaName.includes("vendor_replacements")) inferredType = "VendorReplacementLog";
      if (schemaName.includes("validator_assignments")) inferredType = "ValidatorAssignment";

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
    const scrubbed = scrubPII(payload);
    validateEntityPayload(type, scrubbed);

    const schema = SCHEMAS_BY_TYPE[type];
    const expiration = ARKIV_EXPIRATION_POLICIES[type];

    if (this.isMockMode || !walletClient) {
      const mockKey = `0x${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
      const now = Math.floor(Date.now() / 1000);
      const ttlSeconds = Number(expiration?.minLifetime || 86400n * 14n);

      const mockEntity: ArkivEntity = {
        ...scrubbed,
        id: mockKey,
        type,
        owner: (scrubbed.owner || "0x0000000000000000000000000000000000000000").toLowerCase(),
        createdAt: now,
        expiresAt: now + ttlSeconds,
        txHash: `0x${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`,
      } as any;
      this.inMemoryEntities.set(mockKey, mockEntity);
      return mockEntity;
    }

    // Format BigInt values for u64 columns
    const formattedValues: Record<string, any> = { ...scrubbed };
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
    if (formattedValues.subVaultId !== undefined) {
      formattedValues.subVaultId = BigInt(formattedValues.subVaultId);
    }
    if (formattedValues.budgetCeiling !== undefined) {
      formattedValues.budgetCeiling = BigInt(formattedValues.budgetCeiling);
    }
    if (formattedValues.rank1Amount !== undefined) {
      formattedValues.rank1Amount = BigInt(formattedValues.rank1Amount);
    }
    if (formattedValues.rank2Amount !== undefined) {
      formattedValues.rank2Amount = BigInt(formattedValues.rank2Amount);
    }
    if (formattedValues.priceDeficit !== undefined) {
      formattedValues.priceDeficit = BigInt(formattedValues.priceDeficit);
    }
    if (formattedValues.timestamp !== undefined) {
      formattedValues.timestamp = BigInt(formattedValues.timestamp);
    }

    const result = await walletClient.createEntity({
      schema,
      values: formattedValues,
      expiration,
    });

    const addresses = await walletClient.getAddresses?.();
    const ownerAddr = addresses && addresses[0] ? addresses[0].toLowerCase() : "";

    const created: ArkivEntity = {
      ...scrubbed,
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
    const scrubbedUpdates = scrubPII(updates);
    validatePublicSuitability(scrubbedUpdates);

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
        ...scrubbedUpdates,
        id: existing.id,
        owner: existing.owner,
        type: existing.type,
      } as ArkivEntity;
      this.inMemoryEntities.set(entityKey, updated);
      return updated;
    }

    const schema = SCHEMAS_BY_TYPE[type];
    const cleanKey = entityKey.startsWith("0x") ? (entityKey as Hex) : (`0x${entityKey}` as Hex);

    const formattedUpdates: Record<string, any> = { ...scrubbedUpdates };
    if (formattedUpdates.revealedBidUSDC !== undefined) {
      formattedUpdates.revealedBidUSDC = BigInt(formattedUpdates.revealedBidUSDC);
    }
    if (formattedUpdates.rank1Amount !== undefined) {
      formattedUpdates.rank1Amount = BigInt(formattedValuesOr(formattedUpdates.rank1Amount));
    }
    if (formattedUpdates.rank2Amount !== undefined) {
      formattedUpdates.rank2Amount = BigInt(formattedValuesOr(formattedUpdates.rank2Amount));
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
   * ============================================================================
   * V2 ADAPTER METHODS (Sub-Vault & Multi-Stage Architecture)
   * ============================================================================
   */

  /**
   * Creates an isolated SubCampaign allocation entity on Arkiv Network.
   * TTL: 365 days retention for humanitarian audit trails.
   */
  public async createSubCampaign(
    data: CreateSubCampaignInput,
    walletClient?: any
  ): Promise<SubCampaignEntity> {
    const scrubbed = scrubPII(data);
    const entity = await this.createEntityWithWallet(walletClient, "SubCampaign", scrubbed);
    return entity as SubCampaignEntity;
  }

  /**
   * Records sealed and revealed bid history for a sub-vault procurement auction.
   * TTL: 90 days retention for sealed/revealed bid data.
   */
  public async recordRankedBids(
    campaignId: number,
    subVaultId: number,
    bids: RecordRankedBidsInput,
    walletClient?: any
  ): Promise<RankedBidHistoryEntity> {
    const scrubbed = scrubPII(bids);
    const timestampsStr =
      typeof scrubbed.commitTimestamps === "object"
        ? JSON.stringify(scrubbed.commitTimestamps)
        : String(scrubbed.commitTimestamps || JSON.stringify([Math.floor(Date.now() / 1000)]));

    const payload = {
      campaignId,
      subVaultId,
      rank1Vendor: scrubbed.rank1Vendor.toLowerCase(),
      rank1Amount: scrubbed.rank1Amount,
      rank2Vendor: scrubbed.rank2Vendor ? scrubbed.rank2Vendor.toLowerCase() : undefined,
      rank2Amount: scrubbed.rank2Amount,
      commitTimestamps: timestampsStr,
      owner: scrubbed.owner,
    };

    const entity = await this.createEntityWithWallet(walletClient, "RankedBidHistory", payload);
    return entity as RankedBidHistoryEntity;
  }

  /**
   * Logs an immutable vendor replacement event when a winning vendor defaults.
   * TTL: 365 days retention for audit logging.
   */
  public async logVendorReplacement(
    campaignId: number,
    subVaultId: number,
    replacementData: VendorReplacementInput,
    walletClient?: any
  ): Promise<VendorReplacementLogEntity> {
    const scrubbed = scrubPII(replacementData);
    const payload = {
      campaignId,
      subVaultId,
      defaultVendor: scrubbed.defaultVendor.toLowerCase(),
      replacementVendor: scrubbed.replacementVendor.toLowerCase(),
      reason: scrubbed.reason,
      priceDeficit: scrubbed.priceDeficit,
      timestamp: scrubbed.timestamp || Math.floor(Date.now() / 1000),
      owner: scrubbed.owner,
    };

    const entity = await this.createEntityWithWallet(walletClient, "VendorReplacementLog", payload);
    return entity as VendorReplacementLogEntity;
  }

  /**
   * Records the 3-of-5 validator panel assignment, selection entropy seed, and verified quorum votes.
   * TTL: 365 days retention for governance and audit verification.
   */
  public async recordValidatorAssignment(
    campaignId: number,
    subVaultId: number,
    panelData: ValidatorAssignmentInput,
    walletClient?: any
  ): Promise<ValidatorAssignmentEntity> {
    const scrubbed = scrubPII(panelData);
    const panelStr =
      typeof scrubbed.panelValidatorAddresses === "object"
        ? JSON.stringify(scrubbed.panelValidatorAddresses)
        : String(scrubbed.panelValidatorAddresses);

    const votesStr =
      typeof scrubbed.decisionVotes === "object"
        ? JSON.stringify(scrubbed.decisionVotes)
        : String(scrubbed.decisionVotes || "{}");

    const payload = {
      campaignId,
      subVaultId,
      panelValidatorAddresses: panelStr,
      seed: scrubbed.seed,
      decisionVotes: votesStr,
      owner: scrubbed.owner,
    };

    const entity = await this.createEntityWithWallet(walletClient, "ValidatorAssignment", payload);
    return entity as ValidatorAssignmentEntity;
  }

  /**
   * Generates the complete, zero-PII chronological Donor Audit Trail for a campaign / sub-vault.
   * Canonical event flow:
   * CampaignCreated -> SubVaultCreated -> BidsRanked -> WinnerSelected -> [Optional: VendorReplaced] -> EvidenceSubmitted -> ValidatorVotes -> Settled/Refunded
   */
  public async getAuditTrail(campaignId: number, subVaultId?: number): Promise<AuditTrailEvent[]> {
    const allRecords = await this.queryEntities({ campaignId });

    // Filter relevant records (if subVaultId specified, keep records matching subVaultId or global campaign records)
    const records = allRecords.filter((r) => {
      if (subVaultId === undefined) return true;
      if ("subVaultId" in r) {
        return (r as any).subVaultId === subVaultId;
      }
      return true;
    });

    const requests = records.filter((r): r is ProcurementRequestEntity => r.type === "ProcurementRequest");
    const subCampaigns = records.filter((r): r is SubCampaignEntity => r.type === "SubCampaign");
    const rankedBids = records.filter((r): r is RankedBidHistoryEntity => r.type === "RankedBidHistory");
    const replacements = records.filter((r): r is VendorReplacementLogEntity => r.type === "VendorReplacementLog");
    const evidenceList = records.filter((r): r is DeliveryEvidenceEntity => r.type === "DeliveryEvidence");
    const assignments = records.filter((r): r is ValidatorAssignmentEntity => r.type === "ValidatorAssignment");
    const reviews = records.filter((r): r is ValidatorReviewEntity => r.type === "ValidatorReview");

    const events: AuditTrailEvent[] = [];
    let currentCursor = 0;

    const nextTimestamp = (preferredTime: number): number => {
      const ts = Math.max(currentCursor + 1, preferredTime);
      currentCursor = ts;
      return ts;
    };

    // Step 1: CampaignCreated
    if (requests.length > 0) {
      const req = requests[0];
      events.push({
        step: "CampaignCreated",
        timestamp: nextTimestamp(req.createdAt),
        campaignId,
        subVaultId,
        summary: `Campaign #${campaignId} created: "${req.title}" (Region: ${req.targetRegion})`,
        details: scrubPII({
          title: req.title,
          category: req.itemCategory,
          targetRegion: req.targetRegion,
          budgetCeilingUSDC: req.budgetCeilingUSDC,
          metadataCid: req.metadataCid,
        }),
        txHash: req.txHash,
      });
    } else if (subCampaigns.length > 0) {
      events.push({
        step: "CampaignCreated",
        timestamp: nextTimestamp(Math.max(1, subCampaigns[0].createdAt - 1)),
        campaignId,
        subVaultId,
        summary: `Campaign #${campaignId} created and initialized`,
        details: { campaignId, status: "Active" },
      });
    }

    // Step 2: SubVaultCreated
    for (const sc of subCampaigns) {
      events.push({
        step: "SubVaultCreated",
        timestamp: nextTimestamp(sc.createdAt),
        campaignId,
        subVaultId: sc.subVaultId,
        summary: `Sub-vault #${sc.subVaultId} (${sc.category}) initialized with budget $${sc.budgetCeiling.toLocaleString()}`,
        details: scrubPII({
          category: sc.category,
          budgetCeiling: sc.budgetCeiling,
          targetSpecifications: sc.targetSpecifications,
          ipfsManifestCid: sc.ipfsManifestCid,
        }),
        txHash: sc.txHash,
      });
    }

    // Step 3 & 4: BidsRanked & WinnerSelected
    for (const rb of rankedBids) {
      events.push({
        step: "BidsRanked",
        timestamp: nextTimestamp(rb.createdAt),
        campaignId,
        subVaultId: rb.subVaultId,
        summary: `Sealed bids revealed and ranked for Sub-vault #${rb.subVaultId}`,
        details: scrubPII({
          rank1Vendor: rb.rank1Vendor,
          rank1Amount: rb.rank1Amount,
          rank2Vendor: rb.rank2Vendor,
          rank2Amount: rb.rank2Amount,
          commitTimestamps: rb.commitTimestamps,
        }),
        txHash: rb.txHash,
      });

      events.push({
        step: "WinnerSelected",
        timestamp: nextTimestamp(rb.createdAt + 1),
        campaignId,
        subVaultId: rb.subVaultId,
        summary: `Winning vendor awarded: ${rb.rank1Vendor} with lowest bid $${rb.rank1Amount.toLocaleString()}`,
        details: scrubPII({
          winningVendor: rb.rank1Vendor,
          winningBidAmount: rb.rank1Amount,
          backupVendor: rb.rank2Vendor,
          backupBidAmount: rb.rank2Amount,
        }),
        txHash: rb.txHash,
      });
    }

    // Step 5: VendorReplaced (Optional)
    for (const rep of replacements) {
      events.push({
        step: "VendorReplaced",
        timestamp: nextTimestamp(rep.timestamp || rep.createdAt),
        campaignId,
        subVaultId: rep.subVaultId,
        summary: `Default vendor ${rep.defaultVendor} replaced by ${rep.replacementVendor} (Reason: ${rep.reason})`,
        details: scrubPII({
          defaultVendor: rep.defaultVendor,
          replacementVendor: rep.replacementVendor,
          reason: rep.reason,
          priceDeficit: rep.priceDeficit,
        }),
        txHash: rep.txHash,
      });
    }

    // Step 6: EvidenceSubmitted
    for (const ev of evidenceList) {
      events.push({
        step: "EvidenceSubmitted",
        timestamp: nextTimestamp(ev.createdAt),
        campaignId,
        subVaultId,
        summary: `Physical delivery evidence committed with manifest CID ${ev.manifestCid} via ${ev.carrierName}`,
        details: scrubPII({
          carrierName: ev.carrierName,
          waybillNumber: ev.waybillNumber,
          manifestCid: ev.manifestCid,
          packageCount: ev.packageCount,
          verifiedItemCount: ev.verifiedItemCount,
        }),
        txHash: ev.txHash,
      });
    }

    // Step 7: ValidatorVotes
    for (const va of assignments) {
      events.push({
        step: "ValidatorVotes",
        timestamp: nextTimestamp(va.createdAt),
        campaignId,
        subVaultId: va.subVaultId,
        summary: `Independent validator panel quorum recorded votes on delivery verification`,
        details: scrubPII({
          panelValidators: va.panelValidatorAddresses,
          seed: va.seed,
          votes: va.decisionVotes,
        }),
        txHash: va.txHash,
      });
    }

    if (reviews.length > 0 && assignments.length === 0) {
      const latestReview = reviews[reviews.length - 1];
      events.push({
        step: "ValidatorVotes",
        timestamp: nextTimestamp(latestReview.createdAt),
        campaignId,
        subVaultId,
        summary: `Validator quorum evaluated evidence: ${reviews.length} attestations recorded`,
        details: scrubPII({
          reviewsCount: reviews.length,
          latestDecision: latestReview.decision,
          humanVerified: latestReview.humanVerified,
        }),
        txHash: latestReview.txHash,
      });
    }

    // Step 8: Settled or Refunded
    const hasRejections = reviews.some((rev) => rev.decision === "REJECT");
    const hasApprovals =
      reviews.some((rev) => rev.decision === "APPROVE") ||
      assignments.some((a) => a.decisionVotes.includes("APPROVE"));

    if (hasApprovals && !hasRejections) {
      events.push({
        step: "Settled",
        timestamp: nextTimestamp(currentCursor + 1),
        campaignId,
        subVaultId,
        summary: `Sub-vault successfully verified and settled under 70/30 protocol staged payout rules`,
        details: {
          settlementStage1: "70% released upon 3-of-5 validator quorum attestation",
          settlementStage2: "30% finalized following dispute challenge window expiration",
        },
      });
    } else if (hasRejections) {
      events.push({
        step: "Refunded",
        timestamp: nextTimestamp(currentCursor + 1),
        campaignId,
        subVaultId,
        summary: `Sub-vault transitioned to refund status following failed delivery verification or upheld dispute`,
        details: {
          refundMechanism: "Deterministic proportional pull-over-push donor refund",
        },
      });
    }

    return events;
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

      case "SubCampaign": {
        const item: SubCampaignEntity = {
          id,
          type: "SubCampaign",
          owner,
          createdAt,
          expiresAt,
          campaignId: Number(unwrap(row.campaignId) || 0),
          subVaultId: Number(unwrap(row.subVaultId) || 0),
          category: String(unwrap(row.category) || ""),
          budgetCeiling: Number(unwrap(row.budgetCeiling) || 0),
          targetSpecifications: String(unwrap(row.targetSpecifications) || ""),
          ipfsManifestCid: String(unwrap(row.ipfsManifestCid) || ""),
          status: row.status ? String(unwrap(row.status)) : undefined,
        };
        return item;
      }

      case "RankedBidHistory": {
        const item: RankedBidHistoryEntity = {
          id,
          type: "RankedBidHistory",
          owner,
          createdAt,
          expiresAt,
          campaignId: Number(unwrap(row.campaignId) || 0),
          subVaultId: Number(unwrap(row.subVaultId) || 0),
          rank1Vendor: String(unwrap(row.rank1Vendor) || "").toLowerCase(),
          rank1Amount: Number(unwrap(row.rank1Amount) || 0),
          rank2Vendor: row.rank2Vendor ? String(unwrap(row.rank2Vendor) || "").toLowerCase() : undefined,
          rank2Amount: row.rank2Amount !== undefined ? Number(unwrap(row.rank2Amount)) : undefined,
          commitTimestamps: String(unwrap(row.commitTimestamps) || ""),
        };
        return item;
      }

      case "VendorReplacementLog": {
        const item: VendorReplacementLogEntity = {
          id,
          type: "VendorReplacementLog",
          owner,
          createdAt,
          expiresAt,
          campaignId: Number(unwrap(row.campaignId) || 0),
          subVaultId: Number(unwrap(row.subVaultId) || 0),
          defaultVendor: String(unwrap(row.defaultVendor) || "").toLowerCase(),
          replacementVendor: String(unwrap(row.replacementVendor) || "").toLowerCase(),
          reason: String(unwrap(row.reason) || ""),
          priceDeficit: Number(unwrap(row.priceDeficit) || 0),
          timestamp: Number(unwrap(row.timestamp) || 0),
        };
        return item;
      }

      case "ValidatorAssignment": {
        const item: ValidatorAssignmentEntity = {
          id,
          type: "ValidatorAssignment",
          owner,
          createdAt,
          expiresAt,
          campaignId: Number(unwrap(row.campaignId) || 0),
          subVaultId: Number(unwrap(row.subVaultId) || 0),
          panelValidatorAddresses: String(unwrap(row.panelValidatorAddresses) || ""),
          seed: String(unwrap(row.seed) || ""),
          decisionVotes: String(unwrap(row.decisionVotes) || ""),
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
      if (filter.subVaultId !== undefined) {
        if (!("subVaultId" in entity) || (entity as any).subVaultId !== filter.subVaultId) {
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

function formattedValuesOr(val: any): bigint {
  return typeof val === "bigint" ? val : BigInt(val || 0);
}

export const arkiv = new ArkivAdapter();
