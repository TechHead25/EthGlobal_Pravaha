import { expect } from "chai";
import { ethers } from "ethers";
import { computeFundFlow, donorShare, estimateRefund, isActiveState, sumFlows, utilizationBps } from "../src/lib/escrow/fund-flow";
import { escrowInterface, mergeEvents, parseEscrowLogs } from "../src/lib/escrow/reader";
import { describeEvent, involves } from "../src/lib/escrow/activity";
import { rankBids } from "../src/lib/escrow/ranking";
import type { CampaignView, EscrowEvent } from "../src/lib/escrow/types";
import { ZERO_ADDRESS } from "../src/lib/escrow/types";
import { activeChild, navFor } from "../src/components/app/nav-config";
import { normalizeRoles, type Principal } from "../src/lib/auth/roles";

const USDC = (n: number) => BigInt(Math.round(n * 1e6));
const VENDOR = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
const DONOR = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";

function campaign(over: Partial<CampaignView> = {}): CampaignView {
  return {
    id: 1, creator: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", budgetCeiling: USDC(10_000).toString(), totalDeposited: USDC(10_000).toString(),
    fundingDeadline: 1, deliveryDeadline: 2, metadataCid: "", state: 0, stateLabel: "", winningVendor: ZERO_ADDRESS, winningBidAmount: "0",
    evidenceIpfsCid: "", evidenceSubmittedAt: 0, affirmativeVotes: 0, negativeVotes: 0, stage1Paid: false, stage2Paid: false, challengeExpiry: 0,
    isDisputed: false, disputeEvidenceCid: "", challenger: ZERO_ADDRESS, commitDeadline: 0, revealDeadline: 0, vendorCount: 0, metadata: null, ...over,
  };
}

function ev(name: string, args: Record<string, string>, i = 0, campaignId = 1): EscrowEvent {
  return { key: `0xtx${i}:${i}`, name, campaignId, blockNumber: 100 + i, logIndex: i, txHash: `0xtx${i}`, args: { campaignId: String(campaignId), ...args } };
}

