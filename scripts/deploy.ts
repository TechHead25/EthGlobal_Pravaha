import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { verifyToken, TokenVerificationResult } from "./verify-token";

export interface DeploymentConfig {
  networkName: string;
  chainId: bigint;
  isLocal: boolean;
  deployerAddress: string;
  usdcAddress: string;
  isMockUsdc: boolean;
  validators: string[];
}

export interface DeploymentRecord {
  network: string;
  chainId: string;
  timestamp: string;
  deployer: string;
  usdcToken: {
    address: string;
    isMock: boolean;
    verification?: TokenVerificationResult;
  };
  validators: string[];
  openAidEscrow: {
    address: string;
    transactionHash: string;
    blockNumber: number;
  };
}

/**
 * @notice Validates and parses validator addresses.
 *         Ensures exactly 5 non-zero, valid, unique Ethereum addresses.
 */
export function validateValidators(validators: string[]): string[] {
  if (!Array.isArray(validators) || validators.length !== 5) {
    throw new Error(
      `[ValidationError] Exactly 5 validator addresses are required. Provided: ${
        validators ? validators.length : 0
      }`
    );
  }

  const normalized = new Set<string>();

  for (let i = 0; i < validators.length; i++) {
    const addr = validators[i];
    if (!addr || typeof addr !== "string") {
      throw new Error(`[ValidationError] Validator #${i + 1} is missing or not a string.`);
    }

    if (!ethers.isAddress(addr)) {
      throw new Error(`[ValidationError] Validator #${i + 1} has an invalid address format: '${addr}'`);
    }

    if (addr.toLowerCase() === ethers.ZeroAddress.toLowerCase()) {
      throw new Error(`[ValidationError] Validator #${i + 1} cannot be the zero address.`);
    }

    const lower = addr.toLowerCase();
    if (normalized.has(lower)) {
      throw new Error(
        `[ValidationError] Duplicate validator detected: '${addr}'. All 5 validators must be unique.`
      );
    }
    normalized.add(lower);
  }

  return validators;
}

/**
 * @notice Resolves configuration for deployment based on the target network.
 *         Enforces strict remote vs local rules.
 */
export async function resolveDeploymentConfig(): Promise<DeploymentConfig> {
  const currentNetwork = await ethers.provider.getNetwork();
  const chainId = currentNetwork.chainId;
  const networkName = network.name;

  const isLocal = chainId === 31337n || networkName === "hardhat" || networkName === "localhost";

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "[ConfigError] No deployer account available. Ensure DEPLOYER_PRIVATE_KEY is configured for remote deployment."
    );
  }
  const deployer = signers[0];

  // Remote Network Validation: Arc Testnet (Chain ID 5042002)
  if (!isLocal) {
    // 1. Verify expected Chain ID for Arc Testnet
    const ARC_TESTNET_CHAIN_ID = 5042002n;
    if (networkName === "arcTestnet" && chainId !== ARC_TESTNET_CHAIN_ID) {
      throw new Error(
        `[ChainIdMismatch] Connected chain ID (${chainId}) does not match expected Arc Testnet chain ID (${ARC_TESTNET_CHAIN_ID}). Aborting deployment.`
      );
    }

    // 2. Prohibit MockUSDC on Arc Testnet / Remote networks
    let externalUsdc = process.env.ARC_USDC_TOKEN_ADDRESS || process.env.USDC_TOKEN_ADDRESS;
    if (!externalUsdc && networkName === "arcTestnet") {
      externalUsdc = "0x3600000000000000000000000000000000000000";
      console.log(`[Info] ARC_USDC_TOKEN_ADDRESS not provided; using official Arc Testnet USDC: ${externalUsdc}`);
    }

    if (!externalUsdc) {
      throw new Error(
        `[ConfigError] Refusing to deploy to remote network '${networkName}': ARC_USDC_TOKEN_ADDRESS must be explicitly provided. MockUSDC deployment is strictly prohibited on Arc Testnet.`
      );
    }

    if (!ethers.isAddress(externalUsdc) || externalUsdc === ethers.ZeroAddress) {
      throw new Error(
        `[ConfigError] Invalid ARC_USDC_TOKEN_ADDRESS: '${externalUsdc}'. Must be a valid non-zero contract address.`
      );
    }

    // 3. Remote networks must explicitly configure all 5 validators
    const val1 = process.env.VALIDATOR_1;
    const val2 = process.env.VALIDATOR_2;
    const val3 = process.env.VALIDATOR_3;
    const val4 = process.env.VALIDATOR_4;
    const val5 = process.env.VALIDATOR_5;

    const rawValidators = [val1, val2, val3, val4, val5].filter(Boolean) as string[];
    if (rawValidators.length !== 5) {
      throw new Error(
        `[ConfigError] Remote deployment requires exactly 5 configured validators (VALIDATOR_1 through VALIDATOR_5). Found: ${rawValidators.length}.`
      );
    }

    const validatedValidators = validateValidators(rawValidators);

    return {
      networkName,
      chainId,
      isLocal: false,
      deployerAddress: deployer.address,
      usdcAddress: externalUsdc,
      isMockUsdc: false,
      validators: validatedValidators,
    };
  }

  // Local Development Configuration
  let usdcAddress = process.env.ARC_USDC_TOKEN_ADDRESS || process.env.USDC_TOKEN_ADDRESS || "";
  let isMockUsdc = false;

  if (!usdcAddress) {
    isMockUsdc = true;
  }

  // For local tests, derive 5 distinct validators from available signers or deterministic addresses
  let localValidators: string[] = [];
  if (signers.length >= 6) {
    localValidators = [
      signers[1].address,
      signers[2].address,
      signers[3].address,
      signers[4].address,
      signers[5].address,
    ];
  } else {
    // Generate deterministic local validator addresses if fewer signers exist
    localValidators = [
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
      "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    ];
  }

  validateValidators(localValidators);

  return {
    networkName,
    chainId,
    isLocal: true,
    deployerAddress: deployer.address,
    usdcAddress,
    isMockUsdc,
    validators: localValidators,
  };
}

