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
  switchOrAddArcNetwork,
} from "../src/lib/arc/client";
import { ARC_TESTNET_CONFIG, getEscrowAddress } from "../src/lib/arc/config";
import { CampaignState, FundingStatus } from "../src/lib/arc/types";

describe("Independent Security & Correctness Audit — Arc Funding Integration", () => {
  const verifiedEscrow = "0xe38151283e55077F621988679f2Cc524b785d236";
  const verifiedUsdc = "0x3600000000000000000000000000000000000000";
  const testDonor = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  // ==========================================================================
  // 1. Chain ID & Cross-Chain Submission Defenses
  // ==========================================================================
  describe("1. Chain ID & Network Validation Defense", () => {
    it("should strictly authorize only Arc Testnet (5042002 / 0x4cef52)", () => {
      expect(isArcTestnet(5042002)).to.be.true;
      expect(isArcTestnet("5042002")).to.be.true;
      expect(isArcTestnet("0x4cef52")).to.be.true;
      expect(isArcTestnet("0x4CEF52")).to.be.true;
    });

    it("should reject EVM mainnets and testnets to prevent accidental cross-chain token loss", () => {
      const nonArcChains = [
        1,        // Ethereum Mainnet
        11155111, // Ethereum Sepolia
        137,      // Polygon PoS
        10,       // Optimism
        42161,    // Arbitrum One
        8453,     // Base
        31337,    // Local Hardhat Node
        5042001,  // Off-by-one chain ID
        5042003,  // Off-by-one chain ID
        0,        // Zero
        -1,       // Negative
        NaN,
        null,
        undefined,
        "invalid_hex",
        "0x0",
      ];

      for (const chain of nonArcChains) {
        expect(isArcTestnet(chain as any), `Chain ${chain} should have been rejected`).to.be.false;
      }
    });

    it("should construct valid EIP-3085 wallet_addEthereumChain parameters", async () => {
      let requestedMethod = "";
      let requestedParams: any = null;

      const mockEthereum = {
        request: async ({ method, params }: any) => {
          requestedMethod = method;
          requestedParams = params;
          if (method === "wallet_switchEthereumChain") {
            const err: any = new Error("Chain not added");
            err.code = 4902;
            throw err;
          }
          return null;
        },
      };

      await switchOrAddArcNetwork(mockEthereum);
      expect(requestedMethod).to.equal("wallet_addEthereumChain");
      expect(requestedParams[0].chainId).to.equal("0x4cef52");
      expect(requestedParams[0].chainName).to.equal("Arc Testnet");
      expect(requestedParams[0].rpcUrls[0]).to.include("arc.network");
    });
  });

  // ==========================================================================
  // 2. Token Decimals, Arithmetic & Precision Attack Surface
  // ==========================================================================
  describe("2. Token Decimals & Arithmetic Boundaries", () => {
    const decimals = 6;
    const userBalance = ethers.parseUnits("5000", decimals); // 5,000 USDC
    const totalDeposited = ethers.parseUnits("2000", decimals); // 2,000 USDC
    const budgetCeiling = ethers.parseUnits("10000", decimals); // 10,000 USDC

    it("should reject precision exceeding token decimals (sub-atomic units)", () => {
      const result = validateDonationInput({
        amountStr: "100.1234567", // 7 decimal places
        decimals,
        userBalance,
        totalDeposited,
        budgetCeiling,
      });

      expect(result.valid).to.be.false;
      expect(result.error).to.include("cannot exceed 6 decimal places");
    });

    it("should accept valid micro-USDC increments up to 6 decimals", () => {
      const result = validateDonationInput({
        amountStr: "0.000001", // Smallest 1 micro-USDC unit
        decimals,
        userBalance,
        totalDeposited,
        budgetCeiling,
      });

      expect(result.valid).to.be.true;
      expect(result.parsedAmount).to.equal(1n);
    });

    it("should reject non-numeric inputs and malicious string representations", () => {
      const malformedInputs = [
        "NaN",
        "Infinity",
        "-Infinity",
        "1e6",
        "0x10",
        "1,000",
        "1.2.3",
        "   ",
        "<script>alert(1)</script>",
        "DROP TABLE users;",
      ];

      for (const input of malformedInputs) {
        const res = validateDonationInput({
          amountStr: input,
          decimals,
          userBalance,
          totalDeposited,
          budgetCeiling,
        });
        expect(res.valid, `Input '${input}' should be marked invalid`).to.be.false;
      }
    });

    it("should reject exact 0 and negative amounts", () => {
      expect(
        validateDonationInput({
          amountStr: "0",
          decimals,
          userBalance,
          totalDeposited,
          budgetCeiling,
        }).valid
      ).to.be.false;

      expect(
        validateDonationInput({
          amountStr: "0.000000",
          decimals,
          userBalance,
          totalDeposited,
          budgetCeiling,
        }).valid
      ).to.be.false;

      expect(
        validateDonationInput({
          amountStr: "-100",
          decimals,
          userBalance,
          totalDeposited,
          budgetCeiling,
        }).valid
      ).to.be.false;
    });

    it("should enforce remaining budget boundary with exact matching", () => {
      // Remaining is 8,000 USDC (10,000 - 2,000)
      const exactRemaining = "8000";
      const exactResult = validateDonationInput({
        amountStr: exactRemaining,
        decimals,
        userBalance: ethers.parseUnits("10000", decimals),
        totalDeposited,
        budgetCeiling,
      });
      expect(exactResult.valid).to.be.true;
      expect(exactResult.parsedAmount).to.equal(ethers.parseUnits("8000", decimals));

      // Over by 0.000001 USDC
      const overResult = validateDonationInput({
        amountStr: "8000.000001",
        decimals,
        userBalance: ethers.parseUnits("10000", decimals),
        totalDeposited,
        budgetCeiling,
      });
      expect(overResult.valid).to.be.false;
      expect(overResult.error).to.include("exceeds remaining campaign budget");
    });
  });

  // ==========================================================================
  // 3. Allowance & Approval Lifecycle Enforcement
  // ==========================================================================
  describe("3. Allowance & Two-Step Approval Flow", () => {
    it("should correctly identify when approval is strictly required vs superfluous", () => {
      const depositAmount = ethers.parseUnits("500", 6);

      // Zero allowance
      expect(needsAllowanceApproval(0n, depositAmount)).to.be.true;

      // Partial allowance (1 micro-unit short)
      expect(needsAllowanceApproval(depositAmount - 1n, depositAmount)).to.be.true;

      // Exact allowance
      expect(needsAllowanceApproval(depositAmount, depositAmount)).to.be.false;

      // Surplus allowance
      expect(needsAllowanceApproval(depositAmount + 1000n, depositAmount)).to.be.false;
    });

    function createMockReceipt(status: number, hash: string, to: string) {
      return {
        status,
        logs: [],
        blockNumber: 70917303,
        blockHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        to,
        from: testDonor,
        hash,
        index: 0,
        gasUsed: 21000n,
        cumulativeGasUsed: 21000n,
        gasPrice: 1000000000n,
        type: 2,
      };
    }

    it("should abort funding flow immediately if approval transaction reverts", async () => {
      const statusUpdates: FundingStatus[] = [];
      let depositDispatched = false;

      const mockProvider = {
        getTransactionReceipt: async (hash: string) => {
          if (hash === "0xapprove_fail_hash") {
            return createMockReceipt(0, hash, verifiedUsdc); // Status 0 = reverted
          }
          return createMockReceipt(1, hash, verifiedEscrow);
        },
      };

      const mockSigner: any = {
        provider: mockProvider,
        getAddress: async () => testDonor,
        sendTransaction: async (tx: any) => {
          if (tx.to.toLowerCase() === verifiedUsdc.toLowerCase()) {
            return {
              hash: "0xapprove_fail_hash",
              provider: mockProvider,
            };
          }
          if (tx.to.toLowerCase() === verifiedEscrow.toLowerCase()) {
            depositDispatched = true;
            return {
              hash: "0xdeposit_hash",
              provider: mockProvider,
            };
          }
          throw new Error(`Unexpected destination: ${tx.to}`);
        },
      };

      let caughtError: any = null;
      try {
        await executeFundingDeposit(
          mockSigner,
          verifiedEscrow,
          verifiedUsdc,
          1,
          ethers.parseUnits("100", 6),
          0n, // Needs approval
          (status) => statusUpdates.push(status)
        );
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).to.not.be.null;
      expect(caughtError.message).to.match(/revert|approval transaction failed/i);
      expect(depositDispatched).to.be.false; // Deposit must NEVER be dispatched!
    });

    it("should abort funding flow if deposit transaction receipt has status 0 (on-chain revert)", async () => {
      const statusUpdates: FundingStatus[] = [];

      const mockProvider = {
        getTransactionReceipt: async (hash: string) => {
          if (hash === "0xapprove_success_hash") {
            return createMockReceipt(1, hash, verifiedUsdc);
          }
          if (hash === "0xdeposit_revert_hash") {
            return createMockReceipt(0, hash, verifiedEscrow); // Revert status 0
          }
          return null;
        },
      };

      const mockSigner: any = {
        provider: mockProvider,
        getAddress: async () => testDonor,
        sendTransaction: async (tx: any) => {
          if (tx.to.toLowerCase() === verifiedUsdc.toLowerCase()) {
            return {
              hash: "0xapprove_success_hash",
              provider: mockProvider,
            };
          }
          if (tx.to.toLowerCase() === verifiedEscrow.toLowerCase()) {
            return {
              hash: "0xdeposit_revert_hash",
              provider: mockProvider,
            };
          }
          throw new Error(`Unexpected destination: ${tx.to}`);
        },
      };

      let caughtError: any = null;
      try {
        await executeFundingDeposit(
          mockSigner,
          verifiedEscrow,
          verifiedUsdc,
          1,
          ethers.parseUnits("100", 6),
          0n,
          (status) => statusUpdates.push(status)
        );
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).to.not.be.null;
      expect(caughtError.message).to.match(/revert|Deposit transaction failed/i);
      // Status must not have reached 'confirmed'
      expect(statusUpdates.some((s) => s.step === "confirmed")).to.be.false;
    });

    it("should skip approval transaction when current allowance already covers required amount", async () => {
      let approveDispatched = false;
      let depositDispatched = false;

      const mockProvider = {
        getTransactionReceipt: async (hash: string) => {
          return createMockReceipt(1, hash, verifiedEscrow);
        },
      };

      const mockSigner: any = {
        provider: mockProvider,
        getAddress: async () => testDonor,
        sendTransaction: async (tx: any) => {
          if (tx.to.toLowerCase() === verifiedUsdc.toLowerCase()) {
            approveDispatched = true;
            return { hash: "0xapprove", provider: mockProvider };
          }
          if (tx.to.toLowerCase() === verifiedEscrow.toLowerCase()) {
            depositDispatched = true;
            return { hash: "0xdeposit_direct", provider: mockProvider };
          }
          throw new Error(`Unexpected destination: ${tx.to}`);
        },
      };

      const result = await executeFundingDeposit(
        mockSigner,
        verifiedEscrow,
        verifiedUsdc,
        1,
        ethers.parseUnits("100", 6),
        ethers.parseUnits("500", 6), // Existing allowance: 500 > 100
        () => {}
      );

      expect(approveDispatched).to.be.false;
      expect(depositDispatched).to.be.true;
      expect(result.depositTxHash).to.equal("0xdeposit_direct");
    });
  });

  // ==========================================================================
  // 4. Honest State Rendering & Nonexistent Campaign Safety
  // ==========================================================================
  describe("4. Honest Accounting & State Invariants", () => {
    it("should return safe zero-accounting when contract address has no bytecode", async () => {
      const mockProvider: any = {
        getCode: async () => "0x",
      };

      const result = await fetchEscrowAccounting(mockProvider, verifiedEscrow, testDonor);
      expect(result.hasBytecode).to.be.false;
      expect(result.campaignCount).to.equal(0);
      expect(result.userUsdcBalance).to.equal(0n);
      expect(result.escrowUsdcBalance).to.equal(0n);
    });

    it("should return null for campaign #1 when on-chain campaign count is 0", async () => {
      const mockProvider: any = {
        getCode: async () => "0x60806040...",
      };
      const campaign = await fetchOnChainCampaign(mockProvider, verifiedEscrow, 1);
      expect(campaign).to.be.null;
    });

    it("should correctly map all 13 Solidity enum values without off-by-one errors", () => {
      expect(CampaignState.FundingActive).to.equal(0);
      expect(CampaignState.FundingFailed).to.equal(1);
      expect(CampaignState.BiddingCommit).to.equal(2);
      expect(CampaignState.BiddingReveal).to.equal(3);
      expect(CampaignState.AuctionFailed).to.equal(4);
      expect(CampaignState.AwaitingDelivery).to.equal(5);
      expect(CampaignState.DeliveryFailed).to.equal(6);
      expect(CampaignState.VerificationPending).to.equal(7);
      expect(CampaignState.VerificationFailed).to.equal(8);
      expect(CampaignState.InChallengePeriod).to.equal(9);
      expect(CampaignState.Disputed).to.equal(10);
      expect(CampaignState.Completed).to.equal(11);
      expect(CampaignState.Refunded).to.equal(12);
    });
  });

  // ==========================================================================
  // 5. Live Arc Testnet On-Chain Verification (Live Network Queries)
  // ==========================================================================
  describe("5. Live Arc Testnet On-Chain Verification (Live RPC Queries)", function () {
    this.timeout(20000);

    let provider: ethers.JsonRpcProvider;

    before(() => {
      provider = new ethers.JsonRpcProvider(ARC_TESTNET_CONFIG.rpcUrls[0], {
        chainId: ARC_TESTNET_CONFIG.chainId,
        name: "arcTestnet",
      });
    });

    it("should verify live Arc Testnet network connectivity and Chain ID 5042002", async () => {
      const network = await provider.getNetwork();
      expect(Number(network.chainId)).to.equal(5042002);
    });

    it("should verify deployed bytecode exists at configured OpenAidEscrow address", async () => {
      const escrowAddr = getEscrowAddress();
      const code = await provider.getCode(escrowAddr);
      expect(code).to.not.equal("0x");
      expect(code.length).to.be.gt(1000); // 26KB+ contract bytecode
    });

    it("should verify on-chain usdcToken() strictly matches 0x3600...0000", async () => {
      const escrowAddr = getEscrowAddress();
      const escrow = new ethers.Contract(
        escrowAddr,
        ["function usdcToken() view returns (address)", "function campaignCount() view returns (uint256)"],
        provider
      );

      const onChainUsdc = await escrow.usdcToken();
      expect(onChainUsdc.toLowerCase()).to.equal(verifiedUsdc.toLowerCase());

      const count = await escrow.campaignCount();
      expect(Number(count)).to.be.gte(0);
    });

    it("should verify on-chain USDC contract exhibits 6 decimals and ERC-20 symbol", async () => {
      const token = new ethers.Contract(
        verifiedUsdc,
        [
          "function decimals() view returns (uint8)",
          "function symbol() view returns (string)",
          "function name() view returns (string)",
        ],
        provider
      );

      const decimals = await token.decimals();
      const symbol = await token.symbol();
      expect(Number(decimals)).to.equal(6);
      expect(symbol).to.equal("USDC");
    });
  });

  // ==========================================================================
  // 6. User Rejection & Error Parsing Resilience
  // ==========================================================================
  describe("6. User Rejection & Exception Handling", () => {
    it("should gracefully handle EIP-1193 rejection during approval signature", async () => {
      const mockSigner: any = {
        getAddress: async () => testDonor,
        sendTransaction: async () => {
          const err: any = new Error("MetaMask Tx Signature: User denied transaction signature.");
          err.code = 4001;
          throw err;
        },
      };

      let caughtError: any = null;
      try {
        await executeFundingDeposit(
          mockSigner,
          verifiedEscrow,
          verifiedUsdc,
          1,
          ethers.parseUnits("50", 6),
          0n,
          () => {}
        );
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).to.not.be.null;
      const parsed = parseEthereumError(caughtError);
      expect(parsed).to.equal("Transaction signature rejected in wallet.");
    });

    it("should gracefully handle EIP-1193 rejection during deposit signature", async () => {
      const mockProvider = {
        getTransactionReceipt: async (hash: string) => ({
          status: 1,
          logs: [],
          blockNumber: 1,
          blockHash: "0x123",
          to: verifiedUsdc,
          from: testDonor,
          hash,
          index: 0,
          gasUsed: 21000n,
          cumulativeGasUsed: 21000n,
          gasPrice: 1000000000n,
          type: 2,
        }),
      };

      const mockSigner: any = {
        provider: mockProvider,
        getAddress: async () => testDonor,
        sendTransaction: async (tx: any) => {
          if (tx.to.toLowerCase() === verifiedUsdc.toLowerCase()) {
            return { hash: "0xapprove_ok", provider: mockProvider };
          }
          const err: any = new Error("User rejected the deposit transaction");
          err.code = "ACTION_REJECTED";
          throw err;
        },
      };

      let caughtError: any = null;
      try {
        await executeFundingDeposit(
          mockSigner,
          verifiedEscrow,
          verifiedUsdc,
          1,
          ethers.parseUnits("50", 6),
          0n,
          () => {}
        );
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).to.not.be.null;
      const parsed = parseEthereumError(caughtError);
      expect(parsed).to.equal("Transaction signature rejected in wallet.");
    });
  });

  // ==========================================================================
  // 7. RPC Failover & Endpoint Redundancy
  // ==========================================================================
  describe("7. RPC Configuration & Endpoint Resilience", () => {
    it("should configure primary and backup RPC endpoints for Arc Testnet", () => {
      expect(ARC_TESTNET_CONFIG.rpcUrls.length).to.be.gte(2);
      expect(ARC_TESTNET_CONFIG.rpcUrls[0]).to.include("arc.network");
      expect(ARC_TESTNET_CONFIG.rpcUrls[1]).to.include("drpc.org");
    });
  });
});