describe("Shared fund-flow model", () => {
  it("funding stage: everything donated is held in escrow, nothing awarded", () => {
    const f = computeFundFlow(campaign({ state: 0, totalDeposited: USDC(4000).toString() }));
    expect(f.donated).to.equal(USDC(4000));
    expect(f.inEscrow).to.equal(USDC(4000));
    expect(f.awarded).to.equal(0n);
    expect(f.stage1).to.equal("not_applicable");
    expect(f.refundsOpen).to.equal(false);
  });

  it("after award: surplus = budget − winning bid; milestones locked", () => {
    const f = computeFundFlow(campaign({ state: 5, winningVendor: VENDOR, winningBidAmount: USDC(8000).toString() }));
    expect(f.awarded).to.equal(USDC(8000));
    expect(f.surplus).to.equal(USDC(2000));
    expect(f.stage1).to.equal("locked");
    expect(f.stage2).to.equal("locked");
  });

  it("uses exact Stage1Settled event amounts and reduces escrow accordingly (70/30, matching V1)", () => {
    const c = campaign({ state: 9, winningVendor: VENDOR, winningBidAmount: USDC(8000).toString(), stage1Paid: true, challengeExpiry: 1000 });
    const events = [ev("Stage1Settled", { vendor: VENDOR, payoutAmount: USDC(5600).toString() })];
    const f = computeFundFlow(c, events, 500);
    expect(f.stage1Released).to.equal(USDC(5600));
    expect(f.released).to.equal(USDC(5600));
    expect(f.inEscrow).to.equal(USDC(4400));
    expect(f.awardOutstanding).to.equal(USDC(2400));
    expect(f.stage1).to.equal("released");
    expect(f.stage2).to.equal("locked");
    expect(computeFundFlow(c, events, 2000).stage2).to.equal("eligible");
  });

  it("derives releases from state flags when events are not available", () => {
    const f = computeFundFlow(campaign({ state: 11, winningVendor: VENDOR, winningBidAmount: USDC(8000).toString(), stage1Paid: true, stage2Paid: true }));
    expect(f.released).to.equal(USDC(8000));
    expect(f.basis).to.equal("state");
    expect(f.refundsOpen).to.equal(true); // 2,000 surplus refundable
  });

  it("ignores other campaigns' events and counts refunds", () => {
    const c = campaign({ state: 1 });
    const events = [ev("RefundClaimed", { donor: DONOR, amount: USDC(1000).toString() }, 1), ev("RefundClaimed", { donor: DONOR, amount: USDC(999).toString() }, 2, 2)];
    const f = computeFundFlow(c, events);
    expect(f.refunded).to.equal(USDC(1000));
    expect(f.inEscrow).to.equal(USDC(9000));
    expect(f.refundsOpen).to.equal(true);
  });

  it("upheld dispute withholds stage 2", () => {
    const f = computeFundFlow(campaign({ state: 11, winningVendor: VENDOR, winningBidAmount: USDC(8000).toString(), stage1Paid: true, isDisputed: true }));
    expect(f.stage2).to.equal("withheld");
    expect(f.refundsOpen).to.equal(true);
  });

  it("donor share is pro-rata with exact own refunds", () => {
    const c = campaign({ state: 9, winningVendor: VENDOR, winningBidAmount: USDC(8000).toString(), stage1Paid: true });
    const f = computeFundFlow(c, [ev("Stage1Settled", { vendor: VENDOR, payoutAmount: USDC(5600).toString() })]);
    const s = donorShare(f, c, USDC(2500), 0n);
    expect(s.shareBps).to.equal(2500);
    expect(s.releasedShare).to.equal(USDC(1400));
    expect(s.awardedShare).to.equal(USDC(2000));
    expect(s.inEscrowShare).to.equal(USDC(1100));
  });

  it("refund estimate mirrors claimRefund branches", () => {
    expect(estimateRefund(campaign({ state: 4 }), USDC(100), 0n, false)).to.equal(USDC(100));
    expect(estimateRefund(campaign({ state: 4 }), USDC(100), 0n, true)).to.equal(0n);
    expect(estimateRefund(campaign({ state: 5 }), USDC(100), 0n, false)).to.equal(0n);
    expect(estimateRefund(campaign({ state: 11, totalDeposited: USDC(10_000).toString() }), USDC(1000), USDC(2000), false)).to.equal(USDC(200));
  });

  it("aggregates portfolios and utilization", () => {
    const a = computeFundFlow(campaign({ state: 0, totalDeposited: USDC(100).toString() }));
    const b = computeFundFlow(campaign({ id: 2, state: 11, winningVendor: VENDOR, winningBidAmount: USDC(100).toString(), totalDeposited: USDC(100).toString(), budgetCeiling: USDC(100).toString(), stage1Paid: true, stage2Paid: true }));
    const t = sumFlows([a, b]);
    expect(t.donated).to.equal(USDC(200));
    expect(t.released).to.equal(USDC(100));
    expect(utilizationBps(t.released, t.donated)).to.equal(5000);
    expect(isActiveState(0)).to.equal(true);
    expect(isActiveState(11)).to.equal(false);
  });
});

