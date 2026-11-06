import { expect } from "chai";
import { ArkivAdapter } from "../src/lib/arkiv/adapter";
import {
  ARKIV_NAMESPACE,
  ProcurementRequestSchema,
  ProcurementBidSchema,
  DeliveryEvidenceSchema,
  ValidatorReviewSchema,
  ARKIV_EXPIRATION_POLICIES,
} from "../src/lib/arkiv/schemas";
import {
  validateEntityPayload,
  validatePublicSuitability,
  verifyOwnership,
  FORBIDDEN_PRIVACY_KEYWORDS,
} from "../src/lib/arkiv/validation";
import {
  ProcurementRequestEntity,
  ProcurementBidEntity,
  DeliveryEvidenceEntity,
  ValidatorReviewEntity,
} from "../src/lib/arkiv/types";
import { getArkivPublicClient, ARKIV_CONFIG } from "../src/lib/arkiv/config";

describe("Arkiv Decentralized Storage & Query Engine (OpenAid Protocol)", () => {
  let adapter: ArkivAdapter;

  const ngoWallet = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const vendorWallet = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const validatorWallet = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
  const attackerWallet = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

  beforeEach(() => {
    // Isolate unit tests using deterministic adapter mock mode
    adapter = new ArkivAdapter(true);
    adapter.clearMemory();
  });

  describe("1. Schema Isolation & Namespaces", () => {
    it("should define schemas under the versioned openaid.v1 namespace", () => {
      expect(ARKIV_NAMESPACE).to.equal("openaid.v1");
      expect(ProcurementRequestSchema.name).to.equal("openaid.v1.requests");
      expect(ProcurementBidSchema.name).to.equal("openaid.v1.bids");
      expect(DeliveryEvidenceSchema.name).to.equal("openaid.v1.evidence");
      expect(ValidatorReviewSchema.name).to.equal("openaid.v1.reviews");
    });

    it("should correctly configure indexed query columns for fast filtering", () => {
      // Requests schema
      expect(ProcurementRequestSchema.columns.campaignId.isIndexed).to.be.true;
      expect(ProcurementRequestSchema.columns.status.isIndexed).to.be.true;
      expect(ProcurementRequestSchema.columns.targetRegion.isIndexed).to.be.true;
      expect(ProcurementRequestSchema.columns.title.isIndexed).to.be.false;

      // Bids schema
      expect(ProcurementBidSchema.columns.campaignId.isIndexed).to.be.true;
      expect(ProcurementBidSchema.columns.vendorAddress.isIndexed).to.be.true;
      expect(ProcurementBidSchema.columns.status.isIndexed).to.be.true;

      // Evidence schema
      expect(DeliveryEvidenceSchema.columns.campaignId.isIndexed).to.be.true;
      expect(DeliveryEvidenceSchema.columns.vendorAddress.isIndexed).to.be.true;
      expect(DeliveryEvidenceSchema.columns.carrierName.isIndexed).to.be.true;

      // Review schema
      expect(ValidatorReviewSchema.columns.campaignId.isIndexed).to.be.true;
      expect(ValidatorReviewSchema.columns.validatorAddress.isIndexed).to.be.true;
      expect(ValidatorReviewSchema.columns.decision.isIndexed).to.be.true;
    });

    it("should enforce explicit TTL expiration policies per data domain", () => {
      // 14 days in Arkiv time units
      expect(ARKIV_EXPIRATION_POLICIES.ProcurementRequest.minLifetime).to.equal(604800n);
      // 7 days in Arkiv time units
      expect(ARKIV_EXPIRATION_POLICIES.ProcurementBid.minLifetime).to.equal(302400n);
      // 30 days in Arkiv time units
      expect(ARKIV_EXPIRATION_POLICIES.DeliveryEvidence.minLifetime).to.equal(1296000n);
      // 30 days in Arkiv time units
      expect(ARKIV_EXPIRATION_POLICIES.ValidatorReview.minLifetime).to.equal(1296000n);
    });
  });

  describe("2. Payload Validation & Sanitization", () => {
    it("should reject payloads with invalid or non-positive campaignId", () => {
      expect(() =>
        validateEntityPayload("ProcurementRequest", {
          campaignId: 0,
          title: "Blankets",
          itemCount: 100,
          budgetCeilingUSDC: 2000,
          metadataCid: "bafybeidemo",
        })
      ).to.throw("InvalidCampaignId");

      expect(() =>
        validateEntityPayload("ProcurementRequest", {
          campaignId: -1,
          title: "Blankets",
          itemCount: 100,
          budgetCeilingUSDC: 2000,
          metadataCid: "bafybeidemo",
        })
      ).to.throw("InvalidCampaignId");
    });

    it("should reject ProcurementRequest with missing or invalid fields", () => {
      expect(() =>
        validateEntityPayload("ProcurementRequest", {
          campaignId: 1,
          title: "",
          itemCount: 10,
          budgetCeilingUSDC: 500,
          metadataCid: "cid",
        })
      ).to.throw("InvalidTitle");

      expect(() =>
        validateEntityPayload("ProcurementRequest", {
          campaignId: 1,
          title: "Test",
          itemCount: 0,
          budgetCeilingUSDC: 500,
          metadataCid: "cid",
        })
      ).to.throw("InvalidItemCount");

      expect(() =>
        validateEntityPayload("ProcurementRequest", {
          campaignId: 1,
          title: "Test",
          itemCount: 10,
          budgetCeilingUSDC: 0,
          metadataCid: "cid",
        })
      ).to.throw("InvalidBudget");

      expect(() =>
        validateEntityPayload("ProcurementRequest", {
          campaignId: 1,
          title: "Test",
          itemCount: 10,
          budgetCeilingUSDC: 500,
          metadataCid: 12345 as any,
        })
      ).to.throw("InvalidMetadataCid");
    });

    it("should reject ProcurementBid with malformed vendor address or invalid commit hash", () => {
      expect(() =>
        validateEntityPayload("ProcurementBid", {
          campaignId: 1,
          vendorAddress: "invalid_eth_address",
          commitHash: "0x1234567890abcdef",
        })
      ).to.throw("InvalidVendorAddress");

      expect(() =>
        validateEntityPayload("ProcurementBid", {
          campaignId: 1,
          vendorAddress: vendorWallet,
          commitHash: "not_a_hex_hash",
        })
      ).to.throw("InvalidCommitHash");
    });

    it("should reject DeliveryEvidence with missing manifest CID or waybill number", () => {
      expect(() =>
        validateEntityPayload("DeliveryEvidence", {
          campaignId: 1,
          vendorAddress: vendorWallet,
          manifestCid: "",
          waybillNumber: "WAY-100",
        })
      ).to.throw("InvalidManifestCid");

      expect(() =>
        validateEntityPayload("DeliveryEvidence", {
          campaignId: 1,
          vendorAddress: vendorWallet,
          manifestCid: "bafybeidelivery",
          waybillNumber: 123 as any,
        })
      ).to.throw("InvalidWaybill");
    });

    it("should reject ValidatorReview with invalid validator address or unapproved decision enum", () => {
      expect(() =>
        validateEntityPayload("ValidatorReview", {
          campaignId: 1,
          validatorAddress: "bad_address",
          decision: "APPROVE",
        })
      ).to.throw("InvalidValidatorAddress");

      expect(() =>
        validateEntityPayload("ValidatorReview", {
          campaignId: 1,
          validatorAddress: validatorWallet,
          decision: "MAYBE",
        })
      ).to.throw("InvalidDecision");
    });

    it("should reject unknown entity types", () => {
      expect(() =>
        validateEntityPayload("UnknownEntity" as any, {
          campaignId: 1,
        })
      ).to.throw("UnsupportedEntityType");
    });
  });

  describe("3. Privacy Violation Defense", () => {
    it("should reject payloads containing forbidden PII or private keys", () => {
      FORBIDDEN_PRIVACY_KEYWORDS.forEach((kw) => {
        expect(() =>
          validatePublicSuitability({
            campaignId: 1,
            title: `Leak: ${kw}`,
          })
        ).to.throw("PrivacyViolation");
      });
    });

    it("should allow public humanitarian procurement metadata without forbidden terms", () => {
      expect(() =>
        validatePublicSuitability({
          campaignId: 1,
          title: "Clean Water Filter Units (500 sets)",
          region: "Zone 4",
          budgetCeilingUSDC: 25000,
        })
      ).not.to.throw();
    });
  });

  describe("4. Wallet Ownership & Access Control", () => {
    it("should correctly verify entity ownership", () => {
      expect(verifyOwnership(ngoWallet, ngoWallet)).to.be.true;
      expect(verifyOwnership(ngoWallet.toLowerCase(), ngoWallet.toUpperCase())).to.be.true;
      expect(verifyOwnership(ngoWallet, attackerWallet)).to.be.false;
      expect(verifyOwnership("", ngoWallet)).to.be.false;
      expect(verifyOwnership(ngoWallet, "")).to.be.false;
    });

    it("should enforce wallet ownership: non-owners cannot mutate an entity", async () => {
      const created = await adapter.createEntityWithWallet(null, "ProcurementRequest", {
        campaignId: 1,
        title: "Relief Blankets",
        itemCategory: "Shelter",
        itemCount: 500,
        itemUnit: "blankets",
        budgetCeilingUSDC: 10000,
        targetRegion: "Zone 1",
        status: "OpenForBids",
        metadataCid: "bafybeiblankets",
        owner: ngoWallet,
      });

      let error: any = null;
      try {
        await adapter.patchEntityWithWallet(
          null,
          "ProcurementRequest",
          created.id,
          { status: "Settled" },
          attackerWallet
        );
      } catch (err: any) {
        error = err;
      }

      expect(error).to.not.be.null;
      expect(error.message).to.include("UnauthorizedUpdate");
    });

    it("should permit updates when caller matches entity owner", async () => {
      const created = await adapter.createEntityWithWallet(null, "ProcurementRequest", {
        campaignId: 1,
        title: "Relief Blankets",
        itemCategory: "Shelter",
        itemCount: 500,
        itemUnit: "blankets",
        budgetCeilingUSDC: 10000,
        targetRegion: "Zone 1",
        status: "OpenForBids",
        metadataCid: "bafybeiblankets",
        owner: ngoWallet,
      });

      const updated = await adapter.patchEntityWithWallet(
        null,
        "ProcurementRequest",
        created.id,
        { status: "UnderReview" },
        ngoWallet
      );

      expect((updated as ProcurementRequestEntity).status).to.equal("UnderReview");
    });
  });

  describe("5. Entity Lifecycle & Polymorphic Queries", () => {
    it("should create and retrieve all 4 supported entity types", async () => {
      // 1. Procurement Request
      const req = await adapter.createEntityWithWallet(null, "ProcurementRequest", {
        campaignId: 1,
        title: "Emergency Food Packs",
        itemCategory: "Rations",
        itemCount: 1000,
        itemUnit: "packs",
        budgetCeilingUSDC: 15000,
        targetRegion: "Flood District",
        status: "Funding",
        metadataCid: "bafybeifoodpacks",
        owner: ngoWallet,
      });
      expect(req.id).to.match(/^0x[0-9a-fA-F]{32,}$/);
      expect(req.type).to.equal("ProcurementRequest");

      // 2. Procurement Bid
      const bid = await adapter.createEntityWithWallet(null, "ProcurementBid", {
        campaignId: 1,
        vendorAddress: vendorWallet,
        commitHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        revealedBidUSDC: 14200,
        status: "Committed",
        owner: vendorWallet,
      });
      expect(bid.type).to.equal("ProcurementBid");

      // 3. Delivery Evidence
      const evidence = await adapter.createEntityWithWallet(null, "DeliveryEvidence", {
        campaignId: 1,
        vendorAddress: vendorWallet,
        manifestCid: "bafybeimanifest",
        carrierName: "Express Freight Line",
        waybillNumber: "WAY-2026-999",
        packageCount: 50,
        verifiedItemCount: 1000,
        owner: vendorWallet,
      });
      expect(evidence.type).to.equal("DeliveryEvidence");

      // 4. Validator Review
      const review = await adapter.createEntityWithWallet(null, "ValidatorReview", {
        campaignId: 1,
        validatorAddress: validatorWallet,
        decision: "APPROVE",
        humanVerified: true,
        notes: "World ID verified attestation",
        owner: validatorWallet,
      });
      expect(review.type).to.equal("ValidatorReview");

      // Verify retrieval by ID
      const fetchedReq = await adapter.getEntity(req.id, "ProcurementRequest");
      expect(fetchedReq).to.not.be.null;
      expect((fetchedReq as ProcurementRequestEntity).title).to.equal("Emergency Food Packs");
    });

    it("should filter entities by type, campaignId, and status", async () => {
      await adapter.createEntityWithWallet(null, "ProcurementRequest", {
        campaignId: 1,
        title: "Request 1",
        itemCategory: "Food",
        itemCount: 100,
        itemUnit: "packs",
        budgetCeilingUSDC: 1000,
        targetRegion: "North",
        status: "OpenForBids",
        metadataCid: "cid1",
        owner: ngoWallet,
      });

      await adapter.createEntityWithWallet(null, "ProcurementRequest", {
        campaignId: 2,
        title: "Request 2",
        itemCategory: "Water",
        itemCount: 200,
        itemUnit: "bottles",
        budgetCeilingUSDC: 2000,
        targetRegion: "South",
        status: "Funding",
        metadataCid: "cid2",
        owner: ngoWallet,
      });

      await adapter.createEntityWithWallet(null, "ProcurementBid", {
        campaignId: 1,
        vendorAddress: vendorWallet,
        commitHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        status: "Committed",
        owner: vendorWallet,
      });

      // Filter by type
      const bids = await adapter.queryEntities({ type: "ProcurementBid" });
      expect(bids.length).to.equal(1);
      expect(bids[0].type).to.equal("ProcurementBid");

      // Filter by campaignId
      const camp2Entities = await adapter.queryEntities({ campaignId: 2 });
      expect(camp2Entities.length).to.equal(1);
      expect((camp2Entities[0] as ProcurementRequestEntity).campaignId).to.equal(2);

      // Filter by status
      const fundingRequests = await adapter.queryEntities({
        type: "ProcurementRequest",
        status: "Funding",
      });
      expect(fundingRequests.length).to.equal(1);
      expect((fundingRequests[0] as ProcurementRequestEntity).title).to.equal("Request 2");
    });

    it("should paginate query results using limit and offset", async () => {
      for (let i = 1; i <= 5; i++) {
        await adapter.createEntityWithWallet(null, "ProcurementRequest", {
          campaignId: i,
          title: `Item Batch #${i}`,
          itemCategory: "Medical",
          itemCount: 10 * i,
          itemUnit: "kits",
          budgetCeilingUSDC: 1000 * i,
          targetRegion: `Zone ${i}`,
          status: "OpenForBids",
          metadataCid: `cid${i}`,
          owner: ngoWallet,
        });
      }

      const page1 = await adapter.queryEntities({ limit: 2, offset: 0 });
      expect(page1.length).to.equal(2);

      const page2 = await adapter.queryEntities({ limit: 2, offset: 2 });
      expect(page2.length).to.equal(2);
      expect(page2[0].id).to.not.equal(page1[0].id);

      const page3 = await adapter.queryEntities({ limit: 2, offset: 4 });
      expect(page3.length).to.equal(1);
    });

    it("should filter out expired entities when activeOnly is true", async () => {
      const now = Math.floor(Date.now() / 1000);

      // Create an active entity
      const activeEntity = await adapter.createEntityWithWallet(null, "ProcurementRequest", {
        campaignId: 10,
        title: "Active Tender",
        itemCategory: "General",
        itemCount: 100,
        itemUnit: "units",
        budgetCeilingUSDC: 5000,
        targetRegion: "Zone A",
        status: "OpenForBids",
        metadataCid: "cid_active",
        owner: ngoWallet,
      });

      // Manually add an expired entity directly into memory
      const expiredBid: ProcurementBidEntity = {
        id: "0xexpiredbid0000000000000000000000",
        type: "ProcurementBid",
        owner: vendorWallet,
        createdAt: now - 7200,
        expiresAt: now - 3600, // Expired 1 hour ago
        campaignId: 10,
        vendorAddress: vendorWallet,
        commitHash: "0xexpiredhash",
        status: "Expired",
      };
      (adapter as any).inMemoryEntities.set(expiredBid.id, expiredBid);

      const activeOnlyResults = await adapter.queryEntities({ activeOnly: true });
      expect(activeOnlyResults.some((e) => e.id === expiredBid.id)).to.be.false;
      expect(activeOnlyResults.some((e) => e.id === activeEntity.id)).to.be.true;

      const allResults = await adapter.queryEntities({ activeOnly: false });
      expect(allResults.some((e) => e.id === expiredBid.id)).to.be.true;
    });

    it("should return empty array without crashing when no entities match criteria", async () => {
      const emptyResults = await adapter.queryEntities({ campaignId: 999999 });
      expect(emptyResults).to.be.an("array").that.is.empty;
    });
  });

  // --------------------------------------------------------------------------
  // Optional Real Rabdi Network Test Suite (Guarded by env flag)
  // --------------------------------------------------------------------------
  describe("6. Real Rabdi Testnet Integration (Opt-In)", function () {
    this.timeout(30000);

    const shouldRunNetworkTests = process.env.RUN_ARKIV_NETWORK_TESTS === "true";

    it("should verify Rabdi testnet configuration", () => {
      expect(ARKIV_CONFIG.chainId).to.equal(7794095);
      expect(ARKIV_CONFIG.network).to.equal("rabdi");
      expect(ARKIV_CONFIG.explorerUrl).to.include("rabdi.explorer.arkiv.network");
    });

    if (shouldRunNetworkTests) {
      it("should connect to Rabdi testnet and execute live query builder against openaid schemas", async () => {
        const publicClient = getArkivPublicClient();
        const page = await publicClient
          .select()
          .from(ProcurementRequestSchema)
          .limit(5)
          .fetch();

        expect(page).to.have.property("entities");
        expect(page.entities).to.be.an("array");
      });
    } else {
      it("skips live Rabdi network querying (set RUN_ARKIV_NETWORK_TESTS=true to enable)", () => {
        // Deterministic skip explanation
      });
    }
  });
});
