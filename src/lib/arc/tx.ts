import { ethers } from "ethers";
import { OPENAID_ESCROW_FULL_ABI } from "./abis";
import { ARC_TESTNET_CONFIG } from "./config";

/**
 * Framework-free transaction helpers shared by every role workspace. A transaction is only
 * ever reported as "confirmed" after a mined receipt with status === 1.
 */

export type TxPhase = "idle" | "wrong_network" | "awaiting_signature" | "pending" | "confirmed" | "failed" | "rejected";

export interface TxState {
  phase: TxPhase;
  label?: string;
  hash?: string;
  error?: string;
}

export type TxErrorKind = "rejected" | "reverted" | "insufficient_funds" | "wrong_network" | "rpc" | "unknown";

const escrowInterface = new ethers.Interface(OPENAID_ESCROW_FULL_ABI);

const CUSTOM_ERROR_COPY: Record<string, string> = {
  ZeroAmount: "Amount must be greater than zero.",
  InvalidState: "The campaign is not in the required phase for this action.",
  DeadlinePassed: "The deadline for this action has passed.",
  DeadlineNotPassed: "This action is only available after the deadline.",
  BudgetCeilingExceeded: "This deposit would exceed the campaign budget ceiling.",
  Unauthorized: "Your wallet is not authorized for this action on-chain.",
  AlreadyCommitted: "This wallet has already committed or revealed.",
  InvalidCommitment: "The bid amount and salt do not match your sealed commitment.",
  BidExceedsBudget: "The bid exceeds the campaign budget ceiling.",
  NotAnAuthorizedValidator: "This wallet is not in the on-chain validator set.",
  AlreadyVoted: "This validator wallet has already voted on this campaign.",
  ChallengePeriodActive: "The challenge window is still open.",
  DisputePending: "A dispute is pending.",
  NoRefundDue: "No refund is due for this wallet.",
  TransferFailed: "The token transfer failed.",
  InsufficientBond: "Insufficient bond.",
};

function findRevertData(err: unknown): string | null {
  const seen = new Set<unknown>();
  const stack: unknown[] = [err];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const rec = cur as Record<string, unknown>;
    if (typeof rec.data === "string" && /^0x[0-9a-fA-F]{8}/.test(rec.data)) return rec.data;
    for (const k of ["error", "info", "data", "cause"]) if (rec[k]) stack.push(rec[k]);
  }
  return null;
}

export function decodeEscrowError(data: string | null): string | null {
  if (!data) return null;
  try {
    const parsed = escrowInterface.parseError(data);
    if (!parsed) return null;
    return CUSTOM_ERROR_COPY[parsed.name] ?? `Contract rejected the call (${parsed.name}).`;
  } catch {
    return null;
  }
}

export function classifyTxError(err: unknown): { kind: TxErrorKind; message: string } {
  const e = (err ?? {}) as { code?: unknown; message?: unknown; shortMessage?: unknown; info?: { error?: { code?: unknown } } };
  const code = e.code ?? e.info?.error?.code;
  if (code === "ACTION_REJECTED" || code === 4001) {
    return { kind: "rejected", message: "You rejected the request in your wallet. Nothing was submitted." };
  }
  if (code === "INSUFFICIENT_FUNDS") {
    return { kind: "insufficient_funds", message: "This wallet does not have enough USDC to pay network fees." };
  }
  if (code === "NETWORK_ERROR" || code === 4901 || code === 4900) {
    return { kind: "wrong_network", message: `Switch your wallet to ${ARC_TESTNET_CONFIG.chainName}.` };
  }
  const decoded = decodeEscrowError(findRevertData(err));
  if (decoded) return { kind: "reverted", message: decoded };
  if (code === "CALL_EXCEPTION") return { kind: "reverted", message: "The contract rejected this transaction." };
  if (code === "TIMEOUT" || code === "SERVER_ERROR" || code === -32603 || code === -32000) {
    return { kind: "rpc", message: "The network RPC did not respond. Check the explorer before retrying." };
  }
  const msg = typeof e.shortMessage === "string" ? e.shortMessage : typeof e.message === "string" ? e.message : "";
  if (msg.toLowerCase().includes("coalesce")) {
    return { kind: "rpc", message: "RPC confirmation timed out, but the transaction was broadcast to Arc. Check the explorer." };
  }
  return { kind: "unknown", message: msg ? msg.slice(0, 200) : "The transaction could not be completed." };
}

export function isArcChain(chainId: number | bigint | string | null | undefined): boolean {
  if (chainId === null || chainId === undefined) return false;
  const n = typeof chainId === "string" ? Number.parseInt(chainId, chainId.startsWith("0x") ? 16 : 10) : Number(chainId);
  return n === ARC_TESTNET_CONFIG.chainId;
}

/** Matches OpenAidEscrow.revealBid: keccak256(abi.encodePacked(bidAmount, salt, msg.sender)). */
export function computeBidCommitment(bidAmount: bigint, salt: string, vendor: string): string {
  return ethers.solidityPackedKeccak256(["uint256", "bytes32", "address"], [bidAmount, salt, ethers.getAddress(vendor)]);
}

export function randomSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

/** Bid bond required by commitBid: 5% of the budget ceiling (BOND_BASIS_POINTS = 500). */
export function requiredBidBond(budgetCeiling: bigint): bigint {
  return (budgetCeiling * 500n) / 10000n;
}
