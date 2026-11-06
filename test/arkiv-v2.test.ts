import { expect } from "chai";
import { ArkivAdapter } from "../src/lib/arkiv/adapter";
import {
  ARKIV_V2_NAMESPACE,
  SubCampaignSchema,
  RankedBidHistorySchema,
  VendorReplacementLogSchema,
  ValidatorAssignmentSchema,
  ARKIV_V2_EXPIRATION_POLICIES,
} from "../src/lib/arkiv/schemas";
import {
  validateEntityPayload,
  validatePublicSuitability,
  scrubPII,
} from "../src/lib/arkiv/validation";
import {
  SubCampaignEntity,
  RankedBidHistoryEntity,
  VendorReplacementLogEntity,
  ValidatorAssignmentEntity,
  AuditTrailStep,
} from "../src/lib/arkiv/types";
import { GET, POST } from "../src/app/api/arkiv/route";
import { NextRequest } from "next/server";

describe("Arkiv Decentralized Storage & Query Engine — V2 Sub-Vault & Audit Trail", () => {
  let adapter: ArkivAdapter;

  const ngoWallet = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const vendor1Wallet = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const vendor2Wallet = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
  const validatorPanel = [
    "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
    "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
    "0xBcd4042DE499D14e55001CcbB24a551F3b954096",
  ];

  beforeEach(() => {
    adapter = new ArkivAdapter(true);
    adapter.clearMemory();
  });

  describe("1. V2 Schemas & TTL Policies under openaid.v2 Namespace", () => {
    it("should define all V2 schemas under the openaid.v2 namespace", () => {
      expect(ARKIV_V2_NAMESPACE).to.equal("openaid.v2");
      expect(SubCampaignSchema.name).to.equal("openaid.v2.subcampaigns");
      expect(RankedBidHistorySchema.name).to.equal("openaid.v2.ranked_bids");
      expect(VendorReplacementLogSchema.name).to.equal("openaid.v2.vendor_replacements");
      expect(ValidatorAssignmentSchema.name).to.equal("openaid.v2.validator_assignments");
    });

    it("should correctly configure indexed query columns for sub-vault filtering", () => {
      // SubCampaign schema
      expect(SubCampaignSchema.columns.campaignId.isIndexed).to.be.true;
      expect(SubCampaignSchema.columns.subVaultId.isIndexed).to.be.true;
      expect(SubCampaignSchema.columns.category.isIndexed).to.be.true;

      // RankedBidHistory schema
      expect(RankedBidHistorySchema.columns.campaignId.isIndexed).to.be.true;
      expect(RankedBidHistorySchema.columns.subVaultId.isIndexed).to.be.true;
      expect(RankedBidHistorySchema.columns.rank1Vendor.isIndexed).to.be.true;

      // VendorReplacementLog schema
      expect(VendorReplacementLogSchema.columns.campaignId.isIndexed).to.be.true;
      expect(VendorReplacementLogSchema.columns.subVaultId.isIndexed).to.be.true;
      expect(VendorReplacementLogSchema.columns.defaultVendor.isIndexed).to.be.true;
      expect(VendorReplacementLogSchema.columns.replacementVendor.isIndexed).to.be.true;

      // ValidatorAssignment schema
      expect(ValidatorAssignmentSchema.columns.campaignId.isIndexed).to.be.true;
      expect(ValidatorAssignmentSchema.columns.subVaultId.isIndexed).to.be.true;
    });

    it("should enforce explicit TTL expiration policies: 90 days for bids, 365 days for audit trails", () => {
      // 90 days for bids (3,888,000 blocks/units)
      expect(ARKIV_V2_EXPIRATION_POLICIES.RankedBidHistory.minLifetime).to.equal(3888000n);

      // 365 days for audit trails (15,768,000 blocks/units)
      expect(ARKIV_V2_EXPIRATION_POLICIES.SubCampaign.minLifetime).to.equal(15768000n);
      expect(ARKIV_V2_EXPIRATION_POLICIES.VendorReplacementLog.minLifetime).to.equal(15768000n);
      expect(ARKIV_V2_EXPIRATION_POLICIES.ValidatorAssignment.minLifetime).to.equal(15768000n);
    });
  });

  describe("2. V2 Adapter Methods & CRUD Lifecycle", () => {
    it("should create and retrieve a SubCampaign entity with sub-vault isolation metadata", async () => {
      const subCampaign = await adapter.createSubCampaign({
        campaignId: 101,
        subVaultId: 1,
        category: "Food Supplies",
        budgetCeiling: 50000,
        targetSpecifications: "10 metric tons grain, Grade-A packaging",
        ipfsManifestCid: "bafybeifoodsupplies101manifest",
        owner: ngoWallet,
      });

      expect(subCampaign).to.have.property("id");
      expect(subCampaign.type).to.equal("SubCampaign");
      expect(subCampaign.campaignId).to.equal(101);
      expect(subCampaign.subVaultId).to.equal(1);
      expect(subCampaign.category).to.equal("Food Supplies");
      expect(subCampaign.budgetCeiling).to.equal(50000);
      expect(subCampaign.targetSpecifications).to.equal("10 metric tons grain, Grade-A packaging");
      expect(subCampaign.ipfsManifestCid).to.equal("bafybeifoodsupplies101manifest");
      expect(subCampaign.owner.toLowerCase()).to.equal(ngoWallet.toLowerCase());
    });

    it("should record ranked bid history with winning vendor and backup vendor", async () => {
      const rankedBid = await adapter.recordRankedBids(101, 1, {
        rank1Vendor: vendor1Wallet,
        rank1Amount: 42000,
        rank2Vendor: vendor2Wallet,
        rank2Amount: 45000, // Within 15% spread cap ($42k * 1.15 = $48.3k)
        commitTimestamps: [1730000000, 1730000100],
        owner: ngoWallet,
      });

      expect(rankedBid.type).to.equal("RankedBidHistory");
      expect(rankedBid.campaignId).to.equal(101);
      expect(rankedBid.subVaultId).to.equal(1);
      expect(rankedBid.rank1Vendor.toLowerCase()).to.equal(vendor1Wallet.toLowerCase());
      expect(rankedBid.rank1Amount).to.equal(42000);
      expect(rankedBid.rank2Vendor?.toLowerCase()).to.equal(vendor2Wallet.toLowerCase());
      expect(rankedBid.rank2Amount).to.equal(45000);
      expect(rankedBid.commitTimestamps).to.include("1730000000");
    });

    it("should log vendor replacement when winning vendor defaults", async () => {
      const replacement = await adapter.logVendorReplacement(101, 1, {
        defaultVendor: vendor1Wallet,
        replacementVendor: vendor2Wallet,
        reason: "Primary vendor failed to commit delivery manifest within 72h SLA",
        priceDeficit: 3000, // $45,000 - $42,000 covered by slashed bond
        timestamp: 1730100000,
        owner: ngoWallet,
      });

      expect(replacement.type).to.equal("VendorReplacementLog");
      expect(replacement.campaignId).to.equal(101);
      expect(replacement.subVaultId).to.equal(1);
      expect(replacement.defaultVendor.toLowerCase()).to.equal(vendor1Wallet.toLowerCase());
      expect(replacement.replacementVendor.toLowerCase()).to.equal(vendor2Wallet.toLowerCase());
      expect(replacement.reason).to.include("Primary vendor failed");
      expect(replacement.priceDeficit).to.equal(3000);
    });

    it("should record validator panel assignment and quorum voting results", async () => {
      const assignment = await adapter.recordValidatorAssignment(101, 1, {
        panelValidatorAddresses: validatorPanel,
        seed: "0x4a7e93b1c5d80429f63ab908e2d415f3",
        decisionVotes: {
          [validatorPanel[0]]: "APPROVE",
          [validatorPanel[1]]: "APPROVE",
          [validatorPanel[2]]: "APPROVE",
        },
        owner: ngoWallet,
      });

      expect(assignment.type).to.equal("ValidatorAssignment");
      expect(assignment.campaignId).to.equal(101);
      expect(assignment.subVaultId).to.equal(1);
      expect(assignment.panelValidatorAddresses).to.include(validatorPanel[0]);
      expect(assignment.seed).to.equal("0x4a7e93b1c5d80429f63ab908e2d415f3");
      expect(assignment.decisionVotes).to.include("APPROVE");
    });
  });

  describe("3. Sub-Vault Isolation, Querying & Pagination", () => {
    beforeEach(async () => {
      // Setup Sub-Vault 1 (Food Supplies)
      await adapter.createSubCampaign({
        campaignId: 200,
        subVaultId: 1,
        category: "Food",
        budgetCeiling: 50000,
        targetSpecifications: "Grain & Beans",
        ipfsManifestCid: "bafyfood",
      });
      await adapter.recordRankedBids(200, 1, {
        rank1Vendor: vendor1Wallet,
        rank1Amount: 48000,
      });

      // Setup Sub-Vault 2 (Clothes Supplies)
      await adapter.createSubCampaign({
        campaignId: 200,
        subVaultId: 2,
        category: "Clothes",
        budgetCeiling: 30000,
        targetSpecifications: "Winter Jackets (1,000 units)",
        ipfsManifestCid: "bafyclothes",
      });
      await adapter.recordRankedBids(200, 2, {
        rank1Vendor: vendor2Wallet,
        rank1Amount: 28000,
      });

      // Setup Sub-Vault 3 (Medical Aid)
      await adapter.createSubCampaign({
        campaignId: 200,
        subVaultId: 3,
        category: "Medical",
        budgetCeiling: 20000,
        targetSpecifications: "First Aid Kits",
        ipfsManifestCid: "bafymedical",
      });
    });

    it("should enforce sub-vault isolation when querying by subVaultId", async () => {
      const foodEntities = await adapter.queryEntities({
        campaignId: 200,
        subVaultId: 1,
      });

      expect(foodEntities.length).to.equal(2);
      foodEntities.forEach((entity) => {
        expect((entity as any).subVaultId).to.equal(1);
      });

      const clothesEntities = await adapter.queryEntities({
        campaignId: 200,
        subVaultId: 2,
      });

      expect(clothesEntities.length).to.equal(2);
      clothesEntities.forEach((entity) => {
        expect((entity as any).subVaultId).to.equal(2);
      });
    });

    it("should paginate query results cleanly using limit and offset", async () => {
      const page1 = await adapter.queryEntities({
        campaignId: 200,
        limit: 2,
        offset: 0,
      });
      expect(page1.length).to.equal(2);

      const page2 = await adapter.queryEntities({
        campaignId: 200,
        limit: 2,
        offset: 2,
      });
      expect(page2.length).to.equal(2);

      // Verify no overlap between page 1 and page 2
      const page1Keys = new Set(page1.map((e) => e.id));
      page2.forEach((e) => {
        expect(page1Keys.has(e.id)).to.be.false;
      });
    });
  });

  describe("4. Strict PII Scrubbing & Privacy Defense", () => {
    it("should automatically scrub beneficiary details, tax IDs, and private keys", async () => {
      const inputWithPII: any = {
        campaignId: 300,
        subVaultId: 1,
        category: "Medical",
        budgetCeiling: 15000,
        targetSpecifications: "Sanitized medical kits",
        ipfsManifestCid: "bafysafe",
        beneficiaryDetails: {
          recipientName: "John Doe",
          nationalId: "987-65-4321",
        },
        taxId: "TAX-998877",
        privateKey: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      };

      const entity = await adapter.createSubCampaign(inputWithPII);

      // Verify PII fields were completely stripped
      expect(entity).not.to.have.property("beneficiaryDetails");
      expect(entity).not.to.have.property("taxId");
      expect(entity).not.to.have.property("privateKey");

      // Verify public suitability passes cleanly on saved record
      expect(() => validatePublicSuitability(entity)).not.to.throw();
    });

    it("should reject raw payloads containing forbidden PII keywords in domain fields", () => {
      expect(() =>
        validatePublicSuitability({
          campaignId: 300,
          subVaultId: 1,
          category: "Food",
          targetSpecifications: "Beneficiary list with phone_number and passport details",
        })
      ).to.throw("PrivacyViolation");

      expect(() =>
        validatePublicSuitability({
          campaignId: 300,
          subVaultId: 1,
          category: "Food",
          targetSpecifications: "Leaked privatekey: 0x123",
        })
      ).to.throw("PrivacyViolation");
    });

    it("should allow valid cryptographic randomness seed in ValidatorAssignment without false positive", () => {
      const validAssignmentPayload = {
        campaignId: 300,
        subVaultId: 1,
        panelValidatorAddresses: "0x123",
        seed: "0x9876543210fedcba876543210fedcba1",
        decisionVotes: "APPROVE",
      };

      expect(() => validatePublicSuitability(validAssignmentPayload)).not.to.throw();
      expect(() => validateEntityPayload("ValidatorAssignment", validAssignmentPayload)).not.to.throw();
    });
  });

  describe("5. Donor Audit Trail Chronological Event Stream", () => {
    it("should generate the canonical chronological event stream for a verified & settled sub-vault", async () => {
      const campaignId = 400;
      const subVaultId = 1;

      // 1. Sub-vault created
      await adapter.createSubCampaign({
        campaignId,
        subVaultId,
        category: "Emergency Shelters",
        budgetCeiling: 75000,
        targetSpecifications: "100 all-weather disaster tents",
        ipfsManifestCid: "bafytents400",
      });

      // 2. Bids revealed and ranked
      await adapter.recordRankedBids(campaignId, subVaultId, {
        rank1Vendor: vendor1Wallet,
        rank1Amount: 68000,
        rank2Vendor: vendor2Wallet,
        rank2Amount: 72000,
      });

      // 3. Winning vendor delivers evidence
      await adapter.createEntityWithWallet(null, "DeliveryEvidence", {
        campaignId,
        vendorAddress: vendor1Wallet,
        carrierName: "DHL Humanitarian Logistics",
        waybillNumber: "WAYBILL-889900",
        manifestCid: "bafyevidence400",
        packageCount: 100,
        verifiedItemCount: 100,
      });

      // 4. Validator panel records 3-of-5 approval quorum
      await adapter.recordValidatorAssignment(campaignId, subVaultId, {
        panelValidatorAddresses: validatorPanel,
        seed: "0xbeac0n5eed",
        decisionVotes: {
          [validatorPanel[0]]: "APPROVE",
          [validatorPanel[1]]: "APPROVE",
          [validatorPanel[2]]: "APPROVE",
        },
      });

      // Generate Donor Audit Trail
      const trail = await adapter.getAuditTrail(campaignId, subVaultId);

      expect(trail.length).to.be.greaterThanOrEqual(6);

      const steps = trail.map((e) => e.step);
      expect(steps).to.include("CampaignCreated");
      expect(steps).to.include("SubVaultCreated");
      expect(steps).to.include("BidsRanked");
      expect(steps).to.include("WinnerSelected");
      expect(steps).to.include("EvidenceSubmitted");
      expect(steps).to.include("ValidatorVotes");
      expect(steps).to.include("Settled");

      // Verify strict chronological sequence
      const stepSequence: AuditTrailStep[] = [
        "CampaignCreated",
        "SubVaultCreated",
        "BidsRanked",
        "WinnerSelected",
        "EvidenceSubmitted",
        "ValidatorVotes",
        "Settled",
      ];

      let lastIndex = -1;
      for (const expectedStep of stepSequence) {
        const idx = steps.indexOf(expectedStep);
        expect(idx).to.be.greaterThan(lastIndex, `Step ${expectedStep} is out of chronological sequence`);
        lastIndex = idx;
      }

      // Verify zero PII in every audit trail event
      trail.forEach((event) => {
        expect(() => validatePublicSuitability(event)).not.to.throw();
      });
    });

    it("should include VendorReplaced in the audit sequence when primary vendor defaults", async () => {
      const campaignId = 401;
      const subVaultId = 1;

      await adapter.createSubCampaign({
        campaignId,
        subVaultId,
        category: "Potable Water",
        budgetCeiling: 40000,
        targetSpecifications: "Water Purification Tablets",
        ipfsManifestCid: "bafywater",
      });

      await adapter.recordRankedBids(campaignId, subVaultId, {
        rank1Vendor: vendor1Wallet,
        rank1Amount: 35000,
        rank2Vendor: vendor2Wallet,
        rank2Amount: 38000,
      });

      // Vendor 1 defaults -> Vendor 2 stepped in within 15% spread cap
      await adapter.logVendorReplacement(campaignId, subVaultId, {
        defaultVendor: vendor1Wallet,
        replacementVendor: vendor2Wallet,
        reason: "Primary vendor failed SLA deadline",
        priceDeficit: 3000,
      });

      await adapter.createEntityWithWallet(null, "DeliveryEvidence", {
        campaignId,
        vendorAddress: vendor2Wallet,
        carrierName: "FedEx Disaster Express",
        waybillNumber: "WAYBILL-3344",
        manifestCid: "bafywaterevidence",
        packageCount: 50,
        verifiedItemCount: 50,
      });

      await adapter.recordValidatorAssignment(campaignId, subVaultId, {
        panelValidatorAddresses: validatorPanel,
        seed: "0xseedwater",
        decisionVotes: { [validatorPanel[0]]: "APPROVE" },
      });

      const trail = await adapter.getAuditTrail(campaignId, subVaultId);
      const steps = trail.map((e) => e.step);

      expect(steps).to.include("VendorReplaced");

      const winnerIdx = steps.indexOf("WinnerSelected");
      const replaceIdx = steps.indexOf("VendorReplaced");
      const evidenceIdx = steps.indexOf("EvidenceSubmitted");

      expect(replaceIdx).to.be.greaterThan(winnerIdx);
      expect(replaceIdx).to.be.lessThan(evidenceIdx);
    });
  });

  describe("6. API Route Integration (GET & POST /api/arkiv)", () => {
    it("should return the donor audit trail from GET /api/arkiv?action=auditTrail", async () => {
      // Seed data into global adapter
      const { arkiv } = await import("../src/lib/arkiv/adapter");
      arkiv.setMockMode(true);
      arkiv.clearMemory();

      await arkiv.createSubCampaign({
        campaignId: 500,
        subVaultId: 1,
        category: "Hygiene Kits",
        budgetCeiling: 20000,
        targetSpecifications: "500 family hygiene kits",
        ipfsManifestCid: "bafyhygiene",
      });

      await arkiv.recordRankedBids(500, 1, {
        rank1Vendor: vendor1Wallet,
        rank1Amount: 18000,
      });

      const req = new NextRequest("http://localhost:3000/api/arkiv?action=auditTrail&campaignId=500&subVaultId=1");
      const res = await GET(req);
      expect(res.status).to.equal(200);

      const json = await res.json();
      expect(json.success).to.be.true;
      expect(json.campaignId).to.equal(500);
      expect(json.subVaultId).to.equal(1);
      expect(json.events).to.be.an("array");
      expect(json.events.length).to.be.greaterThanOrEqual(3);
    });

    it("should return 400 Bad Request when action=auditTrail is missing campaignId", async () => {
      const req = new NextRequest("http://localhost:3000/api/arkiv?action=auditTrail");
      const res = await GET(req);
      expect(res.status).to.equal(400);

      const json = await res.json();
      expect(json.success).to.be.false;
      expect(json.error).to.include("campaignId");
    });
  });
});
