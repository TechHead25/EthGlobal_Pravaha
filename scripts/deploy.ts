import { ethers } from "hardhat";

async function main() {
  console.log("=== OpenAid Protocol — Local / Testnet Deployment ===");

  const [deployer, val1, val2, val3, val4, val5] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // 1. Deploy Mock USDC (6 decimals)
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  // 2. Deploy OpenAidEscrow with initial 5 validators
  const validators = [
    val1.address,
    val2.address,
    val3.address,
    val4.address,
    val5.address,
  ];

  const OpenAidEscrow = await ethers.getContractFactory("OpenAidEscrow");
  const escrow = await OpenAidEscrow.deploy(usdcAddress, validators);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("OpenAidEscrow deployed to:", escrowAddress);

  console.log("\nDeployment complete!");
  console.log({
    NEXT_PUBLIC_USDC_ADDRESS: usdcAddress,
    NEXT_PUBLIC_ESCROW_ADDRESS: escrowAddress,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
