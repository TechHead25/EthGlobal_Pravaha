import { expect } from "chai";
import { ArkivAdapter } from "../src/lib/arkiv/adapter";
import { ProcurementRequestEntity, ProcurementBidEntity } from "../src/lib/arkiv/types";

describe("Arkiv Adapter — Decentralized Entity Management", () => {
  let adapter: ArkivAdapter;
  const ngoWallet = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const vendorWallet = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const attackerWallet = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

  beforeEach(() => {
    adapter = new ArkivAdapter();
  });

  it("should query pre-seeded demo entities", async () => {
    const requests = await adapter.queryEntities({ type: "ProcurementRequest" });
    expect(requests.length).to.be.gte(1);
    expect(requests[0].id).to.equal("req_campaign_1");
  });

  it("should create a wallet-owned procurement request and retrieve it", async () => {
    const now = Math.floor(Date.now() / 1000);
    const newRequest: ProcurementRequestEntity = {
      id: "req_campaign_2",
      type: "ProcurementRequest",
      owner: ngoWallet,
      createdAt: now,
      expiresAt: now + 3600,
      campaignId: 2,
      title: "Medical Triage Kits",
      itemCategory: "First Aid",
      itemCount: 200,
      itemUnit: "kits",
      budgetCeilingUSDC: 5000,
      targetRegion: "Zone 2",
      status: "Funding",
      metadataCid: "bafybeimedicalkits",
    };

    await adapter.createEntity(newRequest, ngoWallet);

    const retrieved = await adapter.getEntity("req_campaign_2");
    expect(retrieved).to.not.be.null;
    expect((retrieved as ProcurementRequestEntity).itemCount).to.equal(200);
  });

  it("should enforce wallet ownership: non-owners cannot mutate an entity", async () => {
    let error: any = null;
    try {
      await adapter.updateEntity(
        "req_campaign_1",
        { status: "Settled" },
        attackerWallet
      );
    } catch (err: any) {
      error = err;
    }
    expect(error).to.not.be.null;
    expect(error.message).to.include("UnauthorizedUpdate");
  });

  it("should filter out expired entities when activeOnly is true", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredBid: ProcurementBidEntity = {
      id: "bid_expired_test",
      type: "ProcurementBid",
      owner: vendorWallet,
      createdAt: now - 7200,
      expiresAt: now - 3600, // expired 1 hour ago
      campaignId: 1,
      vendorAddress: vendorWallet,
      commitHash: "0xabcdef",
      status: "Expired",
    };

    // Force inserting expired entity for test
    (adapter as any).entities.set(expiredBid.id, expiredBid);

    const activeEntities = await adapter.queryEntities({ activeOnly: true, type: "ProcurementBid" });
    const hasExpired = activeEntities.some((e) => e.id === "bid_expired_test");
    expect(hasExpired).to.be.false;

    const allEntities = await adapter.queryEntities({ activeOnly: false, type: "ProcurementBid" });
    const hasInAll = allEntities.some((e) => e.id === "bid_expired_test");
    expect(hasInAll).to.be.true;
  });

  it("should reject storing sensitive PII keywords in public entities", async () => {
    const now = Math.floor(Date.now() / 1000);
    const piiEntity: any = {
      id: "req_leaky",
      type: "ProcurementRequest",
      owner: ngoWallet,
      createdAt: now,
      expiresAt: now + 3600,
      campaignId: 99,
      title: "Secret Patient Record with passport and ssn numbers",
      itemCategory: "PII",
      itemCount: 1,
      itemUnit: "records",
      budgetCeilingUSDC: 100,
      targetRegion: "Leaked",
      status: "Funding",
      metadataCid: "leaked_cid",
    };

    let error: any = null;
    try {
      await adapter.createEntity(piiEntity, ngoWallet);
    } catch (err: any) {
      error = err;
    }
    expect(error).to.not.be.null;
    expect(error.message).to.include("PrivacyViolation");
  });
});
