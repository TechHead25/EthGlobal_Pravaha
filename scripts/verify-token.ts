import { ethers } from "hardhat";

// Standard Minimal ERC-20 ABI for verification
const ERC20_VERIFICATION_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

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
  deployerAddress: string
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

  // 4. Test interaction: query deployer balance
  try {
    deployerBalance = await tokenContract.balanceOf(deployerAddress);
  } catch (err: any) {
    throw new Error(
      `[TokenVerificationError] Failed to call 'balanceOf(${deployerAddress})': ${err.message}`
    );
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
  const tokenAddress = process.env.ARC_USDC_TOKEN_ADDRESS || process.env.USDC_TOKEN_ADDRESS;
  if (!tokenAddress) {
    console.error("Error: Please set ARC_USDC_TOKEN_ADDRESS or USDC_TOKEN_ADDRESS in your environment.");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("=== Verifying Token Configuration ===");
  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
  console.log(`Checking Token Address: ${tokenAddress}`);
  console.log(`Deployer Account: ${deployer.address}`);

  const result = await verifyToken(tokenAddress, deployer.address);
  console.log("Token Verification Passed Successfully:");
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Token verification failed:", err.message);
    process.exit(1);
  });
}
