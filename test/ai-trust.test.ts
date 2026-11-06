/**
 * @file ai-trust.test.ts
 * @notice Test suite for Google Gemini Invoice Extraction, Spec Comparator,
 * and Vendor Trust-Score Engine with Proof-of-Work Deduplication.
 */

import { expect } from "chai";
import { geminiExtractor, ExtractedInvoice } from "../src/lib/ai/gemini";
import { specComparator, ProcurementSpec } from "../src/lib/ai/comparator";
import {
  vendorTrustEngine,
  VendorDeliveryHistory,
  MIN_TRUST_THRESHOLD,
  NEW_VENDOR_BASELINE_SCORE,
} from "../src/lib/trust/engine";

describe("OpenAid AI & Vendor Trust Architecture", () => {
  beforeEach(() => {
    vendorTrustEngine.reset();
  });

  describe("1. Vendor Trust-Score Engine (Mathematical Fixtures)", () => {
    it("should assign baseline score of 50 to new vendors with 0 completed contracts", () => {
      const newVendorHistory: VendorDeliveryHistory = {
        vendorAddress: "0x1111111111111111111111111111111111111111",
        completedContracts: 0,
        onTimeDeliveries: 0,
        specMatchRates: [],
        upheldDisputes: 0,
      };

      const result = vendorTrustEngine.calculateTrustScore(newVendorHistory);

      expect(result.score).to.equal(NEW_VENDOR_BASELINE_SCORE);
      expect(result.isNewVendor).to.be.true;
      expect(result.qualifies).to.be.true; // 50 >= 40
      expect(result.minThreshold).to.equal(MIN_TRUST_THRESHOLD);
      expect(result.explanation).to.include("baseline trust score of 50");
      expect(result.disqualifyReasons).to.have.lengthOf(0);
    });

    it("should calculate perfect 100/100 score for flawless delivery history", () => {
      // 10 contracts: 10 on-time (100%), 100% spec match, 0 disputes (0%)
      // rawScore = 0.5 * 100 + 0.5 * 100 - 1.0 * 0 = 100
      const flawlessHistory: VendorDeliveryHistory = {
        vendorAddress: "0x2222222222222222222222222222222222222222",
        completedContracts: 10,
        onTimeDeliveries: 10,
        specMatchRates: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
        upheldDisputes: 0,
      };

      const result = vendorTrustEngine.calculateTrustScore(flawlessHistory);

      expect(result.score).to.equal(100);
      expect(result.qualifies).to.be.true;
      expect(result.metrics.onTimeRate).to.equal(100);
      expect(result.metrics.specMatch).to.equal(100);
      expect(result.metrics.disputeRate).to.equal(0);
      expect(result.explanation).to.include("Qualifies for bidding and backup vendor fallback");
    });

    it("should accurately compute score at the edge threshold (40/100)", () => {
      // 5 contracts: 4 on-time (80%), average specMatch 80%, 2 disputes (40%)
      // rawScore = 0.5 * 80 + 0.5 * 80 - 1.0 * 40 = 40 + 40 - 40 = 40
      const edgeHistory: VendorDeliveryHistory = {
        vendorAddress: "0x3333333333333333333333333333333333333333",
        completedContracts: 5,
        onTimeDeliveries: 4,
        specMatchRates: [80, 80, 80, 80, 80],
        upheldDisputes: 2,
      };

      const result = vendorTrustEngine.calculateTrustScore(edgeHistory);

      expect(result.score).to.equal(40);
      expect(result.qualifies).to.be.true; // 40 >= 40
      expect(result.metrics.rawScore).to.equal(40);
    });

    it("should disqualify vendor whose score falls below minimum threshold of 40", () => {
      // 10 contracts: 5 on-time (50%), average specMatch 60%, 4 disputes (40%)
      // rawScore = 0.5 * 50 + 0.5 * 60 - 1.0 * 40 = 25 + 30 - 40 = 15
      const underperforming: VendorDeliveryHistory = {
        vendorAddress: "0x4444444444444444444444444444444444444444",
        completedContracts: 10,
        onTimeDeliveries: 5,
        specMatchRates: [60, 60, 60, 60, 60, 60, 60, 60, 60, 60],
        upheldDisputes: 4,
      };

      const result = vendorTrustEngine.calculateTrustScore(underperforming);

      expect(result.score).to.equal(15);
      expect(result.qualifies).to.be.false;
      expect(result.explanation).to.include("Disqualified");
      expect(result.disqualifyReasons.length).to.be.greaterThan(0);
      expect(result.disqualifyReasons[0]).to.include("falls below minimum threshold");
    });

    it("should clamp negative raw scores to 0", () => {
      // 2 contracts: 0 on-time (0%), specMatch 20%, 2 disputes (100%)
      // rawScore = 0.5 * 0 + 0.5 * 20 - 1.0 * 100 = 10 - 100 = -90
      const catastrophic: VendorDeliveryHistory = {
        vendorAddress: "0x5555555555555555555555555555555555555555",
        completedContracts: 2,
        onTimeDeliveries: 0,
        specMatchRates: [20, 20],
        upheldDisputes: 2,
      };

      const result = vendorTrustEngine.calculateTrustScore(catastrophic);

      expect(result.score).to.equal(0);
      expect(result.metrics.rawScore).to.equal(-90);
      expect(result.qualifies).to.be.false;
    });

    it("should update score dynamically via recordDelivery and recordDispute", () => {
      const vendor = "0x6666666666666666666666666666666666666666";

      // Initially new vendor (50)
      let trust = vendorTrustEngine.getVendorTrust(vendor);
      expect(trust.score).to.equal(50);
      expect(trust.isNewVendor).to.be.true;

      // Complete 1 on-time delivery with 100% spec match
      trust = vendorTrustEngine.recordDelivery(vendor, {
        campaignId: 1,
        onTime: true,
        specMatchRate: 100,
        disputeUpheld: false,
        timestamp: Date.now(),
      });
      // 1 contract: onTime 100%, spec 100%, dispute 0% -> rawScore = 50 + 50 = 100
      expect(trust.score).to.equal(100);
      expect(trust.isNewVendor).to.be.false;

      // Add 1 upheld dispute
      trust = vendorTrustEngine.recordDispute(vendor);
      // 1 contract, dispute rate = (1 / 1) * 100 = 100%
      // rawScore = 50 + 50 - 100 = 0
      expect(trust.score).to.equal(0);
      expect(trust.qualifies).to.be.false;
    });
  });

  describe("2. Google Gemini Invoice Extraction (Fail-Closed Architecture)", () => {
    const validMockInvoice: ExtractedInvoice = {
      vendorName: "Apex Relief Supplies Ltd",
      taxId: "TAX-GB-99281928",
      invoiceNumber: "INV-2026-RELIEF-001",
      date: "2026-11-06",
      items: [
        {
          description: "Emergency Thermal Blankets",
          quantity: 500,
          unitPrice: 20,
          totalPrice: 10000,
        },
      ],
      totalAmount: 10000,
      currency: "USDC",
    };

    it("should successfully extract structured invoice from valid mock payload", async () => {
      const result = await geminiExtractor.extractInvoice(
        JSON.stringify(validMockInvoice),
        { data: validMockInvoice }
      );

      expect(result.verified).to.be.true;
      expect(result.data).to.not.be.undefined;
      expect(result.data?.vendorName).to.equal("Apex Relief Supplies Ltd");
      expect(result.data?.totalAmount).to.equal(10000);
      expect(result.data?.items).to.have.lengthOf(1);
      expect(result.data?.items[0].quantity).to.equal(500);
    });

    it("should strictly fail closed with verified: false on AI model / API error", async () => {
      const result = await geminiExtractor.extractInvoice("bad document", {
        shouldFail: true,
        errorMessage: "AI extraction failure: Rate limit or invalid API key",
      });

      expect(result.verified).to.be.false;
      expect(result.data).to.be.undefined;
      expect(result.error).to.include("AI extraction failure");
    });

    it("should fail closed on malformed document JSON missing required schema fields", async () => {
      // Missing items and totalAmount
      const malformedJson = JSON.stringify({
        vendorName: "Dodgy Supplier",
        taxId: "UNKNOWN",
      });

      const result = await geminiExtractor.extractInvoice(malformedJson);

      expect(result.verified).to.be.false;
      expect(result.error).to.include("AI extraction failure");
    });
  });

  describe("3. Automated Spec Comparator", () => {
    const baseSpec: ProcurementSpec = {
      campaignId: 1,
      subVaultId: "sub-vault-blankets",
      winningBidAmount: 10000,
      vendorAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
      items: [
        {
          name: "Emergency Thermal Blankets",
          requiredQuantity: 500,
          maxUnitPrice: 20,
          allowedSubstitutions: ["Fleece Relief Blankets", "Wool Emergency Blankets"],
        },
      ],
    };

    it("should return match: true and 100 confidence for exact compliant invoice", () => {
      const compliantInvoice: ExtractedInvoice = {
        vendorName: "Apex Relief Supplies",
        taxId: "TAX-12345",
        invoiceNumber: "INV-101",
        items: [
          {
            description: "Emergency Thermal Blankets",
            quantity: 500,
            unitPrice: 20,
            totalPrice: 10000,
          },
        ],
        totalAmount: 10000,
        currency: "USDC",
      };

      const result = specComparator.compare(compliantInvoice, baseSpec);

      expect(result.match).to.be.true;
      expect(result.confidenceScore).to.equal(100);
      expect(result.itemMatchRate).to.equal(100);
      expect(result.discrepancies).to.have.lengthOf(0);
      expect(result.details.quantityShortfalls).to.have.lengthOf(0);
      expect(result.details.priceExceeded).to.be.false;
    });

    it("should accept valid allowed substitutions without penalty", () => {
      const substitutedInvoice: ExtractedInvoice = {
        vendorName: "Apex Relief Supplies",
        taxId: "TAX-12345",
        invoiceNumber: "INV-102",
        items: [
          {
            description: "Fleece Relief Blankets", // Approved substitution
            quantity: 500,
            unitPrice: 20,
            totalPrice: 10000,
          },
        ],
        totalAmount: 10000,
        currency: "USDC",
      };

      const result = specComparator.compare(substitutedInvoice, baseSpec);

      expect(result.match).to.be.true;
      expect(result.confidenceScore).to.equal(100);
      expect(result.itemMatchRate).to.equal(100);
      expect(result.details.unapprovedSubstitutions).to.have.lengthOf(0);
    });

    it("should flag quantity shortfalls and reduce confidence score", () => {
      const shortfallInvoice: ExtractedInvoice = {
        vendorName: "Apex Relief Supplies",
        taxId: "TAX-12345",
        invoiceNumber: "INV-103",
        items: [
          {
            description: "Emergency Thermal Blankets",
            quantity: 400, // Shortfall of 100 blankets
            unitPrice: 20,
            totalPrice: 8000,
          },
        ],
        totalAmount: 8000,
        currency: "USDC",
      };

      const result = specComparator.compare(shortfallInvoice, baseSpec);

      expect(result.match).to.be.false;
      expect(result.confidenceScore).to.be.lessThan(100);
      expect(result.itemMatchRate).to.equal(0);
      expect(result.details.quantityShortfalls).to.have.lengthOf(1);
      expect(result.details.quantityShortfalls[0].shortfall).to.equal(100);
      expect(result.discrepancies[0]).to.include("Quantity shortfall");
    });

    it("should flag unapproved item substitutions", () => {
      const unapprovedInvoice: ExtractedInvoice = {
        vendorName: "Apex Relief Supplies",
        taxId: "TAX-12345",
        invoiceNumber: "INV-104",
        items: [
          {
            description: "Emergency Thermal Blankets",
            quantity: 500,
            unitPrice: 20,
            totalPrice: 10000,
          },
          {
            description: "Luxury Goose Down Pillows", // Unapproved item
            quantity: 50,
            unitPrice: 30,
            totalPrice: 1500,
          },
        ],
        totalAmount: 11500,
        currency: "USDC",
      };

      const result = specComparator.compare(unapprovedInvoice, baseSpec);

      expect(result.match).to.be.false;
      expect(result.details.unapprovedSubstitutions).to.include("Luxury Goose Down Pillows");
      expect(result.discrepancies.some((d) => d.includes("Unapproved substitution"))).to.be.true;
    });

    it("should flag invoices where total price exceeds winning bid ceiling", () => {
      const overchargedInvoice: ExtractedInvoice = {
        vendorName: "Apex Relief Supplies",
        taxId: "TAX-12345",
        invoiceNumber: "INV-105",
        items: [
          {
            description: "Emergency Thermal Blankets",
            quantity: 500,
            unitPrice: 25, // Overcharging $25 vs $20
            totalPrice: 12500,
          },
        ],
        totalAmount: 12500, // Exceeds 10,000 cap
        currency: "USDC",
      };

      const result = specComparator.compare(overchargedInvoice, baseSpec);

      expect(result.match).to.be.false;
      expect(result.details.priceExceeded).to.be.true;
      expect(result.details.excessAmount).to.equal(2500);
      expect(result.discrepancies.some((d) => d.includes("Price exceeded"))).to.be.true;
    });
  });

  describe("4. Proof-of-Work Deduplication (HTTP 409 Conflict Guard)", () => {
    it("should register new waybill and manifest CID successfully with 200", () => {
      const result = vendorTrustEngine.checkAndRegisterProof(
        "WB-RELIEF-2026-0001",
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        {
          campaignId: 1,
          vendorAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
        }
      );

      expect(result.success).to.be.true;
      expect(result.status).to.equal(200);
      expect(result.registeredProof).to.not.be.undefined;
      expect(result.registeredProof?.waybillNumber).to.equal("WB-RELIEF-2026-0001");
    });

    it("should reject duplicate waybill with HTTP 409 status code", () => {
      const waybill = "WB-DUPLICATE-WAYBILL-999";
      const cid1 = "bafybeicidfirst00000000000000000000000000000000000000000001";
      const cid2 = "bafybeicidsecond0000000000000000000000000000000000000000002";

      // First submission succeeds
      const first = vendorTrustEngine.checkAndRegisterProof(waybill, cid1, {
        campaignId: 1,
        vendorAddress: "0x1111111111111111111111111111111111111111",
      });
      expect(first.status).to.equal(200);

      // Duplicate submission of same waybill must fail with 409
      const duplicate = vendorTrustEngine.checkAndRegisterProof(waybill, cid2, {
        campaignId: 2,
        vendorAddress: "0x2222222222222222222222222222222222222222",
      });

      expect(duplicate.success).to.be.false;
      expect(duplicate.status).to.equal(409);
      expect(duplicate.error).to.include("Duplicate proof-of-work: Waybill");
    });

    it("should reject reused manifest CID with HTTP 409 status code", () => {
      const waybill1 = "WB-UNIQUE-111";
      const waybill2 = "WB-UNIQUE-222";
      const reusedCid = "bafybeireusedcid000000000000000000000000000000000000000001";

      // First submission succeeds
      const first = vendorTrustEngine.checkAndRegisterProof(waybill1, reusedCid, {
        campaignId: 1,
        vendorAddress: "0x1111111111111111111111111111111111111111",
      });
      expect(first.status).to.equal(200);

      // Reused CID with different waybill must fail with 409
      const reused = vendorTrustEngine.checkAndRegisterProof(waybill2, reusedCid, {
        campaignId: 3,
        vendorAddress: "0x3333333333333333333333333333333333333333",
      });

      expect(reused.success).to.be.false;
      expect(reused.status).to.equal(409);
      expect(reused.error).to.include("Duplicate proof-of-work: Manifest CID");
    });
  });
});
