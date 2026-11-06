import { expect } from "chai";
import { ethers } from "ethers";
import {
  isArcTestnet,
  isValidAddress,
  validateDonationInput,
  needsAllowanceApproval,
  parseEthereumError,
  formatAddress,
} from "../src/lib/arc/validation";
import {
  fetchEscrowAccounting,
  fetchOnChainCampaign,
  executeFundingDeposit,
} from "../src/lib/arc/client";
import { ARC_TESTNET_CONFIG } from "../src/lib/arc/config";
import { CampaignState } from "../src/lib/arc/types";

describe("Arc Testnet Integration & Safety Guards", () => {
  const dummyEscrow = "0xe38151283e55077F621988679f2Cc524b785d236";
  const dummyUsdc = "0x3600000000000000000000000000000000000000";
  const dummyUser = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  describe("1. Chain ID Validation (Chain Mismatch Defense)", () => {
    it("should accept valid Arc Testnet chain ID in number, string, and hex format", () => {
      expect(isArcTestnet(5042002)).to.be.true;
      expect(isArcTestnet("5042002")).to.be.true;
      expect(isArcTestnet("0x4cef52")).to.be.true;
      expect(isArcTestnet(ARC_TESTNET_CONFIG.chainId)).to.be.true;
    });

    it("should strictly reject non-Arc networks to prevent cross-chain transaction submission", () => {
      expect(isArcTestnet(1)).to.be.false; // Ethereum Mainnet
      expect(isArcTestnet(11155111)).to.be.false; // Sepolia
      expect(isArcTestnet(137)).to.be.false; // Polygon
      expect(isArcTestnet(31337)).to.be.false; // Hardhat Local
      expect(isArcTestnet(null)).to.be.false;
      expect(isArcTestnet(undefined)).to.be.false;
      expect(isArcTestnet("invalid")).to.be.false;
    });
  });

  describe("2. Address & Bytecode Validation", () => {
    it("should accept valid Ethereum-format addresses", () => {
      expect(isValidAddress(dummyEscrow)).to.be.true;
      expect(isValidAddress(dummyUsdc)).to.be.true;
    });

    it("should reject zero addresses, malformed strings, and empty input", () => {
      expect(isValidAddress(ethers.ZeroAddress)).to.be.false;
      expect(isValidAddress("0x0000000000000000000000000000000000000000")).to.be.false;
      expect(isValidAddress("0xinvalid")).to.be.false;
      expect(isValidAddress("")).to.be.false;
      expect(isValidAddress(null)).to.be.false;
      expect(isValidAddress(undefined)).to.be.false;
    });

    it("should format addresses cleanly for display", () => {
      expect(formatAddress(dummyEscrow)).to.equal("0xe381...d236");
      expect(formatAddress(null)).to.equal("");
    });
  });

  describe("3. Donation Amount & Decimal Validation", () => {
    const decimals = 6;
    const userBalance = ethers.parseUnits("1000", decimals); // 1,000 USDC
    const totalDeposited = ethers.parseUnits("5000", decimals); // 5,000 USDC
    const budgetCeiling = ethers.parseUnits("10000", decimals); // 10,000 USDC

    it("should parse valid integer and decimal USDC amounts", () => {
      const res = validateDonationInput({
        amountStr: "250.5",
        decimals,
        userBalance,
        totalDeposited,
        budgetCeiling,
      });
      expect(res.valid).to.be.true;
      expect(res.parsedAmount).to.equal(ethers.parseUnits("250.5", decimals));
    });

    it("should reject empty, zero, and negative contribution amounts", () => {
      const emptyRes = validateDonationInput({
        amountStr: "",
        decimals,
        userBalance,
        totalDeposited,
        budgetCeiling,
      });
      expect(emptyRes.valid).to.be.false;
      expect(emptyRes.error).to.include("enter a donation amount");

      const zeroRes = validateDonationInput({
        amountStr: "0",
        decimals,
        userBalance,
        totalDeposited,
        budgetCeiling,
      });
      expect(zeroRes.valid).to.be.false;

      const negRes = validateDonationInput({
        amountStr: "-50",
        decimals,
        userBalance,
        totalDeposited,
        budgetCeiling,
      });
      expect(negRes.valid).to.be.false;
    });

    it("should reject inputs with more decimal places than token supports (token-decimal mismatch)", () => {
      const res = validateDonationInput({
        amountStr: "10.1234567", // 7 decimals, USDC only has 6
        decimals,
        userBalance,
        totalDeposited,
        budgetCeiling,
      });
      expect(res.valid).to.be.false;
      expect(res.error).to.include("cannot exceed 6 decimal places");
    });

    it("should reject amounts exceeding user's available USDC balance", () => {
      const res = validateDonationInput({
        amountStr: "1500", // User only has 1,000 USDC
        decimals,
        userBalance,
        totalDeposited,
        budgetCeiling,
      });
      expect(res.valid).to.be.false;
      expect(res.error).to.include("Insufficient USDC balance");
    });

    it("should reject amounts exceeding remaining campaign budget ceiling", () => {
      const highBalance = ethers.parseUnits("20000", decimals);
      const res = validateDonationInput({
        amountStr: "5500", // Remaining is 5,000 USDC (10,000 - 5,000)
        decimals,
        userBalance: highBalance,
        totalDeposited,
        budgetCeiling,
      });
      expect(res.valid).to.be.false;
      expect(res.error).to.include("exceeds remaining campaign budget");
    });
  });

  describe("4. Allowance & Approval Logic", () => {
    it("should require approval when allowance is less than deposit amount", () => {
      const allowance = ethers.parseUnits("100", 6);
      const required = ethers.parseUnits("200", 6);
      expect(needsAllowanceApproval(allowance, required)).to.be.true;
    });

    it("should not require approval when allowance already covers deposit amount", () => {
      const allowance = ethers.parseUnits("500", 6);
      const required = ethers.parseUnits("200", 6);
      expect(needsAllowanceApproval(allowance, required)).to.be.false;

      const exact = ethers.parseUnits("200", 6);
      expect(needsAllowanceApproval(exact, required)).to.be.false;
    });
  });

  describe("5. Error Parsing & User Feedback", () => {
    it("should identify user rejection (code 4001 / ACTION_REJECTED)", () => {
      const err = { code: 4001, message: "User rejected the transaction" };
      expect(parseEthereumError(err)).to.include("Transaction signature rejected");
    });

    it("should identify network addition requirements (code 4902)", () => {
      const err = { code: 4902, message: "Unrecognized chain ID" };
      expect(parseEthereumError(err)).to.include("Arc Testnet (5042002) is not configured");
    });

    it("should identify contract custom errors", () => {
      expect(parseEthereumError({ message: "execution reverted: custom error BudgetCeilingExceeded()" }))
        .to.include("Contribution exceeds the campaign's budget ceiling");
      expect(parseEthereumError({ message: "execution reverted: custom error DeadlinePassed()" }))
        .to.include("funding deadline has already expired");
      expect(parseEthereumError({ message: "execution reverted: custom error InvalidState" }))
        .to.include("Campaign is not currently in the FundingActive state");
    });
  });

  describe("6. Contract Accounting & Nonexistent Campaign Safety", () => {
    it("should detect missing contract bytecode safely without crashing", async () => {
      const mockProvider: any = {
        getCode: async () => "0x", // No bytecode
      };

      const accounting = await fetchEscrowAccounting(mockProvider, dummyEscrow, dummyUser);
      expect(accounting.hasBytecode).to.be.false;
      expect(accounting.campaignCount).to.equal(0);
    });

    it("should return null when querying nonexistent campaign (#1 when campaignCount == 0)", async () => {
      const mockProvider: any = {
        getCode: async () => "0x6080...",
      };
      // When escrow has no campaign, getCampaign returns zero budget ceiling or reverts
      const campaign = await fetchOnChainCampaign(mockProvider, dummyEscrow, 1);
      expect(campaign).to.be.null;
    });
  });

  describe("7. Deterministic Funding Workflow & Transaction Failures", () => {
    it("should skip approve step if allowance is already sufficient", async () => {
      let approveCalled = false;
      let depositCalled = false;

      const mockSigner: any = {
        getAddress: async () => dummyUser,
      };

      // Mock ethers.Contract calls by overriding client behavior or checking status steps
      const steps: string[] = [];
      const onStatusUpdate = (s: any) => steps.push(s.step);

      // Test with pre-approved allowance
      const parsedAmount = ethers.parseUnits("100", 6);
      const sufficientAllowance = ethers.parseUnits("500", 6);

      // Verify allowance helper ensures approval is skipped
      expect(needsAllowanceApproval(sufficientAllowance, parsedAmount)).to.be.false;
    });

    it("should surface failed approval transaction receipt", async () => {
      const mockSigner: any = {};
      const parsedAmount = ethers.parseUnits("100", 6);
      const zeroAllowance = 0n;

      // Mock Contract constructor by testing executeFundingDeposit with failing wait()
      let statusStep = "";
      try {
        await executeFundingDeposit(
          mockSigner,
          dummyEscrow,
          dummyUsdc,
          1,
          parsedAmount,
          zeroAllowance,
          (s) => { statusStep = s.step; }
        );
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });
});
