import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { OpenAidEscrow, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Creator campaign controls: closeFundingEarly + cancelCampaign.
 * Invariant under test: neither function lets the creator (or anyone) take custody of
 * escrowed funds — money can still only reach the winning vendor or return to donors.
 */
describe("OpenAidEscrow — Creator campaign controls", () => {
  let usdc: MockUSDC;
  let escrow: OpenAidEscrow;
  let ngo: SignerWithAddress, stranger: SignerWithAddress, donor1: SignerWithAddress, donor2: SignerWithAddress;
  let vendor: SignerWithAddress, vals: SignerWithAddress[];

  const U = (n: string) => ethers.parseUnits(n, 6);
  const BUDGET = U("10000");
  const DAY = 86_400;
  const S = { FundingActive: 0, FundingFailed: 1, BiddingCommit: 2, BiddingReveal: 3, AwaitingDelivery: 5, VerificationPending: 7, InChallengePeriod: 9, Completed: 11, Cancelled: 13 };

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    [, ngo, stranger, donor1, donor2, vendor] = signers;
    vals = signers.slice(6, 11);
    usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
    escrow = await (await ethers.getContractFactory("OpenAidEscrow")).deploy(await usdc.getAddress(), vals.map((v) => v.address));
    for (const a of [donor1, donor2, vendor]) {
      await usdc.transfer(a.address, U("20000"));
      await usdc.connect(a).approve(await escrow.getAddress(), ethers.MaxUint256);
    }
    await escrow.connect(ngo).createCampaign(BUDGET, 7 * DAY, 30 * DAY, "bafy-meta");
  });

  const escrowBalance = async () => usdc.balanceOf(await escrow.getAddress());

  describe("closeFundingEarly", () => {
    it("only the creator can close funding early", async () => {
      await escrow.connect(donor1).depositFunds(1, U("4000"));
      await expect(escrow.connect(stranger).closeFundingEarly(1)).to.be.revertedWithCustomError(escrow, "Unauthorized");
      await expect(escrow.connect(donor1).closeFundingEarly(1)).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("requires at least one donation", async () => {
      await expect(escrow.connect(ngo).closeFundingEarly(1)).to.be.revertedWithCustomError(escrow, "ZeroAmount");
    });

    it("cannot be used after the funding deadline (use triggerFundingTimeout)", async () => {
      await escrow.connect(donor1).depositFunds(1, U("4000"));
      await time.increase(8 * DAY);
      await expect(escrow.connect(ngo).closeFundingEarly(1)).to.be.revertedWithCustomError(escrow, "DeadlinePassed");
    });

    it("lowers the budget to the amount raised, moves to procurement, and emits events", async () => {
      await escrow.connect(donor1).depositFunds(1, U("4000"));
      await escrow.connect(donor2).depositFunds(1, U("2000"));
      await expect(escrow.connect(ngo).closeFundingEarly(1))
        .to.emit(escrow, "FundingClosedEarly").withArgs(1, BUDGET, U("6000"))
        .and.to.emit(escrow, "CampaignFullyFunded").withArgs(1, U("6000"))
        .and.to.emit(escrow, "StateTransition").withArgs(1, S.FundingActive, S.BiddingCommit);
      const c = await escrow.getCampaign(1);
      expect(c.budgetCeiling).to.equal(U("6000"));
      expect(c.state).to.equal(S.BiddingCommit);
      expect(await escrowBalance()).to.equal(U("6000"));
      await expect(escrow.connect(ngo).closeFundingEarly(1)).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("blocks further deposits and caps bids and bonds at the new budget", async () => {
      await escrow.connect(donor1).depositFunds(1, U("6000"));
      await escrow.connect(ngo).closeFundingEarly(1);
      await expect(escrow.connect(donor2).depositFunds(1, U("1"))).to.be.revertedWithCustomError(escrow, "InvalidState");

      await escrow.openAuction(1, 3600, 3600);
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const tooHigh = U("7000");
      await escrow.connect(vendor).commitBid(1, ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [tooHigh, salt, vendor.address]));
      expect((await escrow.getCommitment(1, vendor.address)).bondAmount).to.equal(U("300")); // 5% of 6,000
      await time.increase(3601);
      await escrow.advanceToReveal(1);
      await expect(escrow.connect(vendor).revealBid(1, tooHigh, salt)).to.be.revertedWithCustomError(escrow, "BidExceedsBudget");
    });

    it("settles end-to-end on the reduced budget; creator never receives funds; escrow drains exactly", async () => {
      await escrow.connect(donor1).depositFunds(1, U("4000"));
      await escrow.connect(donor2).depositFunds(1, U("2000"));
      await escrow.connect(ngo).closeFundingEarly(1);
      await escrow.openAuction(1, 3600, 3600);
      const bid = U("5000");
      const salt = ethers.hexlify(ethers.randomBytes(32));
      await escrow.connect(vendor).commitBid(1, ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bid, salt, vendor.address]));
      await time.increase(3601);
      await escrow.advanceToReveal(1);
      await escrow.connect(vendor).revealBid(1, bid, salt);
      await time.increase(3601);
      await escrow.finalizeAuction(1);
      await escrow.connect(vendor).submitDeliveryEvidence(1, "bafy-evidence");
      for (const v of vals.slice(0, 3)) await escrow.connect(v).castVote(1, true, 60);
      await time.increase(61);
      const ngoBefore = await usdc.balanceOf(ngo.address);
      await escrow.finalizeSettlement(1);
      expect(await usdc.balanceOf(ngo.address)).to.equal(ngoBefore);
      expect((await escrow.getCampaign(1)).state).to.equal(S.Completed);
      // Surplus = 6,000 − 5,000 = 1,000, refunded pro-rata (4:2).
      await escrow.connect(donor1).claimRefund(1);
      await escrow.connect(donor2).claimRefund(1);
      // 666.666666 + 333.333333 USDC refunded: pre-existing pro-rata integer division in
      // claimRefund leaves 1 base unit (0.000001 USDC) of rounding dust. Nothing else remains.
      expect(await escrowBalance()).to.equal(1n);
    });
  });

  describe("cancelCampaign", () => {
    it("only the creator can cancel", async () => {
      await expect(escrow.connect(stranger).cancelCampaign(1)).to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("cancels during funding; every donor reclaims 100%; creator receives nothing", async () => {
      await escrow.connect(donor1).depositFunds(1, U("3000"));
      await escrow.connect(donor2).depositFunds(1, U("1500"));
      const ngoBefore = await usdc.balanceOf(ngo.address);
      await expect(escrow.connect(ngo).cancelCampaign(1))
        .to.emit(escrow, "CampaignCancelled").withArgs(1, ngo.address, U("4500"))
        .and.to.emit(escrow, "StateTransition").withArgs(1, S.FundingActive, S.Cancelled);
      expect((await escrow.getCampaign(1)).state).to.equal(S.Cancelled);
      expect(await usdc.balanceOf(ngo.address)).to.equal(ngoBefore);

      const d1 = await usdc.balanceOf(donor1.address);
      await expect(escrow.connect(donor1).claimRefund(1)).to.emit(escrow, "RefundClaimed").withArgs(1, donor1.address, U("3000"));
      expect(await usdc.balanceOf(donor1.address)).to.equal(d1 + U("3000"));
      await escrow.connect(donor2).claimRefund(1);
      await expect(escrow.connect(donor1).claimRefund(1)).to.be.revertedWithCustomError(escrow, "NoRefundDue");
      await expect(escrow.connect(stranger).claimRefund(1)).to.be.revertedWithCustomError(escrow, "NoRefundDue");
      expect(await escrowBalance()).to.equal(0n);
    });

    it("can cancel a campaign with no donations", async () => {
      await escrow.connect(ngo).cancelCampaign(1);
      expect((await escrow.getCampaign(1)).state).to.equal(S.Cancelled);
    });

    it("can cancel after full funding but before the auction opens (no bonds held)", async () => {
      await escrow.connect(donor1).depositFunds(1, BUDGET);
      expect((await escrow.getCampaign(1)).state).to.equal(S.BiddingCommit);
      await expect(escrow.connect(ngo).cancelCampaign(1)).to.emit(escrow, "StateTransition").withArgs(1, S.BiddingCommit, S.Cancelled);
      await escrow.connect(donor1).claimRefund(1);
      expect(await escrowBalance()).to.equal(0n);
    });

    it("cannot cancel once the auction is open (vendor bonds may be locked)", async () => {
      await escrow.connect(donor1).depositFunds(1, BUDGET);
      await escrow.openAuction(1, 3600, 3600);
      await expect(escrow.connect(ngo).cancelCampaign(1)).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("a cancelled campaign is terminal: no deposits, no early close, no timeout, no second cancel", async () => {
      await escrow.connect(donor1).depositFunds(1, U("100"));
      await escrow.connect(ngo).cancelCampaign(1);
      await expect(escrow.connect(donor2).depositFunds(1, U("1"))).to.be.revertedWithCustomError(escrow, "InvalidState");
      await expect(escrow.connect(ngo).closeFundingEarly(1)).to.be.revertedWithCustomError(escrow, "InvalidState");
      await expect(escrow.connect(ngo).cancelCampaign(1)).to.be.revertedWithCustomError(escrow, "InvalidState");
      await time.increase(8 * DAY);
      await expect(escrow.triggerFundingTimeout(1)).to.be.revertedWithCustomError(escrow, "InvalidState");
      await expect(escrow.openAuction(1, 60, 60)).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("cancelling one campaign does not affect another campaign's escrow", async () => {
      await escrow.connect(ngo).createCampaign(BUDGET, 7 * DAY, 30 * DAY, "bafy-meta-2");
      await escrow.connect(donor1).depositFunds(1, U("1000"));
      await escrow.connect(donor2).depositFunds(2, U("2000"));
      await escrow.connect(ngo).cancelCampaign(1);
      await escrow.connect(donor1).claimRefund(1);
      expect(await escrowBalance()).to.equal(U("2000"));
      expect((await escrow.getCampaign(2)).state).to.equal(S.FundingActive);
      await expect(escrow.connect(donor2).claimRefund(2)).to.be.revertedWithCustomError(escrow, "InvalidState");
    });
  });
});
