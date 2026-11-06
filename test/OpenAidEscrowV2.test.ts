import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { OpenAidEscrowV2, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("OpenAidEscrowV2 — Sub-Vaults, Ranked Auction, Backup Failover & Liveness", () => {
  let usdc: MockUSDC;
  let escrow: OpenAidEscrowV2;
  let deployer: SignerWithAddress;
  let ngo: SignerWithAddress;
  let donor1: SignerWithAddress;
  let donor2: SignerWithAddress;
  let vendorAlpha: SignerWithAddress;
  let vendorBeta: SignerWithAddress;
  let vendorGamma: SignerWithAddress;
  let val1: SignerWithAddress;
  let val2: SignerWithAddress;
  let val3: SignerWithAddress;
  let val4: SignerWithAddress;
  let val5: SignerWithAddress;
  let backupVal1: SignerWithAddress;
  let backupVal2: SignerWithAddress;
  let backupVal3: SignerWithAddress;
  let challenger: SignerWithAddress;

  const LIVENESS_TIMEOUT = 72 * 3600; // 72 hours
  const METADATA_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  const EVIDENCE_CID = "bafybeicb_delivery_manifest_v2_cid";

  // Category Keys
  const CAT_FOOD = ethers.keccak256(ethers.toUtf8Bytes("FOOD"));
  const CAT_CLOTHES = ethers.keccak256(ethers.toUtf8Bytes("CLOTHES"));
  const CAT_STATIONERY = ethers.keccak256(ethers.toUtf8Bytes("STATIONERY"));

  beforeEach(async () => {
    [
      deployer,
      ngo,
      donor1,
      donor2,
      vendorAlpha,
      vendorBeta,
      vendorGamma,
      val1,
      val2,
      val3,
      val4,
      val5,
      backupVal1,
      backupVal2,
      backupVal3,
      challenger,
    ] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDCFactory.deploy();
    await usdc.waitForDeployment();

    // Initial and backup validators
    const initialValidators = [val1.address, val2.address, val3.address, val4.address, val5.address];
    const backupValidators = [backupVal1.address, backupVal2.address, backupVal3.address];

    // Deploy OpenAidEscrowV2
    const EscrowV2Factory = await ethers.getContractFactory("OpenAidEscrowV2");
    escrow = await EscrowV2Factory.deploy(
      await usdc.getAddress(),
      initialValidators,
      backupValidators,
      LIVENESS_TIMEOUT
    );
    await escrow.waitForDeployment();

    // Distribute USDC via mint
    const fundAmount = ethers.parseUnits("500000", 6);
    await usdc.mint(donor1.address, fundAmount);
    await usdc.mint(donor2.address, fundAmount);
    await usdc.mint(vendorAlpha.address, fundAmount);
    await usdc.mint(vendorBeta.address, fundAmount);
    await usdc.mint(vendorGamma.address, fundAmount);
    await usdc.mint(challenger.address, fundAmount);

    // Approvals
    const escrowAddr = await escrow.getAddress();
    await usdc.connect(donor1).approve(escrowAddr, ethers.MaxUint256);
    await usdc.connect(donor2).approve(escrowAddr, ethers.MaxUint256);
    await usdc.connect(vendorAlpha).approve(escrowAddr, ethers.MaxUint256);
    await usdc.connect(vendorBeta).approve(escrowAddr, ethers.MaxUint256);
    await usdc.connect(vendorGamma).approve(escrowAddr, ethers.MaxUint256);
    await usdc.connect(challenger).approve(escrowAddr, ethers.MaxUint256);
  });

  describe("1. Sub-Vault Creation & Balance Isolation", () => {
    it("should create campaign with multiple isolated sub-vaults", async () => {
      const subVaultSpecs = [
        { categoryKey: CAT_FOOD, budgetCeiling: ethers.parseUnits("50000", 6), deliveryDurationSeconds: 7200 },
        { categoryKey: CAT_CLOTHES, budgetCeiling: ethers.parseUnits("30000", 6), deliveryDurationSeconds: 7200 },
        { categoryKey: CAT_STATIONERY, budgetCeiling: ethers.parseUnits("20000", 6), deliveryDurationSeconds: 7200 },
      ];

      await expect(escrow.connect(ngo).createCampaign(3600, METADATA_CID, subVaultSpecs))
        .to.emit(escrow, "CampaignCreated");

      const campaign = await escrow.getCampaign(1);
      expect(campaign.creator).to.equal(ngo.address);
      expect(campaign.subVaultCount).to.equal(3);

      const vaultFood = await escrow.getSubVault(1, 0);
      expect(vaultFood.categoryKey).to.equal(CAT_FOOD);
      expect(vaultFood.budgetCeiling).to.equal(ethers.parseUnits("50000", 6));
      expect(vaultFood.totalDeposited).to.equal(0);
      expect(vaultFood.state).to.equal(0); // FundingActive

      const vaultClothes = await escrow.getSubVault(1, 1);
      expect(vaultClothes.categoryKey).to.equal(CAT_CLOTHES);
      expect(vaultClothes.budgetCeiling).to.equal(ethers.parseUnits("30000", 6));
    });

    it("should enforce sub-vault balance isolation (Vault A failure cannot drain or affect Vault B)", async () => {
      const subVaultSpecs = [
        { categoryKey: CAT_FOOD, budgetCeiling: ethers.parseUnits("50000", 6), deliveryDurationSeconds: 7200 },
        { categoryKey: CAT_CLOTHES, budgetCeiling: ethers.parseUnits("30000", 6), deliveryDurationSeconds: 7200 },
      ];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, subVaultSpecs);

      const foodCeiling = ethers.parseUnits("50000", 6);
      const clothesCeiling = ethers.parseUnits("30000", 6);

      // Donor 1 funds Vault 0 (Food)
      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      // Donor 2 funds Vault 1 (Clothes)
      await escrow.connect(donor2).depositFunds(1, 1, clothesCeiling);

      expect((await escrow.getSubVault(1, 0)).state).to.equal(2); // BiddingCommit
      expect((await escrow.getSubVault(1, 1)).state).to.equal(2); // BiddingCommit

      // Open auctions for both
      await escrow.openAuction(1, 0, 100, 100);
      await escrow.openAuction(1, 1, 100, 100);

      // Only Vault 1 gets bids, Vault 0 gets zero bids and times out to reveal
      await time.increase(101);
      await escrow.advanceToReveal(1, 0); // zero bids -> AuctionFailed
      await escrow.advanceToReveal(1, 1); // zero bids -> AuctionFailed

      expect((await escrow.getSubVault(1, 0)).state).to.equal(4); // AuctionFailed
      expect((await escrow.getSubVault(1, 1)).state).to.equal(4); // AuctionFailed

      // Donor 1 pulls refund on Vault 0
      const donor1Before = await usdc.balanceOf(donor1.address);
      await escrow.connect(donor1).claimRefund(1, 0);
      const donor1After = await usdc.balanceOf(donor1.address);
      expect(donor1After - donor1Before).to.equal(foodCeiling);

      // Verify Donor 1 CANNOT claim again or claim from Vault 1
      await expect(escrow.connect(donor1).claimRefund(1, 0)).to.be.revertedWithCustomError(escrow, "NoRefundDue");
      await expect(escrow.connect(donor1).claimRefund(1, 1)).to.be.revertedWithCustomError(escrow, "NoRefundDue");

      // Verify Vault 1's full funds are completely intact for Donor 2
      const escrowBalance = await usdc.balanceOf(await escrow.getAddress());
      expect(escrowBalance).to.equal(clothesCeiling);

      const donor2Before = await usdc.balanceOf(donor2.address);
      await escrow.connect(donor2).claimRefund(1, 1);
      const donor2After = await usdc.balanceOf(donor2.address);
      expect(donor2After - donor2Before).to.equal(clothesCeiling);
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(0);
    });
  });

  describe("2. Ranked Reverse Auction & Bond Management", () => {
    const foodCeiling = ethers.parseUnits("50000", 6);
    const bidAlpha = ethers.parseUnits("45000", 6); // Rank 3
    const saltAlpha = ethers.encodeBytes32String("salt_alpha");
    const bidBeta = ethers.parseUnits("40000", 6);  // Rank 1 (Lowest)
    const saltBeta = ethers.encodeBytes32String("salt_beta");
    const bidGamma = ethers.parseUnits("42000", 6); // Rank 2 (Second lowest)
    const saltGamma = ethers.encodeBytes32String("salt_gamma");

    beforeEach(async () => {
      const specs = [
        { categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 },
      ];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);
      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      await escrow.openAuction(1, 0, 200, 200);

      // All 3 vendors commit
      const hashAlpha = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidAlpha, saltAlpha, vendorAlpha.address]);
      const hashBeta = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidBeta, saltBeta, vendorBeta.address]);
      const hashGamma = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidGamma, saltGamma, vendorGamma.address]);

      await escrow.connect(vendorAlpha).commitBid(1, 0, hashAlpha);
      await escrow.connect(vendorBeta).commitBid(1, 0, hashBeta);
      await escrow.connect(vendorGamma).commitBid(1, 0, hashGamma);

      await time.increase(201);
      await escrow.advanceToReveal(1, 0);
    });

    it("should sort revealed bids to track Rank 1 (lowest) and Rank 2 (second-lowest)", async () => {
      // Vendor Alpha reveals $45,000 -> Rank 1: Alpha ($45k), Rank 2: 0
      await escrow.connect(vendorAlpha).revealBid(1, 0, bidAlpha, saltAlpha);
      let vault = await escrow.getSubVault(1, 0);
      expect(vault.rank1Vendor).to.equal(vendorAlpha.address);
      expect(vault.rank1BidAmount).to.equal(bidAlpha);
      expect(vault.rank2Vendor).to.equal(ethers.ZeroAddress);

      // Vendor Beta reveals $40,000 -> Rank 1: Beta ($40k), Rank 2: Alpha ($45k)
      await escrow.connect(vendorBeta).revealBid(1, 0, bidBeta, saltBeta);
      vault = await escrow.getSubVault(1, 0);
      expect(vault.rank1Vendor).to.equal(vendorBeta.address);
      expect(vault.rank1BidAmount).to.equal(bidBeta);
      expect(vault.rank2Vendor).to.equal(vendorAlpha.address);
      expect(vault.rank2BidAmount).to.equal(bidAlpha);

      // Vendor Gamma reveals $42,000 -> Rank 1: Beta ($40k), Rank 2: Gamma ($42k)
      await escrow.connect(vendorGamma).revealBid(1, 0, bidGamma, saltGamma);
      vault = await escrow.getSubVault(1, 0);
      expect(vault.rank1Vendor).to.equal(vendorBeta.address);
      expect(vault.rank1BidAmount).to.equal(bidBeta);
      expect(vault.rank2Vendor).to.equal(vendorGamma.address);
      expect(vault.rank2BidAmount).to.equal(bidGamma);
    });

    it("should lock Rank 1 and Rank 2 bonds; refund Rank 3+ vendor bonds immediately in finalizeAuction", async () => {
      await escrow.connect(vendorAlpha).revealBid(1, 0, bidAlpha, saltAlpha);
      await escrow.connect(vendorBeta).revealBid(1, 0, bidBeta, saltBeta);
      await escrow.connect(vendorGamma).revealBid(1, 0, bidGamma, saltGamma);

      await time.increase(201);

      const alphaBalBefore = await usdc.balanceOf(vendorAlpha.address);
      const betaBalBefore = await usdc.balanceOf(vendorBeta.address);
      const gammaBalBefore = await usdc.balanceOf(vendorGamma.address);

      // Finalize auction
      await expect(escrow.finalizeAuction(1, 0))
        .to.emit(escrow, "AuctionFinalized")
        .withArgs(1, 0, vendorBeta.address, bidBeta, vendorGamma.address, bidGamma);

      const alphaBalAfter = await usdc.balanceOf(vendorAlpha.address);
      const betaBalAfter = await usdc.balanceOf(vendorBeta.address);
      const gammaBalAfter = await usdc.balanceOf(vendorGamma.address);

      const requiredBond = (foodCeiling * 500n) / 10000n; // 5% of $50,000 = $2,500

      // Rank 3 (Vendor Alpha) bond refunded
      expect(alphaBalAfter - alphaBalBefore).to.equal(requiredBond);

      // Rank 1 (Vendor Beta) and Rank 2 (Vendor Gamma) bonds remain locked (0 refund)
      expect(betaBalAfter).to.equal(betaBalBefore);
      expect(gammaBalAfter).to.equal(gammaBalBefore);

      const vault = await escrow.getSubVault(1, 0);
      expect(vault.winningVendor).to.equal(vendorBeta.address);
      expect(vault.winningBidAmount).to.equal(bidBeta);
      expect(vault.backupVendor).to.equal(vendorGamma.address);
      expect(vault.backupBidAmount).to.equal(bidGamma);
      expect(vault.unspentSurplus).to.equal(foodCeiling - bidBeta); // $10,000
    });
  });

  describe("3. Backup Vendor Auto-Failover (reassignToBackupVendor)", () => {
    const foodCeiling = ethers.parseUnits("50000", 6);
    const bidRank1 = ethers.parseUnits("40000", 6);  // Rank 1
    const saltRank1 = ethers.encodeBytes32String("salt_1");

    it("should failover to Rank 2 within 15% spread cap and activate on 48h acceptance", async () => {
      // 5% spread: $42,000 <= 1.15 * $40,000 = $46,000
      const bidRank2 = ethers.parseUnits("42000", 6);
      const saltRank2 = ethers.encodeBytes32String("salt_2");

      const specs = [{ categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 }];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);
      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      await escrow.openAuction(1, 0, 100, 100);

      const hash1 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidRank1, saltRank1, vendorBeta.address]);
      const hash2 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidRank2, saltRank2, vendorGamma.address]);

      await escrow.connect(vendorBeta).commitBid(1, 0, hash1);
      await escrow.connect(vendorGamma).commitBid(1, 0, hash2);

      await time.increase(101);
      await escrow.advanceToReveal(1, 0);
      await escrow.connect(vendorBeta).revealBid(1, 0, bidRank1, saltRank1);
      await escrow.connect(vendorGamma).revealBid(1, 0, bidRank2, saltRank2);

      await time.increase(101);
      await escrow.finalizeAuction(1, 0);

      // Primary vendor (Vendor Beta) defaults by failing to submit evidence before deliveryDeadline
      await time.increase(7201);

      // Trigger failover
      await expect(escrow.reassignToBackupVendor(1, 0))
        .to.emit(escrow, "BackupVendorProposed")
        .withArgs(1, 0, vendorGamma.address, bidRank2, await time.latest() + (48 * 3600) + 1);

      let vault = await escrow.getSubVault(1, 0);
      expect(vault.state).to.equal(11); // PendingBackupAcceptance
      // Price deficit: $42,000 - $40,000 = $2,000 subsidized by Vendor Beta's slashed bond
      expect(vault.slashedDeficitSubsidy).to.equal(ethers.parseUnits("2000", 6));

      // Rank 2 (Vendor Gamma) accepts within 48h
      await expect(escrow.connect(vendorGamma).acceptBackupAssignment(1, 0))
        .to.emit(escrow, "BackupVendorAccepted");

      vault = await escrow.getSubVault(1, 0);
      expect(vault.state).to.equal(5); // AwaitingDelivery
      expect(vault.winningVendor).to.equal(vendorGamma.address);
      expect(vault.winningBidAmount).to.equal(bidRank2);
      expect(vault.backupAwarded).to.be.true; // Single fallback flag set
      expect(vault.rank2Vendor).to.equal(ethers.ZeroAddress);
    });

    it("should REJECT backup vendor exceeding 15% price spread cap and transition to Refunded", async () => {
      // 20% spread: $48,000 > 1.15 * $40,000 = $46,000
      const bidRank2Excessive = ethers.parseUnits("48000", 6);
      const saltRank2 = ethers.encodeBytes32String("salt_excessive");

      const specs = [{ categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 }];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);
      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      await escrow.openAuction(1, 0, 100, 100);

      const hash1 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidRank1, saltRank1, vendorBeta.address]);
      const hash2 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidRank2Excessive, saltRank2, vendorGamma.address]);

      await escrow.connect(vendorBeta).commitBid(1, 0, hash1);
      await escrow.connect(vendorGamma).commitBid(1, 0, hash2);

      await time.increase(101);
      await escrow.advanceToReveal(1, 0);
      await escrow.connect(vendorBeta).revealBid(1, 0, bidRank1, saltRank1);
      await escrow.connect(vendorGamma).revealBid(1, 0, bidRank2Excessive, saltRank2);

      await time.increase(101);
      await escrow.finalizeAuction(1, 0);

      // Primary vendor defaults
      await time.increase(7201);

      // Failover rejects Rank 2 because spread (20%) > 15%
      await expect(escrow.reassignToBackupVendor(1, 0))
        .to.emit(escrow, "BackupVendorRejected")
        .withArgs(1, 0, vendorGamma.address, bidRank2Excessive, "Spread or budget exceeded");

      const vault = await escrow.getSubVault(1, 0);
      expect(vault.state).to.equal(13); // Refunded

      // Donor pulls 100% refund
      const donorBefore = await usdc.balanceOf(donor1.address);
      await escrow.connect(donor1).claimRefund(1, 0);
      const donorAfter = await usdc.balanceOf(donor1.address);
      expect(donorAfter - donorBefore).to.equal(foodCeiling);
    });

    it("should timeout if Rank 2 fails to accept within 48 hours and transition to Refunded", async () => {
      const bidRank2 = ethers.parseUnits("42000", 6);
      const saltRank2 = ethers.encodeBytes32String("salt_2");

      const specs = [{ categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 }];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);
      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      await escrow.openAuction(1, 0, 100, 100);

      const hash1 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidRank1, saltRank1, vendorBeta.address]);
      const hash2 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidRank2, saltRank2, vendorGamma.address]);

      await escrow.connect(vendorBeta).commitBid(1, 0, hash1);
      await escrow.connect(vendorGamma).commitBid(1, 0, hash2);

      await time.increase(101);
      await escrow.advanceToReveal(1, 0);
      await escrow.connect(vendorBeta).revealBid(1, 0, bidRank1, saltRank1);
      await escrow.connect(vendorGamma).revealBid(1, 0, bidRank2, saltRank2);

      await time.increase(101);
      await escrow.finalizeAuction(1, 0);

      // Vendor Beta defaults
      await time.increase(7201);
      await escrow.reassignToBackupVendor(1, 0);

      // Fast forward past 48 hours
      await time.increase((48 * 3600) + 5);

      // Rank 2 tries to accept late -> reverts
      await expect(escrow.connect(vendorGamma).acceptBackupAssignment(1, 0))
        .to.be.revertedWithCustomError(escrow, "BackupWindowExpired");

      // Anyone triggers timeout -> Rank 2's bond refunded and sub-vault transitions to Refunded
      const gammaBefore = await usdc.balanceOf(vendorGamma.address);
      await escrow.triggerBackupAcceptanceTimeout(1, 0);
      const gammaAfter = await usdc.balanceOf(vendorGamma.address);
      expect(gammaAfter - gammaBefore).to.equal((foodCeiling * 500n) / 10000n);

      const vault = await escrow.getSubVault(1, 0);
      expect(vault.state).to.equal(13); // Refunded

      // Donor pulls 100% refund
      const donorBefore = await usdc.balanceOf(donor1.address);
      await escrow.connect(donor1).claimRefund(1, 0);
      const donorAfter = await usdc.balanceOf(donor1.address);
      expect(donorAfter - donorBefore).to.equal(foodCeiling);
    });
  });

  describe("4. Validator Liveness Timeout & Slot Replacement", () => {
    const foodCeiling = ethers.parseUnits("50000", 6);
    const bidBeta = ethers.parseUnits("40000", 6);
    const saltBeta = ethers.encodeBytes32String("salt_b");

    beforeEach(async () => {
      const specs = [{ categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 }];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);
      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      await escrow.openAuction(1, 0, 100, 100);

      const hash = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidBeta, saltBeta, vendorBeta.address]);
      await escrow.connect(vendorBeta).commitBid(1, 0, hash);

      await time.increase(101);
      await escrow.advanceToReveal(1, 0);
      await escrow.connect(vendorBeta).revealBid(1, 0, bidBeta, saltBeta);

      await time.increase(101);
      await escrow.finalizeAuction(1, 0);

      // Submit delivery evidence
      await escrow.connect(vendorBeta).submitDeliveryEvidence(1, 0, EVIDENCE_CID);
    });

    it("should retain existing votes and replace non-voting validators with alternates upon 72h timeout", async () => {
      // Validator 1 and 2 cast affirmative votes
      await escrow.connect(val1).castVote(1, 0, true, 3600);
      await escrow.connect(val2).castVote(1, 0, true, 3600);

      let vault = await escrow.getSubVault(1, 0);
      expect(vault.affirmativeVotes).to.equal(2);
      expect(vault.negativeVotes).to.equal(0);
      expect(vault.validatorEpoch).to.equal(1);

      // Attempting timeout before 72 hours reverts
      await expect(escrow.triggerValidatorTimeout(1, 0))
        .to.be.revertedWithCustomError(escrow, "LivenessTimeoutNotMet");

      // Advance time past 72 hours
      await time.increase(LIVENESS_TIMEOUT + 10);

      // Trigger validator timeout permissionlessly
      await expect(escrow.triggerValidatorTimeout(1, 0))
        .to.emit(escrow, "ValidatorTimeoutTriggered");

      vault = await escrow.getSubVault(1, 0);
      // Existing votes from val1 and val2 are strictly RETAINED
      expect(vault.affirmativeVotes).to.equal(2);
      expect(vault.negativeVotes).to.equal(0);
      expect(vault.validatorEpoch).to.equal(2);

      // Active panel now includes backup validators in place of inactive val3, val4, val5
      const panel = await escrow.getSubVaultValidators(1, 0);
      expect(panel[0]).to.equal(val1.address);
      expect(panel[1]).to.equal(val2.address);
      expect(panel[2]).to.equal(backupVal1.address);
      expect(panel[3]).to.equal(backupVal2.address);
      expect(panel[4]).to.equal(backupVal3.address);

      // Alternate validator (backupVal1) votes affirmative -> quorum (3) reached!
      const betaBalBefore = await usdc.balanceOf(vendorBeta.address);
      await expect(escrow.connect(backupVal1).castVote(1, 0, true, 3600))
        .to.emit(escrow, "QuorumReached")
        .withArgs(1, 0, 3)
        .and.to.emit(escrow, "Stage1Settled");

      const betaBalAfter = await usdc.balanceOf(vendorBeta.address);
      const stage1Amount = (bidBeta * 70n) / 100n; // 70% of $40,000 = $28,000
      expect(betaBalAfter - betaBalBefore).to.equal(stage1Amount);

      vault = await escrow.getSubVault(1, 0);
      expect(vault.state).to.equal(9); // InChallengePeriod
    });
  });

  describe("5. Creator Controls (closeFundingEarly & cancelCampaign)", () => {
    const foodCeiling = ethers.parseUnits("50000", 6);
    const partialDeposit = ethers.parseUnits("25000", 6);

    it("should allow creator to close funding early and lower budget ceiling to totalDeposited", async () => {
      const specs = [{ categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 }];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);

      await escrow.connect(donor1).depositFunds(1, 0, partialDeposit);

      // Non-creator cannot call closeFundingEarly
      await expect(escrow.connect(donor1).closeFundingEarly(1, 0))
        .to.be.revertedWithCustomError(escrow, "Unauthorized");

      // Creator closes funding early
      await expect(escrow.connect(ngo).closeFundingEarly(1, 0))
        .to.emit(escrow, "FundingClosedEarly")
        .withArgs(1, 0, foodCeiling, partialDeposit);

      const vault = await escrow.getSubVault(1, 0);
      expect(vault.budgetCeiling).to.equal(partialDeposit);
      expect(vault.totalDeposited).to.equal(partialDeposit);
      expect(vault.state).to.equal(2); // BiddingCommit
    });

    it("should allow creator to cancel unfunded campaign and enable 100% donor refunds", async () => {
      const specs = [
        { categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 },
        { categoryKey: CAT_CLOTHES, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 },
      ];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);

      await escrow.connect(donor1).depositFunds(1, 0, partialDeposit);
      await escrow.connect(donor2).depositFunds(1, 1, partialDeposit);

      // Creator cancels campaign
      await expect(escrow.connect(ngo).cancelCampaign(1))
        .to.emit(escrow, "CampaignCancelled")
        .withArgs(1, ngo.address);

      expect((await escrow.getSubVault(1, 0)).state).to.equal(14); // Cancelled
      expect((await escrow.getSubVault(1, 1)).state).to.equal(14); // Cancelled

      // Donors pull 100% refunds
      const d1Before = await usdc.balanceOf(donor1.address);
      await escrow.connect(donor1).claimRefund(1, 0);
      const d1After = await usdc.balanceOf(donor1.address);
      expect(d1After - d1Before).to.equal(partialDeposit);

      const d2Before = await usdc.balanceOf(donor2.address);
      await escrow.connect(donor2).claimRefund(1, 1);
      const d2After = await usdc.balanceOf(donor2.address);
      expect(d2After - d2Before).to.equal(partialDeposit);
    });
  });

  describe("6. Complete Staged Settlement (70% Stage 1 + 30% Stage 2)", () => {
    const foodCeiling = ethers.parseUnits("50000", 6);
    const winningBid = ethers.parseUnits("40000", 6);
    const saltBeta = ethers.encodeBytes32String("salt_beta");

    it("should disburse 70% on quorum and 30% upon challenge expiry, and refund unspent surplus to donors", async () => {
      const specs = [{ categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 }];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);
      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      await escrow.openAuction(1, 0, 100, 100);

      const hash = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [winningBid, saltBeta, vendorBeta.address]);
      await escrow.connect(vendorBeta).commitBid(1, 0, hash);

      await time.increase(101);
      await escrow.advanceToReveal(1, 0);
      await escrow.connect(vendorBeta).revealBid(1, 0, winningBid, saltBeta);

      await time.increase(101);
      await escrow.finalizeAuction(1, 0);

      // Submit evidence
      await escrow.connect(vendorBeta).submitDeliveryEvidence(1, 0, EVIDENCE_CID);

      // 3 validators approve (challenge window = 3600s)
      await escrow.connect(val1).castVote(1, 0, true, 3600);
      await escrow.connect(val2).castVote(1, 0, true, 3600);
      await escrow.connect(val3).castVote(1, 0, true, 3600);

      const stage1Amount = (winningBid * 70n) / 100n; // $28,000
      const stage2Amount = (winningBid * 30n) / 100n; // $12,000
      const bondAmount = (foodCeiling * 500n) / 10000n; // $2,500

      // Finalize settlement before challenge expiry reverts
      await expect(escrow.finalizeSettlement(1, 0))
        .to.be.revertedWithCustomError(escrow, "ChallengePeriodActive");

      // Advance past challenge window
      await time.increase(3601);

      const betaBefore = await usdc.balanceOf(vendorBeta.address);
      await expect(escrow.finalizeSettlement(1, 0))
        .to.emit(escrow, "Stage2Settled")
        .withArgs(1, 0, vendorBeta.address, stage2Amount);
      const betaAfter = await usdc.balanceOf(vendorBeta.address);

      // Vendor receives Stage 2 (30%) + performance bond returned
      expect(betaAfter - betaBefore).to.equal(stage2Amount + bondAmount);

      const vault = await escrow.getSubVault(1, 0);
      expect(vault.state).to.equal(12); // Completed

      // Surplus is $50,000 - $40,000 = $10,000
      expect(vault.unspentSurplus).to.equal(ethers.parseUnits("10000", 6));

      // Donor 1 claims proportional surplus refund ($10,000)
      const donorBefore = await usdc.balanceOf(donor1.address);
      await escrow.connect(donor1).claimRefund(1, 0);
      const donorAfter = await usdc.balanceOf(donor1.address);
      expect(donorAfter - donorBefore).to.equal(ethers.parseUnits("10000", 6));

      // Escrow contract balance is precisely 0
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(0);
    });
  });

  describe("7. Adversarial & Invariant Tests", () => {
    const foodCeiling = ethers.parseUnits("50000", 6);
    const clothesCeiling = ethers.parseUnits("30000", 6);

    it("should prevent duplicate refunds and unauthorized claims", async () => {
      const specs = [{ categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 }];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);
      const partialDeposit = ethers.parseUnits("25000", 6);
      await escrow.connect(donor1).depositFunds(1, 0, partialDeposit);

      // Trigger timeout to fail
      await time.increase(3601);
      await escrow.triggerFundingTimeout(1, 0);

      // Donor 1 claims refund once
      await escrow.connect(donor1).claimRefund(1, 0);

      // Duplicate claim reverts
      await expect(escrow.connect(donor1).claimRefund(1, 0))
        .to.be.revertedWithCustomError(escrow, "NoRefundDue");

      // Non-donor claims refund reverts
      await expect(escrow.connect(donor2).claimRefund(1, 0))
        .to.be.revertedWithCustomError(escrow, "NoRefundDue");
    });

    it("should enforce dispute isolation (Dispute in Vault 0 never halts settlement in Vault 1)", async () => {
      const specs = [
        { categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 },
        { categoryKey: CAT_CLOTHES, budgetCeiling: clothesCeiling, deliveryDurationSeconds: 7200 },
      ];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);

      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      await escrow.connect(donor2).depositFunds(1, 1, clothesCeiling);

      // Open auctions
      await escrow.openAuction(1, 0, 100, 100);
      await escrow.openAuction(1, 1, 100, 100);

      const bid0 = ethers.parseUnits("40000", 6);
      const salt0 = ethers.encodeBytes32String("salt0");
      const hash0 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bid0, salt0, vendorBeta.address]);

      const bid1 = ethers.parseUnits("25000", 6);
      const salt1 = ethers.encodeBytes32String("salt1");
      const hash1 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bid1, salt1, vendorGamma.address]);

      await escrow.connect(vendorBeta).commitBid(1, 0, hash0);
      await escrow.connect(vendorGamma).commitBid(1, 1, hash1);

      await time.increase(101);
      await escrow.advanceToReveal(1, 0);
      await escrow.advanceToReveal(1, 1);

      await escrow.connect(vendorBeta).revealBid(1, 0, bid0, salt0);
      await escrow.connect(vendorGamma).revealBid(1, 1, bid1, salt1);

      await time.increase(101);
      await escrow.finalizeAuction(1, 0);
      await escrow.finalizeAuction(1, 1);

      // Evidence and 3 votes on both
      await escrow.connect(vendorBeta).submitDeliveryEvidence(1, 0, EVIDENCE_CID);
      await escrow.connect(vendorGamma).submitDeliveryEvidence(1, 1, EVIDENCE_CID);

      await escrow.connect(val1).castVote(1, 0, true, 3600);
      await escrow.connect(val2).castVote(1, 0, true, 3600);
      await escrow.connect(val3).castVote(1, 0, true, 3600);

      await escrow.connect(val1).castVote(1, 1, true, 3600);
      await escrow.connect(val2).castVote(1, 1, true, 3600);
      await escrow.connect(val3).castVote(1, 1, true, 3600);

      // Challenger disputes Vault 0 only
      await escrow.connect(challenger).raiseDispute(1, 0, "bafy_dispute_cid");
      expect((await escrow.getSubVault(1, 0)).state).to.equal(10); // Disputed

      // Advance past challenge window
      await time.increase(3601);

      // Finalize settlement on Vault 0 reverts because it is disputed
      await expect(escrow.finalizeSettlement(1, 0))
        .to.be.revertedWithCustomError(escrow, "InvalidState");

      // Vault 1 finalizes settlement cleanly without any obstruction!
      await expect(escrow.finalizeSettlement(1, 1))
        .to.emit(escrow, "Stage2Settled");

      expect((await escrow.getSubVault(1, 1)).state).to.equal(12); // Completed
    });

    it("should prevent double-voting and unauthorized validator voting", async () => {
      const specs = [{ categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 }];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);
      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      await escrow.openAuction(1, 0, 100, 100);

      const bid0 = ethers.parseUnits("40000", 6);
      const salt0 = ethers.encodeBytes32String("salt0");
      const hash0 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bid0, salt0, vendorBeta.address]);
      await escrow.connect(vendorBeta).commitBid(1, 0, hash0);

      await time.increase(101);
      await escrow.advanceToReveal(1, 0);
      await escrow.connect(vendorBeta).revealBid(1, 0, bid0, salt0);

      await time.increase(101);
      await escrow.finalizeAuction(1, 0);
      await escrow.connect(vendorBeta).submitDeliveryEvidence(1, 0, EVIDENCE_CID);

      // Non-validator cannot vote
      await expect(escrow.connect(donor1).castVote(1, 0, true, 3600))
        .to.be.revertedWithCustomError(escrow, "NotAnAuthorizedValidator");

      // Val1 votes once
      await escrow.connect(val1).castVote(1, 0, true, 3600);

      // Val1 votes again -> reverts with AlreadyVoted
      await expect(escrow.connect(val1).castVote(1, 0, true, 3600))
        .to.be.revertedWithCustomError(escrow, "AlreadyVoted");
    });

    it("should enforce single fallback rule (backupAwarded vendor cannot trigger second backup)", async () => {
      const specs = [{ categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 }];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);
      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      await escrow.openAuction(1, 0, 100, 100);

      const bid1 = ethers.parseUnits("40000", 6);
      const salt1 = ethers.encodeBytes32String("salt1");
      const hash1 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bid1, salt1, vendorBeta.address]);

      const bid2 = ethers.parseUnits("42000", 6);
      const salt2 = ethers.encodeBytes32String("salt2");
      const hash2 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bid2, salt2, vendorGamma.address]);

      await escrow.connect(vendorBeta).commitBid(1, 0, hash1);
      await escrow.connect(vendorGamma).commitBid(1, 0, hash2);

      await time.increase(101);
      await escrow.advanceToReveal(1, 0);
      await escrow.connect(vendorBeta).revealBid(1, 0, bid1, salt1);
      await escrow.connect(vendorGamma).revealBid(1, 0, bid2, salt2);

      await time.increase(101);
      await escrow.finalizeAuction(1, 0);

      // Primary defaults
      await time.increase(7201);
      await escrow.reassignToBackupVendor(1, 0);

      // Rank 2 accepts
      await escrow.connect(vendorGamma).acceptBackupAssignment(1, 0);

      // Rank 2 now also defaults on delivery!
      await time.increase(7201);

      // Second failover attempt transitions directly to Refunded (no tertiary vendor)
      await escrow.reassignToBackupVendor(1, 0);

      const vault = await escrow.getSubVault(1, 0);
      expect(vault.state).to.equal(13); // Refunded
    });

    it("should allow backup vendor to voluntarily decline and refund their bond", async () => {
      const specs = [{ categoryKey: CAT_FOOD, budgetCeiling: foodCeiling, deliveryDurationSeconds: 7200 }];
      await escrow.connect(ngo).createCampaign(3600, METADATA_CID, specs);
      await escrow.connect(donor1).depositFunds(1, 0, foodCeiling);
      await escrow.openAuction(1, 0, 100, 100);

      const bid1 = ethers.parseUnits("40000", 6);
      const salt1 = ethers.encodeBytes32String("salt1");
      const hash1 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bid1, salt1, vendorBeta.address]);

      const bid2 = ethers.parseUnits("42000", 6);
      const salt2 = ethers.encodeBytes32String("salt2");
      const hash2 = ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bid2, salt2, vendorGamma.address]);

      await escrow.connect(vendorBeta).commitBid(1, 0, hash1);
      await escrow.connect(vendorGamma).commitBid(1, 0, hash2);

      await time.increase(101);
      await escrow.advanceToReveal(1, 0);
      await escrow.connect(vendorBeta).revealBid(1, 0, bid1, salt1);
      await escrow.connect(vendorGamma).revealBid(1, 0, bid2, salt2);

      await time.increase(101);
      await escrow.finalizeAuction(1, 0);

      await time.increase(7201);
      await escrow.reassignToBackupVendor(1, 0);

      // Non-backup vendor cannot decline
      await expect(escrow.connect(vendorAlpha).declineBackupAssignment(1, 0))
        .to.be.revertedWithCustomError(escrow, "NotBackupVendor");

      // Backup vendor (Vendor Gamma) voluntarily declines
      const gammaBefore = await usdc.balanceOf(vendorGamma.address);
      await escrow.connect(vendorGamma).declineBackupAssignment(1, 0);
      const gammaAfter = await usdc.balanceOf(vendorGamma.address);

      // Bond refunded
      expect(gammaAfter - gammaBefore).to.equal((foodCeiling * 500n) / 10000n);

      const vault = await escrow.getSubVault(1, 0);
      expect(vault.state).to.equal(13); // Refunded
    });
  });
});
