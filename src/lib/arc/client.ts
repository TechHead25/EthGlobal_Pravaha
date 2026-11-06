import { ethers } from "ethers";
import { OPENAID_ESCROW_ABI, ERC20_ABI } from "./abis";
import { ARC_TESTNET_CONFIG } from "./config";
import {
  CampaignState,
  CAMPAIGN_STATE_LABELS,
  OnChainCampaign,
  ContractAccounting,
  FundingStatus,
} from "./types";
import { isValidAddress, needsAllowanceApproval } from "./validation";

/**
 * Reads public on-chain accounting from the deployed OpenAidEscrow contract and USDC token.
 */
export async function fetchEscrowAccounting(
  provider: ethers.Provider,
  escrowAddress: string,
  userAddress?: string | null
): Promise<ContractAccounting> {
  if (!isValidAddress(escrowAddress)) {
    throw new Error(`Invalid escrow address format: "${escrowAddress}"`);
  }

  // 1. Verify escrow contract bytecode exists
  const bytecode = await provider.getCode(escrowAddress);
  if (!bytecode || bytecode === "0x") {
    return {
      campaignCount: 0,
      escrowAddress,
      usdcAddress: "",
      tokenDecimals: 6,
      tokenSymbol: "USDC",
      userUsdcBalance: 0n,
      userAllowance: 0n,
      userDonorDeposit: 0n,
      escrowUsdcBalance: 0n,
      hasBytecode: false,
    };
  }

  const escrow = new ethers.Contract(escrowAddress, OPENAID_ESCROW_ABI, provider);

  // 2. Fetch basic parameters & token address
  const [rawCampaignCount, usdcAddress] = await Promise.all([
    escrow.campaignCount(),
    escrow.usdcToken(),
  ]);

  const campaignCount = Number(rawCampaignCount);

  // 3. Verify USDC token contract
  const usdcBytecode = await provider.getCode(usdcAddress);
  if (!usdcBytecode || usdcBytecode === "0x") {
    throw new Error(`USDC token address ${usdcAddress} contains no contract bytecode.`);
  }

  const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, provider);
  const [tokenDecimalsRaw, tokenSymbol, escrowUsdcBalance] = await Promise.all([
    usdc.decimals(),
    usdc.symbol(),
    usdc.balanceOf(escrowAddress),
  ]);

  const tokenDecimals = Number(tokenDecimalsRaw);

  let userUsdcBalance = 0n;
  let userAllowance = 0n;
  let userDonorDeposit = 0n;

  if (userAddress && isValidAddress(userAddress)) {
    const promises: [Promise<bigint>, Promise<bigint>, Promise<bigint>?] = [
      usdc.balanceOf(userAddress),
      usdc.allowance(userAddress, escrowAddress),
    ];

    if (campaignCount > 0) {
      promises.push(escrow.donorDeposits(1, userAddress));
    }

    const [bal, allowance, donorDep] = await Promise.all(promises);
    userUsdcBalance = bal;
    userAllowance = allowance;
    if (donorDep) userDonorDeposit = donorDep;
  }

  return {
    campaignCount,
    escrowAddress,
    usdcAddress,
    tokenDecimals,
    tokenSymbol,
    userUsdcBalance,
    userAllowance,
    userDonorDeposit,
    escrowUsdcBalance,
    hasBytecode: true,
  };
}

/**
 * Fetches campaign data for a specific campaign ID from OpenAidEscrow.
 */
