import { ethers } from "ethers";
import { ARC_TESTNET_CONFIG } from "./config";

export interface DonationValidationParams {
  amountStr: string;
  decimals: number;
  userBalance: bigint;
  totalDeposited: bigint;
  budgetCeiling: bigint;
}

export interface ValidationResult {
  valid: boolean;
  parsedAmount?: bigint;
  error?: string;
}

/**
 * Validates that the connected chain strictly matches Arc Testnet (5042002).
 */
export function isArcTestnet(chainId: number | bigint | string | null | undefined): boolean {
  if (chainId === null || chainId === undefined) return false;
  try {
    const numeric = typeof chainId === "string" 
      ? (chainId.startsWith("0x") ? parseInt(chainId, 16) : parseInt(chainId, 10))
      : Number(chainId);
    return numeric === ARC_TESTNET_CONFIG.chainId;
  } catch {
    return false;
  }
}

/**
 * Validates Ethereum-compatible address format (rejecting zero address).
 */
export function isValidAddress(address: string | null | undefined): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (!ethers.isAddress(trimmed)) return false;
  if (trimmed.toLowerCase() === ethers.ZeroAddress.toLowerCase()) return false;
  return true;
}

/**
 * Validates donation amount input before requesting any wallet signature.
 * Prevents zero, negative, invalid, excessive and over-budget amounts.
 */
export function validateDonationInput(params: DonationValidationParams): ValidationResult {
  const { amountStr, decimals, userBalance, totalDeposited, budgetCeiling } = params;

  if (!amountStr || amountStr.trim() === "") {
    return { valid: false, error: "Please enter a donation amount." };
  }

  const clean = amountStr.trim();
  const num = parseFloat(clean);
  if (isNaN(num) || num <= 0) {
    return { valid: false, error: "Please enter a positive contribution amount greater than 0." };
  }

  // Check decimal places match token resolution
  const parts = clean.split(".");
  if (parts.length > 2 || (parts[1] && parts[1].length > decimals)) {
    return { valid: false, error: `Amount cannot exceed ${decimals} decimal places for USDC.` };
  }

  let parsedAmount: bigint;
  try {
    parsedAmount = ethers.parseUnits(clean, decimals);
  } catch {
    return { valid: false, error: "Invalid numeric amount format." };
  }

  if (parsedAmount <= 0n) {
    return { valid: false, error: "Contribution amount must be greater than zero." };
  }

  if (parsedAmount > userBalance) {
    const formattedBal = ethers.formatUnits(userBalance, decimals);
    return {
      valid: false,
      error: `Insufficient USDC balance in wallet. Available: ${formattedBal} USDC.`,
    };
  }

  const remainingBudget = budgetCeiling > totalDeposited ? budgetCeiling - totalDeposited : 0n;
  if (parsedAmount > remainingBudget) {
    const formattedRemaining = ethers.formatUnits(remainingBudget, decimals);
    return {
      valid: false,
      error: `Contribution of ${clean} USDC exceeds remaining campaign budget (${formattedRemaining} USDC).`,
    };
  }

  return { valid: true, parsedAmount };
}

/**
 * Determines whether an ERC-20 approval transaction is strictly necessary.
 */
export function needsAllowanceApproval(currentAllowance: bigint, requiredAmount: bigint): boolean {
  return currentAllowance < requiredAmount;
}

/**
 * Human-friendly error parser for Ethereum / wallet provider exceptions.
 */
export function parseEthereumError(err: any): string {
  if (!err) return "Unknown error occurred.";

  const msg = err.message || (typeof err === "string" ? err : "");
  const code = err.code || err?.error?.code;

  // EIP-1193 user rejection
  if (code === 4001 || msg.includes("User rejected") || msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
    return "Transaction signature rejected in wallet.";
  }

  // Network mismatch
  if (code === 4902 || msg.includes("Unrecognized chain ID") || msg.includes("chain not added")) {
    return "Arc Testnet (5042002) is not configured in your wallet. Please approve network addition.";
  }

  // Native gas balance issues
  if (msg.includes("insufficient funds for gas") || msg.includes("insufficient funds") || code === "INSUFFICIENT_FUNDS") {
    return "Insufficient native USDC for gas fees on Arc Testnet. Please fund your wallet via Circle Faucet.";
  }

  // Contract custom errors
  if (msg.includes("BudgetCeilingExceeded")) {
    return "Contract Error: Contribution exceeds the campaign's budget ceiling.";
  }
  if (msg.includes("DeadlinePassed")) {
    return "Contract Error: The campaign funding deadline has already expired.";
  }
  if (msg.includes("InvalidState")) {
    return "Contract Error: Campaign is not currently in the FundingActive state.";
  }
  if (msg.includes("ZeroAmount")) {
    return "Contract Error: Contribution amount cannot be zero.";
  }
  if (msg.includes("Unauthorized")) {
    return "Contract Error: Caller is not authorized for this action.";
  }

  if (err.reason) return `Contract revert: ${err.reason}`;
  if (err.shortMessage) return err.shortMessage;

  return msg.length > 120 ? `${msg.slice(0, 120)}...` : msg;
}

export function formatAddress(address: string | null | undefined, chars = 4): string {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
