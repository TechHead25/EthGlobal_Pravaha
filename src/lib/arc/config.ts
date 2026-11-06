/**
 * OpenAid Protocol — Arc Testnet Network & Contract Configuration
 * Sourced directly from official Arc documentation: https://docs.arc.network/
 */

export const ARC_TESTNET_CONFIG = {
  chainId: 5042002,
  chainIdHex: "0x4cef52",
  chainName: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: [
    process.env.NEXT_PUBLIC_ARC_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.testnet.arc.network",
    "https://arc-testnet.drpc.org",
  ],
  blockExplorerUrls: [
    process.env.NEXT_PUBLIC_BLOCK_EXPLORER || "https://testnet.arcscan.app",
  ],
  // Deployed OpenAidEscrow contract on Arc Testnet
  defaultEscrowAddress: "0xe38151283e55077F621988679f2Cc524b785d236",
  // Official Arc Testnet USDC ERC-20 contract (6 decimals)
  defaultUsdcAddress: "0x3600000000000000000000000000000000000000",
  expectedUsdcDecimals: 6,
} as const;

export function getEscrowAddress(): string {
  const envAddr = process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
  if (envAddr && /^0x[0-9a-fA-F]{40}$/.test(envAddr.trim())) {
    return envAddr.trim();
  }
  return ARC_TESTNET_CONFIG.defaultEscrowAddress;
}

export function getExplorerTxUrl(txHash: string): string {
  const base = ARC_TESTNET_CONFIG.blockExplorerUrls[0].replace(/\/$/, "");
  return `${base}/tx/${txHash}`;
}

export function getExplorerAddressUrl(address: string): string {
  const base = ARC_TESTNET_CONFIG.blockExplorerUrls[0].replace(/\/$/, "");
  return `${base}/address/${address}`;
}
