import { ethers } from "hardhat";

// Standard Minimal ERC-20 ABI for verification
const ERC20_VERIFICATION_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

export const OFFICIAL_ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000";

export interface TokenVerificationResult {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  deployerBalance: string;
  hasBytecode: boolean;
}

/**
 * @notice Verifies that a target token contract is a valid, compatible ERC-20 token on the connected network.
 * @dev Reverts if the address has no bytecode, lacks ERC-20 methods, or has incompatible decimals.
 */
export async function verifyToken(
  tokenAddress: string,
  deployerAddress?: string
): Promise<TokenVerificationResult> {
  if (!ethers.isAddress(tokenAddress)) {
    throw new Error(`[TokenVerificationError] Invalid token address format: '${tokenAddress}'`);
  }

  if (tokenAddress === ethers.ZeroAddress) {
    throw new Error("[TokenVerificationError] Token address cannot be the zero address (0x0).");
  }

  const provider = ethers.provider;

  // 1. Check for contract bytecode
  const code = await provider.getCode(tokenAddress);
  if (!code || code === "0x" || code === "0x0") {
    throw new Error(
      `[TokenVerificationError] No contract bytecode found at token address '${tokenAddress}'. Ensure the contract is deployed on this network.`
    );
  }

  // 2. Instantiate ERC-20 interface
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_VERIFICATION_ABI, provider);

  // 3. Query metadata and verify methods exist
  let name = "UNKNOWN";
  let symbol = "UNKNOWN";
  let decimals = 0;
  let totalSupply = 0n;
  let deployerBalance = 0n;

  try {
    decimals = Number(await tokenContract.decimals());
  } catch (err: any) {
    throw new Error(
      `[TokenVerificationError] Token at '${tokenAddress}' does not expose a callable 'decimals()' method: ${err.message}`
    );
  }

  // Verify decimals compatibility with OpenAid Protocol (USDC standard is 6 decimals)
  if (decimals !== 6) {
    throw new Error(
      `[TokenVerificationError] Incompatible token decimals: expected 6 (USDC standard), but token reports ${decimals}. OpenAid accounting assumes 6 decimals.`
    );
  }

  try {
    name = await tokenContract.name();
  } catch {
    name = "UNAVAILABLE";
  }

  try {
    symbol = await tokenContract.symbol();
  } catch {
    symbol = "UNAVAILABLE";
  }

  try {
    totalSupply = await tokenContract.totalSupply();
  } catch {
    totalSupply = 0n;
  }

  // 4. Test interaction: query deployer balance if deployer address is provided
  if (deployerAddress && deployerAddress !== ethers.ZeroAddress) {
    try {
      deployerBalance = await tokenContract.balanceOf(deployerAddress);
    } catch (err: any) {
      throw new Error(
        `[TokenVerificationError] Failed to call 'balanceOf(${deployerAddress})': ${err.message}`
      );
    }
  }

  return {
    address: tokenAddress,
    name,
    symbol,
    decimals,
    totalSupply: totalSupply.toString(),
    deployerBalance: deployerBalance.toString(),
    hasBytecode: true,
  };
}

// Standalone execution support
async function main() {
  const network = await ethers.provider.getNetwork();
  let tokenAddress = process.env.ARC_USDC_TOKEN_ADDRESS || process.env.USDC_TOKEN_ADDRESS;

  // If on Arc Testnet and no address explicitly passed, default to official Arc USDC ERC-20 address
  if (!tokenAddress && (network.chainId === 5042002n || network.name === "arcTestnet")) {
    tokenAddress = OFFICIAL_ARC_TESTNET_USDC;
    console.log(`[Info] ARC_USDC_TOKEN_ADDRESS not provided in .env; defaulting to official Arc Testnet USDC: ${tokenAddress}`);
  }

  if (!tokenAddress) {
    console.error("Error: Please set ARC_USDC_TOKEN_ADDRESS or USDC_TOKEN_ADDRESS in your environment or .env file.");
    process.exit(1);
  }

  const signers = await ethers.getSigners();
  const deployerAddress = signers.length > 0 ? signers[0].address : undefined;

  console.log("==================================================================");
  console.log("            OpenAid Protocol — Token Contract Verification        ");
  console.log("==================================================================");
  console.log(`Target Network:       ${network.name}`);
  console.log(`Chain ID:             ${network.chainId}`);
  console.log(`Token Address:        ${tokenAddress}`);
  console.log(`Deployer Account:     ${deployerAddress || "(Not configured in DEPLOYER_PRIVATE_KEY - read-only check)"}`);

  const result = await verifyToken(tokenAddress, deployerAddress);

  console.log("\n[SUCCESS] Token Contract Verified on Connected Network:");
  console.log(`  Token Name:         ${result.name}`);
  console.log(`  Token Symbol:       ${result.symbol}`);
  console.log(`  Token Decimals:     ${result.decimals} (Compatible with OpenAid Escrow)`);
  console.log(`  Total Supply:       ${result.totalSupply}`);
  if (deployerAddress) {
    console.log(`  Deployer Balance:   ${result.deployerBalance}`);
  }
  console.log("==================================================================");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("\n[Token Verification Failed]:", err.message);
    process.exit(1);
  });
}