describe("Live event layer: parsing, de-duplication, activity", () => {
  it("parses real escrow logs and keys them by txHash:logIndex", () => {
    const frag = escrowInterface.getEvent("FundsDeposited")!;
    const enc = escrowInterface.encodeEventLog(frag, [7n, DONOR, USDC(50)]);
    const log = { ...enc, address: ethers.ZeroAddress, blockNumber: 10, blockHash: ethers.ZeroHash, transactionHash: "0xabc", transactionIndex: 0, index: 3, removed: false } as unknown as ethers.Log;
    const [e] = parseEscrowLogs([log]);
    expect(e.name).to.equal("FundsDeposited");
    expect(e.campaignId).to.equal(7);
    expect(e.key).to.equal("0xabc:3");
    expect(e.args.amount).to.equal(USDC(50).toString());
    expect(parseEscrowLogs([{ ...log, topics: [ethers.ZeroHash] } as unknown as ethers.Log])).to.have.length(0);
  });

  it("merging never duplicates an event and keeps known timestamps", () => {
    const a = { ...ev("FundsDeposited", { donor: DONOR, amount: "1" }, 1), timestamp: 111 };
    const b = ev("VoteCast", { validator: VENDOR, approved: "true" }, 2);
    const merged = mergeEvents([a], [{ ...a, timestamp: undefined }, b, b]);
    expect(merged).to.have.length(2);
    expect(merged.find((e) => e.key === a.key)!.timestamp).to.equal(111);
    expect(merged[0].blockNumber).to.be.greaterThan(merged[1].blockNumber);
  });

  it("describes events and detects involvement", () => {
    expect(describeEvent(ev("VoteCast", { validator: VENDOR, approved: "false" })).detail).to.equal("Rejected delivery");
    expect(describeEvent(ev("Stage1Settled", {})).title).to.match(/70%/);
    expect(involves(ev("BidRevealed", { vendor: VENDOR, amount: "1" }), VENDOR.toLowerCase())).to.equal(true);
    expect(involves(ev("BidRevealed", { vendor: VENDOR, amount: "1" }), DONOR)).to.equal(false);
  });
});

describe("Bid ranking (contract rule)", () => {
  const bid = (vendor: string, amount: number, at: number, revealed = true) => ({ vendor, commitment: { revealed, revealedAmount: USDC(amount), revealedAt: at } });
  it("lowest revealed bid wins, ties broken by earliest reveal, unrevealed excluded", () => {
    const r = rankBids([bid("A", 900, 5), bid("B", 800, 9), bid("C", 800, 3), bid("D", 100, 1, false), bid("E", 0, 1)]);
    expect(r.map((b) => b.vendor)).to.deep.equal(["C", "B", "A"]);
  });
});

describe("Role navigation", () => {
  const p = (roles: string[]): Principal => ({ id: "u", email: "e", name: null, image: null, status: "ACTIVE", roles: normalizeRoles(roles), worldIdVerifiedAt: null });
  const hrefs = (principal: Principal) => navFor(principal).flatMap((s) => s.items.map((i) => i.href));

  it("members see no role dashboards; pending/rejected requests grant nothing", () => {
    const h = hrefs(p([]));
    for (const r of ["/app/donor", "/app/ngo", "/app/vendor", "/app/validator", "/app/admin"]) expect(h).to.not.include(r);
    expect(h).to.include("/app/access");
  });

  it("approved roles add exactly their dashboard, with role-specific sub-navigation", () => {
    const h = hrefs(p(["NGO", "VENDOR"]));
    expect(h).to.include.members(["/app/ngo", "/app/vendor"]);
    expect(h).to.not.include("/app/validator");
    const ngo = navFor(p(["NGO"])).flatMap((s) => s.items).find((i) => i.href === "/app/ngo")!;
    expect(ngo.children!.map((c) => c.href)).to.include.members(["/app/ngo/campaigns", "/app/ngo/procurement", "/app/ngo/delivery"]);
  });

  it("admin navigation is unchanged and still excludes operational dashboards", () => {
    const h = hrefs(p(["ADMIN"]));
    expect(h).to.include.members(["/app/admin", "/app/admin/requests", "/app/admin/users", "/app/admin/audit", "/app/console"]);
    expect(h).to.not.include.members(["/app/donor", "/app/validator"]);
  });

  it("suspended accounts get no navigation", () => {
    expect(navFor({ ...p(["ADMIN", "DONOR"]), status: "SUSPENDED" })).to.have.length(0);
  });

  it("sub-navigation highlights the most specific match", () => {
    const children = [{ href: "/app/ngo" }, { href: "/app/ngo/campaigns" }, { href: "/app/ngo/campaigns/new" }];
    expect(activeChild(children, "/app/ngo/campaigns/new")).to.equal("/app/ngo/campaigns/new");
    expect(activeChild(children, "/app/ngo/campaigns")).to.equal("/app/ngo/campaigns");
    expect(activeChild(children, "/app/ngo")).to.equal("/app/ngo");
  });
});
