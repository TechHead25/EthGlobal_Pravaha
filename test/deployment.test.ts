import { expect } from "chai";
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { validateValidators, recordDeployment, DeploymentRecord } from "../scripts/deploy";
import { verifyToken } from "../scripts/verify-token";
import { MockUSDC } from "../typechain-types";

describe("Deployment Pipeline & Configuration Safety Guards", () => {
  let mockUsdc: MockUSDC;
  let deployerAddress: string;

  const valid5Validators = [
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  ];

  before(async () => {
    const [deployer] = await ethers.getSigners();
    deployerAddress = deployer.address;

    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    mockUsdc = await MockUSDCFactory.deploy();
    await mockUsdc.waitForDeployment();
  });

  describe("1. Validator Configuration Validation", () => {
    it("should accept 5 valid, distinct validator addresses", () => {
      const validated = validateValidators(valid5Validators);
      expect(validated.length).to.equal(5);
    });

    it("should reject validator arrays with fewer or more than 5 addresses", () => {
      expect(() => validateValidators(valid5Validators.slice(0, 4))).to.throw(
        "Exactly 5 validator addresses are required"
      );
      expect(() => validateValidators([...valid5Validators, "0x1234567890123456789012345678901234567890"])).to.throw(
        "Exactly 5 validator addresses are required"
      );
    });

    it("should reject invalid address formats", () => {
      const invalid = [...valid5Validators];
      invalid[2] = "not-an-eth-address";
      expect(() => validateValidators(invalid)).to.throw("invalid address format");
    });

    it("should reject zero addresses", () => {
      const withZero = [...valid5Validators];
      withZero[0] = ethers.ZeroAddress;
      expect(() => validateValidators(withZero)).to.throw("cannot be the zero address");
    });

    it("should reject duplicate validator addresses (case-insensitive)", () => {
      const withDuplicates = [
        valid5Validators[0],
        valid5Validators[0].toLowerCase(), // duplicate of first
        valid5Validators[2],
        valid5Validators[3],
        valid5Validators[4],
      ];
      expect(() => validateValidators(withDuplicates)).to.throw("Duplicate validator detected");
    });
  });

  describe("2. Token Verification Guard (`verifyToken`)", () => {
    it("should reject non-address strings", async () => {
      let err: any = null;
      try {
        await verifyToken("invalid-address", deployerAddress);
      } catch (e: any) {
        err = e;
      }
      expect(err).to.not.be.null;
      expect(err.message).to.include("Invalid token address format");
    });

    it("should reject the zero address", async () => {
      let err: any = null;
      try {
        await verifyToken(ethers.ZeroAddress, deployerAddress);
      } catch (e: any) {
        err = e;
      }
      expect(err).to.not.be.null;
      expect(err.message).to.include("cannot be the zero address");
    });

    it("should reject addresses with no contract bytecode (EOA)", async () => {
      const eoa = ethers.Wallet.createRandom().address;
      let err: any = null;
      try {
        await verifyToken(eoa, deployerAddress);
      } catch (e: any) {
        err = e;
      }
      expect(err).to.not.be.null;
      expect(err.message).to.include("No contract bytecode found");
    });

    it("should successfully verify a valid 6-decimal USDC contract", async () => {
      const usdcAddress = await mockUsdc.getAddress();
      const result = await verifyToken(usdcAddress, deployerAddress);

      expect(result.address).to.equal(usdcAddress);
      expect(result.decimals).to.equal(6);
      expect(result.symbol).to.equal("USDC");
      expect(result.name).to.equal("USD Coin");
      expect(result.hasBytecode).to.be.true;
    });
  });

  describe("3. Deterministic Deployment Record Safety", () => {
    const testRecord: DeploymentRecord = {
      network: "test-network",
      chainId: "999999",
      timestamp: new Date().toISOString(),
      deployer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      usdcToken: {
        address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        isMock: false,
      },
      validators: valid5Validators,
      openAidEscrow: {
        address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
        transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        blockNumber: 42,
      },
    };

    const targetFile = path.join(__dirname, "..", "deployments", "test-network-999999.json");

    after(() => {
      // Clean up test file
      if (fs.existsSync(targetFile)) {
        fs.unlinkSync(targetFile);
      }
    });

    it("should write deployment record when file does not exist", () => {
      if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);

      const savedPath = recordDeployment(testRecord);
      expect(fs.existsSync(savedPath)).to.be.true;

      const content = JSON.parse(fs.readFileSync(savedPath, "utf8"));
      expect(content.chainId).to.equal("999999");
      expect(content.openAidEscrow.address).to.equal(testRecord.openAidEscrow.address);
    });

    it("should refuse to overwrite an existing deployment record without explicit OVERWRITE_DEPLOYMENT flag", () => {
      delete process.env.OVERWRITE_DEPLOYMENT;

      expect(() => recordDeployment(testRecord)).to.throw(
        "already exists! Set OVERWRITE_DEPLOYMENT=\"true\" to intentionally replace."
      );
    });

    it("should permit overwrite when OVERWRITE_DEPLOYMENT='true' is set", () => {
      process.env.OVERWRITE_DEPLOYMENT = "true";
      const savedPath = recordDeployment(testRecord);
      expect(fs.existsSync(savedPath)).to.be.true;
      delete process.env.OVERWRITE_DEPLOYMENT;
    });
  });
});
