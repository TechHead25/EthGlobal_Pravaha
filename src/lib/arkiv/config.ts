/**
 * @file config.ts
 * @notice Arkiv Network configuration and client factory for OpenAid Protocol.
 *         Connects to Rabdi Testnet (Chain ID 7794095) with optional Access Key acceleration.
 */

import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ARKIV_CONFIG = {
  network: process.env.ARKIV_NETWORK || process.env.NEXT_PUBLIC_ARKIV_NETWORK || "rabdi",
  chainId: 7794095,
  rpcUrl:
    process.env.ARKIV_RPC_URL ||
    process.env.NEXT_PUBLIC_ARKIV_RPC_URL ||
    "https://rpc.rabdi.db-chain.testnet.arkiv.network",
  accessKey:
    process.env.ARKIV_ACCESS_KEY ||
    process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ||
    "",
  explorerUrl:
    process.env.NEXT_PUBLIC_ARKIV_EXPLORER ||
    "https://rabdi.explorer.arkiv.network",
  timeoutMs: 15000,
  defaultPageLimit: 20,
  maxPageLimit: 50,
} as const;

export function getArkivChain(accessKeyOverride?: string) {
  const key = accessKeyOverride !== undefined ? accessKeyOverride : ARKIV_CONFIG.accessKey;
  return rabdi({ accessKey: key });
}

/**
 * Creates a public Arkiv client for read-only queries.
 * Safe to use in both frontend and backend environments (requires no private keys).
 */
export function getArkivPublicClient(options?: { rpcUrl?: string; accessKey?: string; timeoutMs?: number }) {
  const accessKey = options?.accessKey !== undefined ? options.accessKey : ARKIV_CONFIG.accessKey;
  const rpcUrl = options?.rpcUrl || ARKIV_CONFIG.rpcUrl;
  const timeout = options?.timeoutMs || ARKIV_CONFIG.timeoutMs;

  return createPublicClient({
    chain: rabdi({ accessKey }),
    transport: http(rpcUrl, { timeout }),
  });
}

/**
 * Creates an authorized Arkiv wallet client for server-side or test operations.
 * Strictly requires an explicit private key; never called with dummy or browser keys.
 */
export function getArkivServerWalletClient(
  privateKey: Hex,
  options?: { rpcUrl?: string; accessKey?: string; timeoutMs?: number }
) {
  const accessKey = options?.accessKey !== undefined ? options.accessKey : ARKIV_CONFIG.accessKey;
  const rpcUrl = options?.rpcUrl || ARKIV_CONFIG.rpcUrl;
  const timeout = options?.timeoutMs || ARKIV_CONFIG.timeoutMs;
  const account = privateKeyToAccount(privateKey);

  return createWalletClient({
    account,
    chain: rabdi({ accessKey }),
    transport: http(rpcUrl, { timeout }),
  });
}

export function getArkivExplorerEntityUrl(entityKey: string): string {
  const cleanKey = entityKey.startsWith("0x") ? entityKey : `0x${entityKey}`;
  return `${ARKIV_CONFIG.explorerUrl}/entity/${cleanKey}`;
}

export function getArkivExplorerTxUrl(txHash: string): string {
  const cleanHash = txHash.startsWith("0x") ? txHash : `0x${txHash}`;
  return `${ARKIV_CONFIG.explorerUrl}/tx/${cleanHash}`;
}
