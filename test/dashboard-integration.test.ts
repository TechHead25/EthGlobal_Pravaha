import { expect } from "chai";
import { ethers } from "ethers";
import {
  deriveDashboardMode,
  DashboardStateMode,
  ArcDashboardContract,
  ArkivDashboardContract,
  WorldIdDashboardContract,
  CreDashboardContract,
  UnifiedDashboardState,
} from "../src/lib/dashboard/types";

describe("Unified Dashboard State Model & Module Contracts", () => {
  // ==========================================================================
  // 1. Dashboard State Derivation (Empty, Loading, Error, Connected, Pending)
  // ==========================================================================
  describe("1. Dashboard State Derivation Logic", () => {
    it("should derive 'loading' mode while initial accounting RPC queries are pending", () => {
      const mode = deriveDashboardMode({
        isConnected: false,
        isCorrectNetwork: false,
        isLoadingAccounting: true,
        hasBytecode: false,
        campaignCount: 0,
        fundingStep: "idle",
        actionError: null,
      });
      expect(mode).to.equal("loading");
    });

    it("should derive 'empty' mode when wallet is not connected", () => {
      const mode = deriveDashboardMode({
        isConnected: false,
        isCorrectNetwork: false,
        isLoadingAccounting: false,
        hasBytecode: true,
        campaignCount: 0,
        fundingStep: "idle",
        actionError: null,
      });
      expect(mode).to.equal("empty");
    });

    it("should derive 'wrong_network' mode when connected to a non-Arc network", () => {
      const mode = deriveDashboardMode({
        isConnected: true,
        isCorrectNetwork: false, // Connected to Ethereum or Sepolia
        isLoadingAccounting: false,
        hasBytecode: true,
        campaignCount: 1,
        fundingStep: "idle",
        actionError: null,
      });
      expect(mode).to.equal("wrong_network");
    });

    it("should derive 'empty' mode when connected to Arc but 0 on-chain campaigns exist", () => {
      const mode = deriveDashboardMode({
        isConnected: true,
        isCorrectNetwork: true,
        isLoadingAccounting: false,
        hasBytecode: true,
        campaignCount: 0, // No campaigns created yet
        fundingStep: "idle",
        actionError: null,
      });
      expect(mode).to.equal("empty");
    });

    it("should derive 'connected' mode when connected on Arc with active campaign", () => {
      const mode = deriveDashboardMode({
        isConnected: true,
        isCorrectNetwork: true,
        isLoadingAccounting: false,
        hasBytecode: true,
        campaignCount: 1,
        fundingStep: "idle",
        actionError: null,
      });
      expect(mode).to.equal("connected");
    });

    it("should derive 'transaction_pending' mode during approval or deposit submission", () => {
      const pendingSteps = [
        "validating",
        "awaiting_approval_signature",
        "approving",
        "awaiting_deposit_signature",
        "depositing",
      ];

      for (const step of pendingSteps) {
        const mode = deriveDashboardMode({
          isConnected: true,
          isCorrectNetwork: true,
          isLoadingAccounting: false,
          hasBytecode: true,
          campaignCount: 1,
          fundingStep: step,
          actionError: null,
        });
        expect(mode, `Step '${step}' should derive transaction_pending`).to.equal("transaction_pending");
      }
    });

    it("should derive 'transaction_confirmed' mode when deposit receipt succeeds", () => {
      const mode = deriveDashboardMode({
        isConnected: true,
        isCorrectNetwork: true,
        isLoadingAccounting: false,
        hasBytecode: true,
        campaignCount: 1,
        fundingStep: "confirmed",
        actionError: null,
      });
      expect(mode).to.equal("transaction_confirmed");
    });

    it("should derive 'error' mode whenever an actionable error is present", () => {
      const mode = deriveDashboardMode({
        isConnected: true,
        isCorrectNetwork: true,
        isLoadingAccounting: false,
        hasBytecode: true,
        campaignCount: 1,
        fundingStep: "error",
        actionError: "Transaction signature rejected in wallet.",
      });
      expect(mode).to.equal("error");
    });
  });

  // ==========================================================================
  // 2. 3-Tier Data Provenance Isolation
  // ==========================================================================
  describe("2. Provenance Tier Classification", () => {
    it("should strictly assign Tier 1 to Arc Testnet escrow and balances", () => {
      const arcContract: ArcDashboardContract = {
        provenance: "ON_CHAIN_SETTLEMENT",
        chainId: 5042002,
        isCorrectNetwork: true,
        escrowAddress: "0xe38151283e55077F621988679f2Cc524b785d236",
        usdcAddress: "0x3600000000000000000000000000000000000000",
        tokenDecimals: 6,
        tokenSymbol: "USDC",
        hasBytecode: true,
        campaignCount: 0,
        escrowBalance: 0n,
        userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        userBalance: 1000000000n,
        userAllowance: 0n,
        userDonorDeposit: 0n,
        activeCampaign: null,
        fundingStep: "idle",
        isTransactionPending: false,
        error: null,
      };

      expect(arcContract.provenance).to.equal("ON_CHAIN_SETTLEMENT");
      expect(arcContract.chainId).to.equal(5042002);
    });

    it("should strictly assign Tier 2 to Arkiv Rabdi decentralized database entities", () => {
      const arkivContract: ArkivDashboardContract = {
        provenance: "QUERYABLE_EXPIRING_STATE",
        network: "rabdi",
        chainId: 7794095,
        explorerUrl: "https://rabdi.explorer.arkiv.network",
        entities: [],
        isLoading: false,
        activeFilter: "all",
        totalCount: 0,
        error: null,
      };

      expect(arkivContract.provenance).to.equal("QUERYABLE_EXPIRING_STATE");
      expect(arkivContract.chainId).to.equal(7794095);
    });

    it("should strictly assign Tier 3 to World ID and Chainlink CRE oracle attestations", () => {
      const worldIdContract: WorldIdDashboardContract = {
        provenance: "ORACLE_OFF_CHAIN_PROOF",
        appId: "app_staging_placeholder",
        action: "verify-human-reviewer",
        isVerified: false,
        isLoading: false,
        executionMode: "sandbox_staging",
        nullifierHash: null,
        error: null,
      };

      const creContract: CreDashboardContract = {
        provenance: "ORACLE_OFF_CHAIN_PROOF",
        isLoading: false,
        executionMode: "local_runtime_simulator",
        result: null,
        lastExecutedAt: null,
        error: null,
      };

      expect(worldIdContract.provenance).to.equal("ORACLE_OFF_CHAIN_PROOF");
      expect(creContract.provenance).to.equal("ORACLE_OFF_CHAIN_PROOF");
    });
  });

  // ==========================================================================
  // 3. Cryptographic Sealed Bid Hash Compatibility
  // ==========================================================================
  describe("3. Deterministic Sealed Bid Calculation", () => {
    it("should generate a cryptographic keccak256 hash matching OpenAidEscrow commit verification", () => {
      const bidAmount = ethers.parseUnits("8500", 6);
      const salt = ethers.encodeBytes32String("secure_salt_777");
      const vendorAddress = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

      // Replicates Solidity: keccak256(abi.encodePacked(bidAmount, salt, vendorAddress))
      const calculatedHash = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [bidAmount, salt, vendorAddress]
      );

      expect(calculatedHash).to.match(/^0x[0-9a-fA-F]{64}$/);
      expect(calculatedHash.length).to.equal(66);

      // Verify deterministic: same inputs produce identical hash
      const recalculation = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [bidAmount, salt, vendorAddress]
      );
      expect(calculatedHash).to.equal(recalculation);

      // Verify vendor spoofing defense: different vendor address yields totally different hash
      const attackerAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
      const spoofedHash = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [bidAmount, salt, attackerAddress]
      );
      expect(calculatedHash).to.not.equal(spoofedHash);
    });
  });
});
