import { expect } from "chai";
import { ethers } from "ethers";
import { OPENAID_ESCROW_FULL_ABI } from "../src/lib/arc/abis";
import { classifyTxError, computeBidCommitment, decodeEscrowError, isArcChain, requiredBidBond } from "../src/lib/arc/tx";
import { CampaignState } from "../src/lib/arc/types";
import { FULL_REFUND_STATES, lifecycleStatus, presentState } from "../src/lib/protocol";
import { formatTokenAmount, percent } from "../src/lib/utils";

const iface = new ethers.Interface(OPENAID_ESCROW_FULL_ABI);

describe("Wallet & transaction handling", () => {
  it("detects the Arc Testnet chain in every encoding and rejects others", () => {
    expect(isArcChain(5042002)).to.equal(true);
    expect(isArcChain(5042002n)).to.equal(true);
    expect(isArcChain("0x4cef52")).to.equal(true);
    expect(isArcChain("5042002")).to.equal(true);
    expect(isArcChain(1)).to.equal(false);
    expect(isArcChain("0x1")).to.equal(false);
    expect(isArcChain(null)).to.equal(false);
  });

  it("classifies wallet rejection (ethers ACTION_REJECTED and EIP-1193 4001)", () => {
    expect(classifyTxError({ code: "ACTION_REJECTED" }).kind).to.equal("rejected");
    expect(classifyTxError({ code: 4001, message: "User denied" }).kind).to.equal("rejected");
    expect(classifyTxError({ info: { error: { code: 4001 } } }).kind).to.equal("rejected");
  });

  it("classifies wrong network, insufficient funds, and RPC failures", () => {
    expect(classifyTxError({ code: 4901 }).kind).to.equal("wrong_network");
    expect(classifyTxError({ code: "INSUFFICIENT_FUNDS" }).kind).to.equal("insufficient_funds");
    expect(classifyTxError({ code: "TIMEOUT" }).kind).to.equal("rpc");
    expect(classifyTxError({ code: "SERVER_ERROR" }).kind).to.equal("rpc");
  });

  it("decodes OpenAidEscrow custom errors from nested revert data", () => {
    const data = iface.encodeErrorResult("AlreadyVoted", []);
    const err = { code: "CALL_EXCEPTION", info: { error: { data } } };
    const r = classifyTxError(err);
    expect(r.kind).to.equal("reverted");
    expect(r.message).to.match(/already voted/i);
    const st = iface.encodeErrorResult("InvalidState", [5, 7]);
    expect(decodeEscrowError(st)).to.match(/required phase/);
    expect(decodeEscrowError("0xdeadbeef")).to.equal(null);
  });

  it("a reverted receipt is never reported as success", () => {
    expect(classifyTxError({ code: "CALL_EXCEPTION" }).kind).to.equal("reverted");
  });

  it("commit hash matches the contract's keccak256(abi.encodePacked(amount, salt, msg.sender))", () => {
    const amount = 8_500_000_000n;
    const salt = "0x" + "11".repeat(32);
    const vendor = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
    const packed = ethers.concat([ethers.zeroPadValue(ethers.toBeHex(amount), 32), salt, vendor]);
    expect(computeBidCommitment(amount, salt, vendor)).to.equal(ethers.keccak256(packed));
    // Different sender → different hash (prevents commitment theft).
    expect(computeBidCommitment(amount, salt, "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc")).to.not.equal(ethers.keccak256(packed));
  });

  it("computes the 5% bid bond exactly like BOND_BASIS_POINTS = 500", () => {
    expect(requiredBidBond(10_000_000_000n)).to.equal(500_000_000n);
    expect(requiredBidBond(1n)).to.equal(0n);
  });
});

describe("Protocol presentation & data states", () => {
  it("refund-eligible states match the contract's claimRefund branches", () => {
    expect([...FULL_REFUND_STATES].sort((a, b) => a - b)).to.deep.equal([
      CampaignState.FundingFailed,
      CampaignState.AuctionFailed,
      CampaignState.DeliveryFailed,
      CampaignState.VerificationFailed,
    ]);
  });

  it("every on-chain state has a presentation and failed states render as failed", () => {
    for (let s = 0; s <= 12; s++) expect(presentState(s).label).to.be.a("string").and.not.match(/Unknown/);
    expect(presentState(99).label).to.match(/Unknown/);
    expect(lifecycleStatus(CampaignState.AuctionFailed, "procurement")).to.equal("failed");
    expect(lifecycleStatus(CampaignState.AuctionFailed, "funding")).to.equal("done");
    expect(lifecycleStatus(CampaignState.FundingActive, "settlement")).to.equal("upcoming");
    expect(lifecycleStatus(CampaignState.Completed, "settlement")).to.equal("done");
  });

  it("formats 6-decimal USDC amounts without floating-point error", () => {
    expect(formatTokenAmount(1_234_567_890n)).to.equal("1,234.56");
    expect(formatTokenAmount(0n)).to.equal("0");
    expect(formatTokenAmount(1n, 6, 6)).to.equal("0.000001");
    expect(percent(1n, 3n)).to.be.closeTo(33.33, 0.01);
    expect(percent(5n, 0n)).to.equal(0);
  });
});
