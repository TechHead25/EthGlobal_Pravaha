"use client";

import * as React from "react";
import { ethers } from "ethers";
import { toast } from "sonner";
import { ARC_TESTNET_CONFIG, getEscrowAddress, getExplorerTxUrl } from "@/lib/arc/config";
import { OPENAID_ESCROW_FULL_ABI, ERC20_ABI } from "@/lib/arc/abis";
import { switchOrAddArcNetwork } from "@/lib/arc/client";
import { classifyTxError, isArcChain, type TxState } from "@/lib/arc/tx";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
};

function getEthereum(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null) as Eip1193 | null;
}

interface WalletContextValue {
  available: boolean;
  address: string | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  /** Read-only provider pinned to Arc Testnet (independent of the wallet's network). */
  readProvider: ethers.JsonRpcProvider;
  escrowAddress: string;
  /** Run a wallet transaction with consistent pending/confirmed/failed handling. */
  runTx: (label: string, send: (ctx: { signer: ethers.Signer; escrow: ethers.Contract; usdc: (addr: string) => ethers.Contract }) => Promise<ethers.TransactionResponse>) => Promise<ethers.TransactionReceipt | null>;
  tx: TxState;
}

const WalletContext = React.createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [available, setAvailable] = React.useState(false);
  const [address, setAddress] = React.useState<string | null>(null);
  const [chainId, setChainId] = React.useState<number | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [tx, setTx] = React.useState<TxState>({ phase: "idle" });

  const readProvider = React.useMemo(
    () =>
      new ethers.JsonRpcProvider(
        ARC_TESTNET_CONFIG.rpcUrls[0],
        { chainId: ARC_TESTNET_CONFIG.chainId, name: "arcTestnet" },
        { staticNetwork: true }
      ),
    []
  );
  const escrowAddress = React.useMemo(() => getEscrowAddress(), []);

  // Passive detection: never prompts the user; only reads already-authorized accounts.
  React.useEffect(() => {
    const eth = getEthereum();
    setAvailable(Boolean(eth));
    if (!eth) return;
    let active = true;
    eth.request({ method: "eth_accounts" }).then((a) => {
      if (active && Array.isArray(a) && a[0]) setAddress(ethers.getAddress(String(a[0])));
    }).catch(() => undefined);
    eth.request({ method: "eth_chainId" }).then((c) => {
      if (active) setChainId(Number.parseInt(String(c), 16));
    }).catch(() => undefined);

    const onAccounts = (...args: unknown[]) => {
      const a = args[0];
      setAddress(Array.isArray(a) && a[0] ? ethers.getAddress(String(a[0])) : null);
      setTx({ phase: "idle" });
    };
    const onChain = (...args: unknown[]) => setChainId(Number.parseInt(String(args[0]), 16));
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      active = false;
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = React.useCallback(async () => {
    const eth = getEthereum();
    if (!eth) {
      toast.error("No browser wallet detected", { description: "Install an EVM wallet such as MetaMask to continue." });
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts?.[0]) setAddress(ethers.getAddress(accounts[0]));
      const c = (await eth.request({ method: "eth_chainId" })) as string;
      setChainId(Number.parseInt(c, 16));
    } catch (err) {
      const { message } = classifyTxError(err);
      toast.error("Wallet connection failed", { description: message });
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchNetwork = React.useCallback(async () => {
    try {
      await switchOrAddArcNetwork(getEthereum());
    } catch (err) {
      toast.error("Could not switch network", { description: classifyTxError(err).message });
    }
  }, []);

  const isCorrectNetwork = isArcChain(chainId);

  const runTx = React.useCallback<WalletContextValue["runTx"]>(
    async (label, send) => {
      const eth = getEthereum();
      if (!eth || !address) {
        toast.error("Connect a wallet first");
        return null;
      }
      if (!isCorrectNetwork) {
        setTx({ phase: "wrong_network", label });
        toast.error("Wrong network", { description: `Switch your wallet to ${ARC_TESTNET_CONFIG.chainName} (chain ${ARC_TESTNET_CONFIG.chainId}).` });
        return null;
      }
      setTx({ phase: "awaiting_signature", label });
      const toastId = toast.loading(`${label}: confirm in your wallet…`);
      try {
        const browser = new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
        const signer = await browser.getSigner();
        // Re-verify the signer's chain at send time; the wallet may have switched.
        const net = await browser.getNetwork();
        if (!isArcChain(net.chainId)) throw Object.assign(new Error("wrong network"), { code: 4901 });
        const escrow = new ethers.Contract(escrowAddress, OPENAID_ESCROW_FULL_ABI, signer);
        const usdc = (addr: string) => new ethers.Contract(addr, ERC20_ABI, signer);
        const response = await send({ signer, escrow, usdc });
        setTx({ phase: "pending", label, hash: response.hash });
        toast.loading(`${label}: pending on Arc Testnet…`, { id: toastId, description: response.hash.slice(0, 18) + "…" });
        let receipt: ethers.TransactionReceipt | null = null;
        try {
          receipt = await response.wait(1);
        } catch (waitErr) {
          // Fallback: If the wallet's RPC node throws "could not coalesce error" or times out,
          // query the public readProvider directly using the known tx hash.
          try {
            receipt = await readProvider.waitForTransaction(response.hash, 1, 15000);
          } catch {
            receipt = await readProvider.getTransactionReceipt(response.hash);
          }
          if (!receipt) {
            throw waitErr;
          }
        }
        if (!receipt || receipt.status !== 1) throw Object.assign(new Error("reverted"), { code: "CALL_EXCEPTION" });
        setTx({ phase: "confirmed", label, hash: response.hash });
        toast.success(`${label}: confirmed`, {
          id: toastId,
          description: `Block ${receipt.blockNumber}`,
          action: { label: "Explorer", onClick: () => window.open(getExplorerTxUrl(response.hash), "_blank", "noopener,noreferrer") },
        });
        return receipt;
      } catch (err) {
        const { kind, message } = classifyTxError(err);
        setTx((prev) => ({ phase: kind === "rejected" ? "rejected" : "failed", label, hash: prev.hash, error: message }));
        if (kind === "rejected") toast.message(`${label}: cancelled`, { id: toastId, description: message });
        else toast.error(`${label}: failed`, { id: toastId, description: message });
        return null;
      }
    },
    [address, isCorrectNetwork, escrowAddress, readProvider]
  );

  const value: WalletContextValue = {
    available,
    address,
    chainId,
    isCorrectNetwork,
    connecting,
    connect,
    switchNetwork,
    readProvider,
    escrowAddress,
    runTx,
    tx,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = React.useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
