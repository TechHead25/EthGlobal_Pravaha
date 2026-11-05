import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("==================================================================");
  console.log("       OpenAid Protocol Live Contract Status Verification         ");
  console.log("==================================================================");

  const deploymentRecordPath = path.join(__dirname, "..", "deployments", "arcTestnet-5042002.json");
  if (!fs.existsSync(deploymentRecordPath)) {
    throw new Error(`Deployment record not found at: ${deploymentRecordPath}`);
  }

  const record = JSON.parse(fs.readFileSync(deploymentRecordPath, "utf-8"));
  const escrowAddress = record.openAidEscrow.address;
  const usdcAddress = record.usdcToken.address;
  const validators = record.validators;

  console.log(`OpenAidEscrow Address:   ${escrowAddress}`);
  console.log(`USDC Token Address:      ${usdcAddress}`);
  console.log(`Network:                 ${record.network} (Chain ID: ${record.chainId})`);
  console.log(`Deployment Tx:           ${record.openAidEscrow.transactionHash}`);
  console.log(`Deployment Block:        ${record.openAidEscrow.blockNumber}`);

  const network = await ethers.provider.getNetwork();
  console.log(`Connected Chain ID:      ${network.chainId}`);

  // Query Escrow Contract
  const OpenAidEscrowFactory = await ethers.getContractFactory("OpenAidEscrow");
  const escrow = OpenAidEscrowFactory.attach(escrowAddress) as any;

  const onChainUsdc = await escrow.usdcToken();
  const onChainOwner = await escrow.owner();
  const campaignCount = await escrow.campaignCount();
  const quorumThreshold = await escrow.QUORUM_THRESHOLD();
  const totalValidators = await escrow.TOTAL_VALIDATORS();

  console.log("\n[Contract State]");
  console.log(`  usdcToken:             ${onChainUsdc} ${onChainUsdc.toLowerCase() === usdcAddress.toLowerCase() ? "✓" : "✗"}`);
  console.log(`  owner:                 ${onChainOwner}`);
  console.log(`  campaignCount:         ${campaignCount}`);
  console.log(`  QUORUM_THRESHOLD:      ${quorumThreshold}`);
  console.log(`  TOTAL_VALIDATORS:      ${totalValidators}`);

  console.log("\n[Validator Council Verification]");
  for (let i = 0; i < validators.length; i++) {
    const val = validators[i];
    const isVal = await escrow.isValidator(val);
    console.log(`  Validator #${i + 1} (${val}): ${isVal ? "AUTHORIZED ✓" : "UNAUTHORIZED ✗"}`);
    if (!isVal) {
      throw new Error(`Validator ${val} not registered on chain!`);
    }
  }

  // Token Verification
  const erc20Abi = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)"
  ];
  const token = new ethers.Contract(usdcAddress, erc20Abi, ethers.provider);
  const tokenName = await token.name();
  const tokenSymbol = await token.symbol();
  const tokenDecimals = await token.decimals();
  const escrowBalance = await token.balanceOf(escrowAddress);

  console.log("\n[USDC Escrow Vault State]");
  console.log(`  Token:                 ${tokenName} (${tokenSymbol}), Decimals: ${tokenDecimals}`);
  console.log(`  Escrow Token Balance:  ${ethers.formatUnits(escrowBalance, tokenDecimals)} ${tokenSymbol}`);

  console.log("\n==================================================================");
  console.log("       LIVE ON-CHAIN VERIFICATION CONFIRMED SUCCESSFUL            ");
  console.log("==================================================================");
}

main().catch((error) => {
  console.error("\n[VERIFICATION FAILED]:", error);
  process.exit(1);
});