export async function fetchOnChainCampaign(
  provider: ethers.Provider,
  escrowAddress: string,
  campaignId: number
): Promise<OnChainCampaign | null> {
  if (!isValidAddress(escrowAddress) || campaignId <= 0) return null;

  try {
    const escrow = new ethers.Contract(escrowAddress, OPENAID_ESCROW_ABI, provider);
    const c = await escrow.getCampaign(campaignId);

    // If campaign does not exist or has zero budget ceiling
    if (!c || c.budgetCeiling === 0n) {
      return null;
    }

    const stateEnum = Number(c.state) as CampaignState;

    return {
      id: Number(c.id),
      creator: c.creator,
      budgetCeiling: c.budgetCeiling,
      totalDeposited: c.totalDeposited,
      fundingDeadline: Number(c.fundingDeadline),
      deliveryDeadline: Number(c.deliveryDeadline),
      metadataCid: c.metadataCid,
      state: stateEnum,
      stateLabel: CAMPAIGN_STATE_LABELS[stateEnum] || `State #${stateEnum}`,
      winningVendor: c.winningVendor,
      winningBidAmount: c.winningBidAmount,
      evidenceIpfsCid: c.evidenceIpfsCid,
      evidenceSubmittedAt: Number(c.evidenceSubmittedAt),
      affirmativeVotes: Number(c.affirmativeVotes),
      negativeVotes: Number(c.negativeVotes),
      stage1Paid: Boolean(c.stage1Paid),
      stage2Paid: Boolean(c.stage2Paid),
      challengeExpiry: Number(c.challengeExpiry),
      isDisputed: Boolean(c.isDisputed),
      disputeEvidenceCid: c.disputeEvidenceCid,
      challenger: c.challenger,
    };
  } catch (err) {
    console.warn(`Failed to fetch campaign #${campaignId} from escrow:`, err);
    return null;
  }
}

/**
 * Orchestrates real two-step USDC funding (approve if necessary, then deposit)
 * Waiting for confirmed on-chain receipts at each stage.
 */
export async function executeFundingDeposit(
  signer: ethers.Signer,
  escrowAddress: string,
  usdcAddress: string,
  campaignId: number,
  parsedAmount: bigint,
  currentAllowance: bigint,
  onStatusUpdate: (status: FundingStatus) => void
): Promise<{ depositTxHash: string }> {
  let approvalTxHash: string | undefined;

  // 1. Approval Phase (only if allowance is insufficient)
  if (needsAllowanceApproval(currentAllowance, parsedAmount)) {
    onStatusUpdate({ step: "awaiting_approval_signature" });
    const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, signer);

    const approveTx = await usdc.approve(escrowAddress, parsedAmount);
    approvalTxHash = approveTx.hash;
    onStatusUpdate({ step: "approving", approvalTxHash });

    const approveReceipt = await approveTx.wait(1);
    if (!approveReceipt || approveReceipt.status !== 1) {
      throw new Error("USDC approval transaction failed or reverted.");
    }
  }

  // 2. Deposit Phase
  onStatusUpdate({ step: "awaiting_deposit_signature", approvalTxHash });
  const escrow = new ethers.Contract(escrowAddress, OPENAID_ESCROW_ABI, signer);

  const depositTx = await escrow.depositFunds(campaignId, parsedAmount);
  const depositTxHash = depositTx.hash;
  onStatusUpdate({ step: "depositing", approvalTxHash, depositTxHash });

  const depositReceipt = await depositTx.wait(1);
  if (!depositReceipt || depositReceipt.status !== 1) {
    throw new Error("Deposit transaction failed or reverted on Arc Testnet.");
  }

  onStatusUpdate({ step: "confirmed", approvalTxHash, depositTxHash });
  return { depositTxHash };
}

/**
 * Requests the browser wallet (e.g. MetaMask) to switch to Arc Testnet or add it.
 */
export async function switchOrAddArcNetwork(ethereum: any): Promise<void> {
  if (!ethereum?.request) {
    throw new Error("No EVM-compatible wallet detected (window.ethereum not found).");
  }

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_TESTNET_CONFIG.chainIdHex }],
    });
  } catch (switchError: any) {
    // Error code 4902 indicates that the chain has not been added to MetaMask
    if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ARC_TESTNET_CONFIG.chainIdHex,
            chainName: ARC_TESTNET_CONFIG.chainName,
            nativeCurrency: ARC_TESTNET_CONFIG.nativeCurrency,
            rpcUrls: ARC_TESTNET_CONFIG.rpcUrls,
            blockExplorerUrls: ARC_TESTNET_CONFIG.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}