/**
 * @notice Deterministically saves deployment records to disk without overwriting prior deployments.
 */
export function recordDeployment(record: DeploymentRecord): string {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `${record.network}-${record.chainId}.json`;
  const filePath = path.join(deploymentsDir, filename);

  // Guard against accidental overwrites
  if (fs.existsSync(filePath) && process.env.OVERWRITE_DEPLOYMENT !== "true") {
    throw new Error(
      `[DeploymentRecordError] Deployment record '${filename}' already exists! Set OVERWRITE_DEPLOYMENT="true" to intentionally replace.`
    );
  }

  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
  return filePath;
}

export async function main() {
  console.log("==================================================================");
  console.log("             OpenAid Protocol Deployment Orchestration            ");
  console.log("==================================================================");

  const config = await resolveDeploymentConfig();

  console.log(`Target Network:       ${config.networkName}`);
  console.log(`Chain ID:             ${config.chainId}`);
  console.log(`Deployer Address:     ${config.deployerAddress}`);
  console.log(`Deployment Mode:      ${config.isLocal ? "LOCAL_DEV" : "REMOTE_TESTNET"}`);

  const [deployer] = await ethers.getSigners();
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer Balance:     ${ethers.formatEther(deployerBalance)} Native Token`);

  if (deployerBalance === 0n && !config.isLocal) {
    throw new Error(
      `[InsufficientFunds] Deployer address ${deployer.address} has 0 balance on ${config.networkName}. Fund the account before deploying.`
    );
  }

  let finalUsdcAddress = config.usdcAddress;
  let tokenVerification: TokenVerificationResult | undefined;

  // 1. Token Setup / Verification
  if (config.isMockUsdc) {
    console.log("\n[Step 1] Deploying MockUSDC for local testing...");
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDCFactory.deploy();
    await mockUsdc.waitForDeployment();
    finalUsdcAddress = await mockUsdc.getAddress();
    console.log(`[Success] MockUSDC deployed at: ${finalUsdcAddress}`);
  } else {
    console.log(`\n[Step 1] Verifying external USDC contract at: ${finalUsdcAddress}...`);
    tokenVerification = await verifyToken(finalUsdcAddress, config.deployerAddress);
    console.log(`[Success] External token verified: ${tokenVerification.name} (${tokenVerification.symbol}), Decimals: ${tokenVerification.decimals}`);
  }

  // 2. Display Validators
  console.log("\n[Step 2] Validating initial 5-member Validator Council:");
  config.validators.forEach((v, idx) => {
    console.log(`  Validator #${idx + 1}: ${v}`);
  });

  // 3. Deploy OpenAidEscrow
  console.log("\n[Step 3] Deploying OpenAidEscrow contract...");
  const EscrowFactory = await ethers.getContractFactory("OpenAidEscrow");
  const escrow = await EscrowFactory.deploy(finalUsdcAddress, config.validators);

  console.log("Waiting for deployment transaction confirmation...");
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  const deploymentTx = escrow.deploymentTransaction();

  if (!deploymentTx) {
    throw new Error("[DeploymentError] Failed to retrieve deployment transaction.");
  }

  const receipt = await deploymentTx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error("[DeploymentError] Deployment transaction failed or reverted.");
  }

  console.log("==================================================================");
  console.log("                   DEPLOYMENT SUCCESSFUL                          ");
  console.log("==================================================================");
  console.log(`OpenAidEscrow Address:   ${escrowAddress}`);
  console.log(`USDC Token Address:      ${finalUsdcAddress}`);
  console.log(`Transaction Hash:        ${deploymentTx.hash}`);
  console.log(`Block Number:            ${receipt.blockNumber}`);
  console.log(`Gas Used:                ${receipt.gasUsed.toString()}`);

  // 4. Save Deterministic Deployment Record
  const record: DeploymentRecord = {
    network: config.networkName,
    chainId: config.chainId.toString(),
    timestamp: new Date().toISOString(),
    deployer: config.deployerAddress,
    usdcToken: {
      address: finalUsdcAddress,
      isMock: config.isMockUsdc,
      verification: tokenVerification,
    },
    validators: config.validators,
    openAidEscrow: {
      address: escrowAddress,
      transactionHash: deploymentTx.hash,
      blockNumber: receipt.blockNumber,
    },
  };

  const recordPath = recordDeployment(record);
  console.log(`\nDeployment Record Saved: ${recordPath}`);
  console.log("==================================================================");

  return { escrowAddress, usdcAddress: finalUsdcAddress };
}

if (require.main === module) {
  main().catch((error) => {
    console.error("\n[DEPLOYMENT FAILED]:", error.message);
    if (
      error.message?.includes("Connect Timeout") ||
      error.message?.includes("timeout") ||
      error.code === "UND_ERR_CONNECT_TIMEOUT"
    ) {
      console.error("\n[Troubleshooting Connect Timeout]:");
      console.error("  1. The RPC endpoint timed out while establishing a connection.");
      console.error("  2. Try switching to the alternative fast Arc Testnet RPC by setting in your .env:");
      console.error('     ARC_TESTNET_RPC_URL="https://arc-testnet.drpc.org"');
      console.error("  3. Ensure your network allows outbound HTTPS connections to port 443.");
    }
    process.exitCode = 1;
  });
}
