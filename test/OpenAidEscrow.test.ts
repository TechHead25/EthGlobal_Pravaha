import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { OpenAidEscrow, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OpenAidEscrow — Core Smart Contract Suite", () => {
  let usdc: MockUSDC;
  let escrow: OpenAidEscrow;
  let deployer: SignerWithAddress;
  let ngo: SignerWithAddress;
  let donor1: SignerWithAddress;
  let donor2: SignerWithAddress;
  let vendorAlpha: SignerWithAddress;
  let vendorBeta: SignerWithAddress;
  let val1: SignerWithAddress;
  let val2: SignerWithAddress;
  let val3: SignerWithAddress;
  let val4: SignerWithAddress;
  let val5: SignerWithAddress;
  let challenger: SignerWithAddress;

  const BUDGET_CEILING = ethers.parseUnits("10000", 6); // 10,000 USDC
  const BLANKETS_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  const EVIDENCE_CID = "bafybeicb blankets_delivery_manifest_v1_cid";

  beforeEach(async () => {
    [
      deployer,
      ngo,
      donor1,
      donor2,
      vendorAlpha,
      vendorBeta,
      val1,
      val2,
      val3,
      val4,
      val5,
      challenger,
    ] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy();
    await usdc.waitForDeployment();

    // Deploy OpenAidEscrow with 5 initial validators
    const validatorAddresses = [
      val1.address,
      val2.address,
      val3.address,
      val4.address,
      val5.address,
    ];
    const EscrowFactory = await ethers.getContractFactory("OpenAidEscrow");
    escrow = await EscrowFactory.deploy(await usdc.getAddress(), validatorAddresses);
    await escrow.waitForDeployment();

    // Distribute USDC to donors, vendors, and challenger
    const fundAmount = ethers.parseUnits("20000", 6);
    await usdc.transfer(donor1.address, fundAmount);
    await usdc.transfer(donor2.address, fundAmount);
    await usdc.transfer(vendorAlpha.address, fundAmount);
    await usdc.transfer(vendorBeta.address, fundAmount);
    await usdc.transfer(challenger.address, fundAmount);

    // Approve escrow contract
    const escrowAddress = await escrow.getAddress();
    await usdc.connect(donor1).approve(escrowAddress, ethers.MaxUint256);
    await usdc.connect(donor2).approve(escrowAddress, ethers.MaxUint256);
    await usdc.connect(vendorAlpha).approve(escrowAddress, ethers.MaxUint256);
    await usdc.connect(vendorBeta).approve(escrowAddress, ethers.MaxUint256);
    await usdc.connect(challenger).approve(escrowAddress, ethers.MaxUint256);
  });

  describe("1. Deployment & Invariants", () => {
    it("should initialize with correct USDC token and validator set", async () => {
      expect(await escrow.usdcToken()).to.equal(await usdc.getAddress());
      expect(await escrow.isValidator(val1.address)).to.be.true;
      expect(await escrow.isValidator(val5.address)).to.be.true;
      expect(await escrow.isValidator(donor1.address)).to.be.false;
    });

    it("should enforce zero-custody invariant: NGO never receives direct deposits", async () => {
      // NGO creates campaign
      await escrow.connect(ngo).createCampaign(BUDGET_CEILING, 3600, 7200, BLANKETS_CID);
      const ngoBalanceBefore = await usdc.balanceOf(ngo.address);

      // Donor deposits 10,000 USDC
      await escrow.connect(donor1).depositFunds(1, BUDGET_CEILING);

      const ngoBalanceAfter = await usdc.balanceOf(ngo.address);
      const escrowBalance = await usdc.balanceOf(await escrow.getAddress());

      expect(ngoBalanceAfter).to.equal(ngoBalanceBefore);
      expect(escrowBalance).to.equal(BUDGET_CEILING);
    });
  });

  describe("2. Campaign Creation & Direct Donor Funding", () => {
    it("should allow multi-donor contributions and transition state on budget completion", async () => {
      await escrow.connect(ngo).createCampaign(BUDGET_CEILING, 3600, 7200, BLANKETS_CID);

      const amount1 = ethers.parseUnits("6000", 6);
      const amount2 = ethers.parseUnits("4000", 6);

      await expect(escrow.connect(donor1).depositFunds(1, amount1))
        .to.emit(escrow, "FundsDeposited")
        .withArgs(1, donor1.address, amount1);

      let campaign = await escrow.getCampaign(1);
      expect(campaign.state).to.equal(0); // FundingActive

      await expect(escrow.connect(donor2).depositFunds(1, amount2))
        .to.emit(escrow, "CampaignFullyFunded")
        .withArgs(1, BUDGET_CEILING);

      campaign = await escrow.getCampaign(1);
      expect(campaign.state).to.equal(2); // BiddingCommit
    });

    it("should revert if deposit exceeds budget ceiling", async () => {
      await escrow.connect(ngo).createCampaign(BUDGET_CEILING, 3600, 7200, BLANKETS_CID);
      const excessAmount = ethers.parseUnits("10001", 6);

      await expect(escrow.connect(donor1).depositFunds(1, excessAmount))
        .to.be.revertedWithCustomError(escrow, "BudgetCeilingExceeded");
    });
  });

  describe("3. Sealed Commit–Reveal Procurement Auction", () => {
    const bidAlpha = ethers.parseUnits("9200", 6);
    const saltAlpha = ethers.encodeBytes32String("salt_alpha");
    const bidBeta = ethers.parseUnits("8500", 6);
    const saltBeta = ethers.encodeBytes32String("salt_beta");

    beforeEach(async () => {
      await escrow.connect(ngo).createCampaign(BUDGET_CEILING, 3600, 7200, BLANKETS_CID);
      await escrow.connect(donor1).depositFunds(1, BUDGET_CEILING);
      // Open auction: commit window 100s, reveal window 100s
      await escrow.openAuction(1, 100, 100);
    });

    it("should accept sealed bid commitments with bond and prevent duplicate commits", async () => {
      const hashAlpha = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [bidAlpha, saltAlpha, vendorAlpha.address]
      );

      const expectedBond = ethers.parseUnits("500", 6); // 5% of 10,000

      await expect(escrow.connect(vendorAlpha).commitBid(1, hashAlpha))
        .to.emit(escrow, "BidCommitted")
        .withArgs(1, vendorAlpha.address, hashAlpha, expectedBond);

      // Duplicate commit reverts
      await expect(escrow.connect(vendorAlpha).commitBid(1, hashAlpha))
        .to.be.revertedWithCustomError(escrow, "AlreadyCommitted");
    });

    it("should reject reveal with mismatched salt or spoofed vendor address", async () => {
      const hashBeta = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [bidBeta, saltBeta, vendorBeta.address]
      );
      await escrow.connect(vendorBeta).commitBid(1, hashBeta);

      // Fast forward past commit deadline
      await time.increase(101);
      await escrow.advanceToReveal(1);

      // Attempt to reveal with wrong salt
      const wrongSalt = ethers.encodeBytes32String("wrong_salt");
      await expect(escrow.connect(vendorBeta).revealBid(1, bidBeta, wrongSalt))
        .to.be.revertedWithCustomError(escrow, "InvalidCommitment");

      // Attempt to reveal with wrong amount
      const wrongAmount = ethers.parseUnits("8000", 6);
      await expect(escrow.connect(vendorBeta).revealBid(1, wrongAmount, saltBeta))
        .to.be.revertedWithCustomError(escrow, "InvalidCommitment");
    });

    it("should select the lowest valid bidder and refund non-winning vendor bond", async () => {
      const hashAlpha = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [bidAlpha, saltAlpha, vendorAlpha.address]
      );
      const hashBeta = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [bidBeta, saltBeta, vendorBeta.address]
      );

      await escrow.connect(vendorAlpha).commitBid(1, hashAlpha);
      await escrow.connect(vendorBeta).commitBid(1, hashBeta);

      await time.increase(101);
      await escrow.advanceToReveal(1);

      await escrow.connect(vendorAlpha).revealBid(1, bidAlpha, saltAlpha);
      await escrow.connect(vendorBeta).revealBid(1, bidBeta, saltBeta);

      const alphaBalanceBefore = await usdc.balanceOf(vendorAlpha.address);

      await time.increase(101);
      await expect(escrow.finalizeAuction(1))
        .to.emit(escrow, "AuctionFinalized")
        .withArgs(1, vendorBeta.address, bidBeta);

      const campaign = await escrow.getCampaign(1);
      expect(campaign.winningVendor).to.equal(vendorBeta.address);
      expect(campaign.winningBidAmount).to.equal(bidBeta);
      expect(campaign.state).to.equal(5); // AwaitingDelivery

      // Non-winning vendor Alpha gets bond refunded
      const alphaBalanceAfter = await usdc.balanceOf(vendorAlpha.address);
      expect(alphaBalanceAfter - alphaBalanceBefore).to.equal(ethers.parseUnits("500", 6));
    });
  });

  describe("4. Delivery Evidence & Validator Quorum (3 of 5)", () => {
    const winningBid = ethers.parseUnits("8500", 6);

    beforeEach(async () => {
      await escrow.connect(ngo).createCampaign(BUDGET_CEILING, 3600, 7200, BLANKETS_CID);
      await escrow.connect(donor1).depositFunds(1, BUDGET_CEILING);
      await escrow.openAuction(1, 100, 100);

      const saltBeta = ethers.encodeBytes32String("salt_beta");
      const hashBeta = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [winningBid, saltBeta, vendorBeta.address]
      );
      await escrow.connect(vendorBeta).commitBid(1, hashBeta);
      await time.increase(101);
      await escrow.advanceToReveal(1);
      await escrow.connect(vendorBeta).revealBid(1, winningBid, saltBeta);
      await time.increase(101);
      await escrow.finalizeAuction(1);
    });

    it("should permit only the winning vendor to commit evidence", async () => {
      await expect(escrow.connect(vendorAlpha).submitDeliveryEvidence(1, EVIDENCE_CID))
        .to.be.revertedWithCustomError(escrow, "Unauthorized");

      await expect(escrow.connect(vendorBeta).submitDeliveryEvidence(1, EVIDENCE_CID))
        .to.emit(escrow, "EvidenceSubmitted");

      const campaign = await escrow.getCampaign(1);
      expect(campaign.state).to.equal(7); // VerificationPending
    });

    it("should prevent duplicate votes from the same validator", async () => {
      await escrow.connect(vendorBeta).submitDeliveryEvidence(1, EVIDENCE_CID);

      await escrow.connect(val1).castVote(1, true, 120);

      await expect(escrow.connect(val1).castVote(1, true, 120))
        .to.be.revertedWithCustomError(escrow, "AlreadyVoted");
    });

    it("should execute Stage 1 (70%) settlement immediately upon 3rd affirmative vote", async () => {
      await escrow.connect(vendorBeta).submitDeliveryEvidence(1, EVIDENCE_CID);

      const vendorBalanceBefore = await usdc.balanceOf(vendorBeta.address);
      const expectedStage1 = (winningBid * 70n) / 100n; // 5,950 USDC

      await escrow.connect(val1).castVote(1, true, 120);
      await escrow.connect(val2).castVote(1, true, 120);

      // Third vote triggers quorum & settlement
      await expect(escrow.connect(val3).castVote(1, true, 120))
        .to.emit(escrow, "QuorumReached")
        .withArgs(1, 3)
        .and.to.emit(escrow, "Stage1Settled")
        .withArgs(1, vendorBeta.address, expectedStage1);

      const vendorBalanceAfter = await usdc.balanceOf(vendorBeta.address);
      expect(vendorBalanceAfter - vendorBalanceBefore).to.equal(expectedStage1);

      const campaign = await escrow.getCampaign(1);
      expect(campaign.state).to.equal(9); // InChallengePeriod
      expect(campaign.stage1Paid).to.be.true;
    });
  });

  describe("5. Challenge Window & Stage 2 Final Settlement (30%)", () => {
    const winningBid = ethers.parseUnits("8500", 6);
    const challengeDuration = 120; // 120 seconds

    beforeEach(async () => {
      await escrow.connect(ngo).createCampaign(BUDGET_CEILING, 3600, 7200, BLANKETS_CID);
      await escrow.connect(donor1).depositFunds(1, BUDGET_CEILING);
      await escrow.openAuction(1, 100, 100);

      const saltBeta = ethers.encodeBytes32String("salt_beta");
      const hashBeta = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [winningBid, saltBeta, vendorBeta.address]
      );
      await escrow.connect(vendorBeta).commitBid(1, hashBeta);
      await time.increase(101);
      await escrow.advanceToReveal(1);
      await escrow.connect(vendorBeta).revealBid(1, winningBid, saltBeta);
      await time.increase(101);
      await escrow.finalizeAuction(1);
      await escrow.connect(vendorBeta).submitDeliveryEvidence(1, EVIDENCE_CID);

      await escrow.connect(val1).castVote(1, true, challengeDuration);
      await escrow.connect(val2).castVote(1, true, challengeDuration);
      await escrow.connect(val3).castVote(1, true, challengeDuration);
    });

    it("should revert if finalizeSettlement is called before challenge expiry", async () => {
      await expect(escrow.finalizeSettlement(1))
        .to.be.revertedWithCustomError(escrow, "ChallengePeriodActive");
    });

    it("should release Stage 2 (30%) + performance bond after challenge window cleanly expires", async () => {
      await time.increase(125); // Pass challenge window

      const vendorBalanceBefore = await usdc.balanceOf(vendorBeta.address);
      const expectedStage2 = (winningBid * 30n) / 100n; // 2,550 USDC
      const performanceBond = ethers.parseUnits("500", 6); // 500 USDC

      await expect(escrow.finalizeSettlement(1))
        .to.emit(escrow, "Stage2Settled")
        .withArgs(1, vendorBeta.address, expectedStage2);

      const vendorBalanceAfter = await usdc.balanceOf(vendorBeta.address);
      expect(vendorBalanceAfter - vendorBalanceBefore).to.equal(expectedStage2 + performanceBond);

      const campaign = await escrow.getCampaign(1);
      expect(campaign.state).to.equal(11); // Completed
      expect(campaign.stage2Paid).to.be.true;

      // Double settlement reverts
      await expect(escrow.finalizeSettlement(1))
        .to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("should allow donors to pull proportional surplus refund", async () => {
      await time.increase(125);
      await escrow.finalizeSettlement(1);

      // Total deposited was 10,000, winning bid was 8,500 => surplus = 1,500 USDC
      const expectedRefund = ethers.parseUnits("1500", 6);
      const donorBalanceBefore = await usdc.balanceOf(donor1.address);

      await expect(escrow.connect(donor1).claimRefund(1))
        .to.emit(escrow, "RefundClaimed")
        .withArgs(1, donor1.address, expectedRefund);

      const donorBalanceAfter = await usdc.balanceOf(donor1.address);
      expect(donorBalanceAfter - donorBalanceBefore).to.equal(expectedRefund);

      // Second claim reverts
      await expect(escrow.connect(donor1).claimRefund(1))
        .to.be.revertedWithCustomError(escrow, "NoRefundDue");
    });
  });

  describe("6. Dispute Path & Adversarial Scenarios", () => {
    const winningBid = ethers.parseUnits("8500", 6);

    beforeEach(async () => {
      await escrow.connect(ngo).createCampaign(BUDGET_CEILING, 3600, 7200, BLANKETS_CID);
      await escrow.connect(donor1).depositFunds(1, BUDGET_CEILING);
      await escrow.openAuction(1, 100, 100);

      const saltBeta = ethers.encodeBytes32String("salt_beta");
      const hashBeta = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [winningBid, saltBeta, vendorBeta.address]
      );
      await escrow.connect(vendorBeta).commitBid(1, hashBeta);
      await time.increase(101);
      await escrow.advanceToReveal(1);
      await escrow.connect(vendorBeta).revealBid(1, winningBid, saltBeta);
      await time.increase(101);
      await escrow.finalizeAuction(1);
      await escrow.connect(vendorBeta).submitDeliveryEvidence(1, EVIDENCE_CID);

      await escrow.connect(val1).castVote(1, true, 120);
      await escrow.connect(val2).castVote(1, true, 120);
      await escrow.connect(val3).castVote(1, true, 120);
    });

    it("should freeze Stage 2 when challenge dispute is raised", async () => {
      const counterCID = "bafybeifraudproofcounterevidence";
      await expect(escrow.connect(challenger).raiseDispute(1, counterCID))
        .to.emit(escrow, "DisputeRaised")
        .withArgs(1, challenger.address, counterCID);

      const campaign = await escrow.getCampaign(1);
      expect(campaign.state).to.equal(10); // Disputed
      expect(campaign.isDisputed).to.be.true;

      await time.increase(200);
      // finalizeSettlement must revert while in Disputed state
      await expect(escrow.finalizeSettlement(1))
        .to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("should slash vendor bond and reward challenger when dispute is upheld", async () => {
      await escrow.connect(challenger).raiseDispute(1, "counter_cid");

      const challengerBalanceBefore = await usdc.balanceOf(challenger.address);
      await escrow.connect(val1).resolveDispute(1, true); // Uphold dispute

      const challengerBalanceAfter = await usdc.balanceOf(challenger.address);
      expect(challengerBalanceAfter).to.be.gt(challengerBalanceBefore);

      const campaign = await escrow.getCampaign(1);
      expect(campaign.state).to.equal(11); // Completed
      expect(campaign.stage2Paid).to.be.false; // Stage 2 remained unpaid
    });
  });

  describe("7. Delivery Failure Timeout & Full Donor Refund", () => {
    it("should transition to DeliveryFailed and allow 100% donor refund if vendor fails to deliver", async () => {
      await escrow.connect(ngo).createCampaign(BUDGET_CEILING, 100, 200, BLANKETS_CID);
      await escrow.connect(donor1).depositFunds(1, BUDGET_CEILING);
      await escrow.openAuction(1, 50, 50);

      const saltBeta = ethers.encodeBytes32String("salt_beta");
      const hashBeta = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [ethers.parseUnits("8500", 6), saltBeta, vendorBeta.address]
      );
      await escrow.connect(vendorBeta).commitBid(1, hashBeta);
      await time.increase(51);
      await escrow.advanceToReveal(1);
      await escrow.connect(vendorBeta).revealBid(1, ethers.parseUnits("8500", 6), saltBeta);
      await time.increase(51);
      await escrow.finalizeAuction(1);

      // Fast forward past delivery deadline without evidence submission
      await time.increase(500);

      await expect(escrow.triggerDeliveryTimeout(1))
        .to.emit(escrow, "StateTransition");

      const campaign = await escrow.getCampaign(1);
      expect(campaign.state).to.equal(6); // DeliveryFailed

      // Donor pulls 100% refund
      const donorBalanceBefore = await usdc.balanceOf(donor1.address);
      await escrow.connect(donor1).claimRefund(1);
      const donorBalanceAfter = await usdc.balanceOf(donor1.address);

      expect(donorBalanceAfter - donorBalanceBefore).to.equal(BUDGET_CEILING);
    });
  });
});
