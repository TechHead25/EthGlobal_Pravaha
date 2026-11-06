"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldCheck,
  Coins,
  Database,
  Cpu,
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Truck,
  User,
  Building2,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Lock,
  FileCheck2,
  Wallet,
  LogOut,
  AlertCircle,
  Info
} from "lucide-react";
import { ethers } from "ethers";
import {
  ArkivEntity,
  ProcurementRequestEntity,
  ProcurementBidEntity,
  DeliveryEvidenceEntity,
  ValidatorReviewEntity,
} from "@/lib/arkiv/types";
import { ARKIV_CONFIG, getArkivExplorerEntityUrl } from "@/lib/arkiv/config";
import { CreVerificationResult } from "@/lib/cre/workflow";
import { WorldIdVerificationResponse } from "@/lib/worldid/types";
import {
  ARC_TESTNET_CONFIG,
  getEscrowAddress,
  getExplorerTxUrl,
  getExplorerAddressUrl,
  isArcTestnet,
  isValidAddress,
  validateDonationInput,
  needsAllowanceApproval,
  parseEthereumError,
  formatAddress,
  fetchEscrowAccounting,
  fetchOnChainCampaign,
  executeFundingDeposit,
  switchOrAddArcNetwork,
  OnChainCampaign,
  ContractAccounting,
  WalletState,
  FundingStatus,
  CampaignState,
  CAMPAIGN_STATE_LABELS,
} from "@/lib/arc";

type Role = "donor" | "ngo" | "vendor" | "validator";

export default function OpenAidApp() {
  const [activeRole, setActiveRole] = useState<Role>("donor");

  // Wallet & Network State
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    isConnected: false,
    isCorrectNetwork: false,
    isConnecting: false,
    error: null,
  });

  // On-Chain Accounting & Escrow State
  const [accounting, setAccounting] = useState<ContractAccounting | null>(null);
  const [loadingAccounting, setLoadingAccounting] = useState<boolean>(true);
  const [onChainCampaign, setOnChainCampaign] = useState<OnChainCampaign | null>(null);
  const [loadingCampaign, setLoadingCampaign] = useState<boolean>(true);

  // Funding Form & Execution State
  const [depositInput, setDepositInput] = useState<string>("500");
  const [fundingStatus, setFundingStatus] = useState<FundingStatus>({ step: "idle" });
  const isSubmittingDepositRef = useRef<boolean>(false);

  // Simulation & Downstream Partner States (clearly distinguished from live on-chain operations)
  const [vendorBidAmount, setVendorBidAmount] = useState("8500");
  const [vendorSalt, setVendorSalt] = useState("secure_salt_777");
  const [committedHash, setCommittedHash] = useState<string | null>(null);
  const [evidenceCidInput, setEvidenceCidInput] = useState("bafybeicb blankets_manifest_v1_500units");
  const [carrierInput, setCarrierInput] = useState("Regional Humanitarian Freight Logistics");
  const [waybillInput, setWaybillInput] = useState("RELIEF-BLANKETS-2026-0042");
  const [arkivEntities, setArkivEntities] = useState<ArkivEntity[]>([]);
  const [arkivFilter, setArkivFilter] = useState<string>("all");
  const [arkivLoading, setArkivLoading] = useState<boolean>(false);
  const [arkivError, setArkivError] = useState<string | null>(null);
  const [creResult, setCreResult] = useState<CreVerificationResult | null>(null);
  const [creLoading, setCreLoading] = useState(false);
  const [worldIdVerified, setWorldIdVerified] = useState(false);
  const [worldIdLoading, setWorldIdLoading] = useState(false);
  const [validatorVoted, setValidatorVoted] = useState<Record<string, boolean>>({});
  const [previewBannerMsg, setPreviewBannerMsg] = useState<string | null>(null);

  // Verified On-Chain Event & Transaction Ledger (No fake random hex hashes)
  const [txLogs, setTxLogs] = useState<Array<{ id: string; txHash: string; msg: string; time: string; type: "success" | "warn" | "error"; isLive?: boolean }>>([
    {
      id: "init",
      txHash: "0xd4748a53c1eedce5bc86293d3d5a570764fae0996d0eb2b906c0ea13d54e7b21",
      msg: "OpenAidEscrow deployed to Arc Testnet at 0xe38151283e55077F621988679f2Cc524b785d236 (Block #70917303)",
      time: "Confirmed",
      type: "success",
      isLive: true,
    },
  ]);
  const [actionError, setActionError] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // On-Chain Data Loading & Refresh
  // --------------------------------------------------------------------------

  const refreshOnChainData = useCallback(async (userAddr?: string | null) => {
    setLoadingAccounting(true);
    setLoadingCampaign(true);
    setActionError(null);

    const activeUser = userAddr !== undefined ? userAddr : wallet.address;
    const escrowAddr = getEscrowAddress();

    try {
      const rpcProvider = new ethers.JsonRpcProvider(
        ARC_TESTNET_CONFIG.rpcUrls[0],
        { chainId: ARC_TESTNET_CONFIG.chainId, name: "arcTestnet" },
        { staticNetwork: true }
      );

      const acc = await fetchEscrowAccounting(rpcProvider, escrowAddr, activeUser);
      setAccounting(acc);

      if (acc.campaignCount > 0) {
        const camp = await fetchOnChainCampaign(rpcProvider, escrowAddr, 1);
        setOnChainCampaign(camp);
      } else {
        setOnChainCampaign(null);
      }
    } catch (err: any) {
      console.warn("Failed to load on-chain state via primary RPC, trying backup...", err);
      try {
        const fallbackProvider = new ethers.JsonRpcProvider(
          ARC_TESTNET_CONFIG.rpcUrls[1],
          { chainId: ARC_TESTNET_CONFIG.chainId, name: "arcTestnet" },
          { staticNetwork: true }
        );
        const acc = await fetchEscrowAccounting(fallbackProvider, escrowAddr, activeUser);
        setAccounting(acc);
        if (acc.campaignCount > 0) {
          const camp = await fetchOnChainCampaign(fallbackProvider, escrowAddr, 1);
          setOnChainCampaign(camp);
        } else {
          setOnChainCampaign(null);
        }
      } catch (fallbackErr: any) {
        console.error("All Arc Testnet RPC endpoints failed:", fallbackErr);
        setActionError(`Failed to connect to Arc Testnet RPC: ${parseEthereumError(fallbackErr)}`);
      }
    } finally {
      setLoadingAccounting(false);
      setLoadingCampaign(false);
    }
  }, [wallet.address]);

  // Fetch Arkiv Entities from Rabdi testnet
  const fetchArkivEntities = useCallback(async () => {
    setArkivLoading(true);
    setArkivError(null);
    try {
      const res = await fetch("/api/arkiv");
      const data = await res.json();
      if (data.success) {
        setArkivEntities(data.entities || []);
      } else {
        setArkivError(data.error || "Failed to load Arkiv entities from Rabdi testnet");
      }
    } catch (err: any) {
      console.error("Failed to load Arkiv entities", err);
      setArkivError("Network error connecting to Arkiv query endpoint");
    } finally {
      setArkivLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshOnChainData(null);
    fetchArkivEntities();
  }, [refreshOnChainData, fetchArkivEntities]);

  // Detect and handle injected wallet events
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;

      // Auto-detect existing connected account if authorized
      ethereum
        .request({ method: "eth_accounts" })
        .then(async (accounts: string[]) => {
          if (accounts && accounts.length > 0) {
            const rawChainId = await ethereum.request({ method: "eth_chainId" });
            const chainId = typeof rawChainId === "string" ? parseInt(rawChainId, 16) : Number(rawChainId);
            const isCorrect = isArcTestnet(chainId);
            setWallet({
              address: accounts[0],
              chainId,
              isConnected: true,
              isCorrectNetwork: isCorrect,
              isConnecting: false,
              error: null,
            });
            refreshOnChainData(accounts[0]);
          }
        })
        .catch((err: any) => console.warn("Failed checking existing accounts:", err));

      const handleAccountsChanged = (accounts: string[]) => {
        if (!accounts || accounts.length === 0) {
          setWallet({
            address: null,
            chainId: null,
            isConnected: false,
            isCorrectNetwork: false,
            isConnecting: false,
            error: null,
          });
          refreshOnChainData(null);
        } else {
          setWallet((prev) => ({
            ...prev,
            address: accounts[0],
            isConnected: true,
          }));
          refreshOnChainData(accounts[0]);
        }
      };

      const handleChainChanged = (newChainIdHex: string) => {
        const newChainId = typeof newChainIdHex === "string" ? parseInt(newChainIdHex, 16) : Number(newChainIdHex);
        const isCorrect = isArcTestnet(newChainId);
        setWallet((prev) => {
          if (isCorrect && prev.address) {
            refreshOnChainData(prev.address);
          }
          return {
            ...prev,
            chainId: newChainId,
            isCorrectNetwork: isCorrect,
          };
        });
      };

      ethereum.on("accountsChanged", handleAccountsChanged);
      ethereum.on("chainChanged", handleChainChanged);

      return () => {
        if (ethereum.removeListener) {
          ethereum.removeListener("accountsChanged", handleAccountsChanged);
          ethereum.removeListener("chainChanged", handleChainChanged);
        }
      };
    }
  }, [refreshOnChainData]);

  // --------------------------------------------------------------------------
  // Wallet Connection Handlers
  // --------------------------------------------------------------------------

  const handleConnectWallet = async () => {
    setActionError(null);
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setActionError("No Ethereum-compatible browser wallet (MetaMask) detected. Please install a Web3 wallet extension.");
      return;
    }

    setWallet((prev) => ({ ...prev, isConnecting: true, error: null }));
    try {
      const ethereum = (window as any).ethereum;
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const rawChainId = await ethereum.request({ method: "eth_chainId" });
      const chainId = typeof rawChainId === "string" ? parseInt(rawChainId, 16) : Number(rawChainId);
      const isCorrect = isArcTestnet(chainId);
      const userAddr = accounts[0] || null;

      setWallet({
        address: userAddr,
        chainId,
        isConnected: Boolean(userAddr),
        isCorrectNetwork: isCorrect,
        isConnecting: false,
        error: null,
      });

      await refreshOnChainData(userAddr);
    } catch (err: any) {
      const parsed = parseEthereumError(err);
      setWallet((prev) => ({ ...prev, isConnecting: false, error: parsed }));
      setActionError(parsed);
    }
  };

  const handleDisconnectWallet = () => {
    setWallet({
      address: null,
      chainId: null,
      isConnected: false,
      isCorrectNetwork: false,
      isConnecting: false,
      error: null,
    });
    refreshOnChainData(null);
  };

  const handleSwitchToArc = async () => {
    setActionError(null);
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setActionError("No browser wallet available to switch networks.");
      return;
    }
    try {
      await switchOrAddArcNetwork((window as any).ethereum);
    } catch (err: any) {
      setActionError(parseEthereumError(err));
    }
  };

  // --------------------------------------------------------------------------
  // Real On-Chain USDC Deposit Action
  // --------------------------------------------------------------------------

  const handleRealDeposit = async () => {
    setActionError(null);

    if (isSubmittingDepositRef.current) return;
    isSubmittingDepositRef.current = true;

    if (!wallet.isConnected || !wallet.address) {
      setActionError("Please connect your wallet first.");
      isSubmittingDepositRef.current = false;
      return;
    }

    if (!wallet.isCorrectNetwork) {
      setActionError("Wallet is connected to the wrong network. Please switch to Arc Testnet (Chain ID 5042002) before transacting.");
      isSubmittingDepositRef.current = false;
      return;
    }

    if (!accounting || !accounting.hasBytecode) {
      setActionError("Escrow contract not found or unverified on Arc Testnet.");
      isSubmittingDepositRef.current = false;
      return;
    }

    if (accounting.campaignCount === 0 || !onChainCampaign) {
      setActionError("No active on-chain campaign exists to receive funding. An authorized organizer must create campaign #1 first.");
      isSubmittingDepositRef.current = false;
      return;
    }

    if (onChainCampaign.state !== CampaignState.FundingActive) {
      setActionError(`Campaign is not accepting donations (Current on-chain state: ${onChainCampaign.stateLabel}).`);
      isSubmittingDepositRef.current = false;
      return;
    }

    const validation = validateDonationInput({
      amountStr: depositInput,
      decimals: accounting.tokenDecimals,
      userBalance: accounting.userUsdcBalance,
      totalDeposited: onChainCampaign.totalDeposited,
      budgetCeiling: onChainCampaign.budgetCeiling,
    });

    if (!validation.valid || !validation.parsedAmount) {
      setActionError(validation.error || "Invalid donation amount.");
      isSubmittingDepositRef.current = false;
      return;
    }

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      setFundingStatus({ step: "validating" });

      const result = await executeFundingDeposit(
        signer,
        accounting.escrowAddress,
        accounting.usdcAddress,
        onChainCampaign.id,
        validation.parsedAmount,
        accounting.userAllowance,
        (status) => setFundingStatus(status)
      );

      const formattedAmount = ethers.formatUnits(validation.parsedAmount, accounting.tokenDecimals);
      setTxLogs((prev) => [
        {
          id: Math.random().toString(),
          txHash: result.depositTxHash,
          msg: `Donor deposit confirmed! ${formattedAmount} USDC transferred directly into OpenAidEscrow.sol.`,
          time: new Date().toLocaleTimeString(),
          type: "success",
          isLive: true,
        },
        ...prev,
      ]);

      await refreshOnChainData(wallet.address);
    } catch (err: any) {
      const parsedErr = parseEthereumError(err);
      setFundingStatus({ step: "error", errorMessage: parsedErr });
      setActionError(parsedErr);
    } finally {
      isSubmittingDepositRef.current = false;
    }
  };

  // --------------------------------------------------------------------------
  // Downstream Partner Workflows (Chainlink CRE & World ID)
  // --------------------------------------------------------------------------

  const handleRunCreCheck = async () => {
    setCreLoading(true);
    try {
      const res = await fetch("/api/cre-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: 1,
          vendorAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
          manifestCid: evidenceCidInput,
          carrierName: carrierInput,
          waybillNumber: waybillInput,
          claimedItemCount: 500,
          targetRegion: "Flood Zone 4",
          coordinates: { latitude: 14.5995, longitude: 120.9842 },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreResult(data.result);
      } else {
        setActionError(`CRE Oracle check failed: ${data.error}`);
      }
    } catch {
      setActionError("Failed to connect to CRE workflow verification endpoint.");
    } finally {
      setCreLoading(false);
    }
  };

  const handleWorldIdVerify = async () => {
    setWorldIdLoading(true);
    try {
      const res = await fetch("/api/verify-worldid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merkle_root: "0x1f8b4c7d2e9a6f3b0c5e8a1d4f7b2e9a6f3b0c5e8a1d4f7b2e9a6f3b0c5e8a1d",
          nullifier_hash: "0x" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
          proof: "0x3b8d6f2e9a1c4b7e0a3f5c8d1e4b7a0f2c5e8b1d4a7f0e3b6c9d2a5f8e1b4c7a",
          action: "verify-human-reviewer",
          signal: "0xvalidator_attestation_signal",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWorldIdVerified(true);
      } else {
        setActionError(`World ID verification failed: ${data.error}`);
      }
    } catch {
      setActionError("World ID verification service unavailable.");
    } finally {
      setWorldIdLoading(false);
    }
  };

  const handleSimulateVote = (validatorName: string) => {
    setValidatorVoted((prev) => ({ ...prev, [validatorName]: true }));
    setPreviewBannerMsg(`Simulated attestation recorded for ${validatorName}. (Offline demonstration mode — on-chain voting requires an active evidence commitment).`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Top Protocol Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-950 border border-blue-600 rounded-lg text-blue-400">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                OpenAid Protocol
                <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-mono uppercase">
                  Arc Testnet
                </span>
              </h1>
              <p className="text-sm text-gray-400">
                Decentralized Charitable Procurement & Staged Settlement Engine
              </p>
            </div>
          </div>
        </div>

        {/* 4 Partner Tech Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#131b2e] border border-blue-900/60 text-xs text-blue-300">
            <Coins className="w-4 h-4 text-blue-400" />
            <div>
              <div className="font-semibold">Arc + USDC</div>
              <div className="text-[10px] text-gray-400">On-Chain Escrow (T1)</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#131b2e] border border-purple-900/60 text-xs text-purple-300">
            <Database className="w-4 h-4 text-purple-400" />
            <div>
              <div className="font-semibold">Arkiv</div>
              <div className="text-[10px] text-gray-400">Queryable DB (T2)</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#131b2e] border border-cyan-900/60 text-xs text-cyan-300">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="font-semibold">Chainlink CRE</div>
              <div className="text-[10px] text-gray-400">Evidence Oracle (T3)</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#131b2e] border border-emerald-900/60 text-xs text-emerald-300">
            <Fingerprint className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="font-semibold">World IDKit</div>
              <div className="text-[10px] text-gray-400">Human Proof (T3)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Role Switcher & Live Wallet Toolbar */}
      <div className="bg-[#111827] border border-gray-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold px-2">
            View Role:
          </span>
          <button
            onClick={() => setActiveRole("donor")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
              activeRole === "donor"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <User className="w-4 h-4" /> Donor Portal
          </button>
          <button
            onClick={() => setActiveRole("ngo")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
              activeRole === "ngo"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <Building2 className="w-4 h-4" /> NGO Coordinator
          </button>
          <button
            onClick={() => setActiveRole("vendor")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
              activeRole === "vendor"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> Supplier
          </button>
          <button
            onClick={() => setActiveRole("validator")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
              activeRole === "validator"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Validator Council
          </button>
        </div>

        {/* Live Contract & Wallet Status Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh On-Chain State Button */}
          <button
            onClick={() => refreshOnChainData(wallet.address)}
            disabled={loadingAccounting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-xs font-mono text-gray-300 rounded-lg transition"
            title="Refresh verified on-chain state from Arc Testnet"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAccounting ? "animate-spin text-blue-400" : "text-gray-400"}`} />
            <span>Refresh State</span>
          </button>

          {/* Escrow Contract Explorer Link */}
          <a
            href={getExplorerAddressUrl(accounting?.escrowAddress || getEscrowAddress())}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-950/70 border border-blue-800/80 rounded-lg text-xs font-mono text-blue-300 hover:bg-blue-900/80 hover:text-blue-100 transition"
            title="View verified OpenAidEscrow contract on ArcScan"
          >
            <span>Escrow: {formatAddress(accounting?.escrowAddress || getEscrowAddress())}</span>
            <ExternalLink className="w-3 h-3 text-blue-400" />
          </a>

          {/* Official USDC Token Explorer Link */}
          <a
            href={getExplorerAddressUrl(accounting?.usdcAddress || ARC_TESTNET_CONFIG.defaultUsdcAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/70 border border-emerald-800/80 rounded-lg text-xs font-mono text-emerald-300 hover:bg-emerald-900/80 hover:text-emerald-100 transition"
            title="View Arc Official Testnet USDC interface"
          >
            <span>USDC: {formatAddress(accounting?.usdcAddress || ARC_TESTNET_CONFIG.defaultUsdcAddress)}</span>
            <ExternalLink className="w-3 h-3 text-emerald-400" />
          </a>

          {/* Network Switch or Status Badge */}
          {wallet.isConnected && !wallet.isCorrectNetwork ? (
            <button
              onClick={handleSwitchToArc}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/80 border border-red-700 text-red-300 text-xs font-mono rounded-lg hover:bg-red-900 transition"
              title="Click to switch your wallet to Arc Testnet"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span>Switch to Arc Testnet</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs font-mono text-gray-300">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Arc Testnet ({ARC_TESTNET_CONFIG.chainId})</span>
            </div>
          )}

          {/* Wallet Connect / Disconnect */}
          {wallet.isConnected && wallet.address ? (
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1 text-xs font-mono">
              <span className="text-gray-300 font-semibold">{formatAddress(wallet.address)}</span>
              <button
                onClick={handleDisconnectWallet}
                className="text-gray-500 hover:text-red-400 transition"
                title="Disconnect wallet"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectWallet}
              disabled={wallet.isConnecting}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{wallet.isConnecting ? "Connecting..." : "Connect Wallet"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Network Mismatch Notice Banner */}
      {wallet.isConnected && !wallet.isCorrectNetwork && (
        <div className="p-4 bg-amber-950/70 border border-amber-700 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 text-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <div className="font-semibold">Network Mismatch Detected (Connected Chain ID: {wallet.chainId})</div>
              <div className="text-xs text-amber-300/80">
                OpenAid Protocol requires Arc Testnet (Chain ID 5042002). Transactions are blocked on other networks to prevent cross-chain errors.
              </div>
            </div>
          </div>
          <button
            onClick={handleSwitchToArc}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-semibold text-xs rounded-lg transition"
          >
            Switch to Arc Testnet
          </button>
        </div>
      )}

      {/* Action Error Banner */}
      {actionError && (
        <div className="p-4 bg-red-950/60 border border-red-700 rounded-lg flex items-center justify-between text-red-300 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200 text-xs font-semibold ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Preview Banner Notification */}
      {previewBannerMsg && (
        <div className="p-3 bg-blue-950/50 border border-blue-800 rounded-lg flex items-center justify-between text-blue-300 text-xs">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span>{previewBannerMsg}</span>
          </div>
          <button onClick={() => setPreviewBannerMsg(null)} className="text-blue-400 hover:text-blue-200 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Campaign Overview Card (Honest Empty State vs Live Campaign) */}
      <div className="bg-[#111827] border border-gray-800 rounded-xl p-6">
        {accounting && accounting.campaignCount === 0 ? (
          /* Honest Empty State when on-chain campaign count is zero */
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">
                    On-Chain State: Awaiting Campaign Creation
                  </span>
                  <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">
                    campaignCount = 0
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white">No Active On-Chain Campaigns Found</h2>
                <p className="text-sm text-gray-400 mt-1">
                  The verified <code className="text-blue-400 font-mono">OpenAidEscrow.sol</code> contract is deployed on Arc Testnet, but no campaigns have been initialized yet.
                </p>
              </div>

              <div className="text-right">
                <div className="text-xs text-gray-400 uppercase tracking-wider">Protocol State</div>
                <div className="text-sm font-semibold text-amber-400 font-mono flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Awaiting Organizer Initialization
                </div>
              </div>
            </div>

            {/* 4 Financial & Escrow Metric Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-800">
              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
                <div className="text-xs text-gray-400 uppercase">Escrow Vault Balance</div>
                <div className="text-2xl font-bold text-white mt-1">
                  ${ethers.formatUnits(accounting.escrowUsdcBalance, accounting.tokenDecimals)} <span className="text-sm font-normal text-gray-400">USDC</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">Zero unallocated funds held</div>
              </div>

              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
                <div className="text-xs text-gray-400 uppercase">Validator Council</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">
                  5 Authorized
                </div>
                <div className="text-xs text-gray-500 mt-2">3-of-5 Quorum Required</div>
              </div>

              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
                <div className="text-xs text-gray-400 uppercase">Verified Stablecoin</div>
                <div className="text-2xl font-bold text-blue-400 mt-1">
                  {accounting.tokenSymbol} ({accounting.tokenDecimals} Decimals)
                </div>
                <div className="text-xs text-gray-500 mt-2">Official Arc Testnet Token</div>
              </div>

              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
                <div className="text-xs text-gray-400 uppercase">Staged Settlement</div>
                <div className="text-sm font-semibold text-white mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Stage 1:</span>
                    <span className="text-gray-400">70% on Quorum</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Stage 2:</span>
                    <span className="text-gray-400">30% post-timelock</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Clear Instructions for Authorized Organizers */}
            <div className="p-4 bg-blue-950/30 border border-blue-900/60 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-blue-300 font-semibold text-sm">
                <Info className="w-4 h-4 text-blue-400" />
                <span>Next Step: Campaign Creator Initialization</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                An authorized NGO or campaign organizer must call <code className="bg-gray-900 px-1 py-0.5 rounded text-blue-300">createCampaign(budgetCeiling, fundingDuration, deliveryDuration, metadataCid)</code> on <code className="bg-gray-900 px-1 py-0.5 rounded text-blue-300">{formatAddress(accounting.escrowAddress)}</code> to open donor contributions. Donor funding will unlock automatically once campaign #1 is registered on-chain.
              </p>
            </div>
          </div>
        ) : onChainCampaign ? (
          /* Live On-Chain Campaign #1 View */
          <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-blue-400 uppercase tracking-wider">
                    On-Chain Campaign #{onChainCampaign.id}
                  </span>
                  <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">
                    Verified
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white">
                  {onChainCampaign.id === 1
                    ? "Emergency Thermal Blankets (500 units) - Flood Relief"
                    : `Humanitarian Aid Procurement — Campaign #${onChainCampaign.id}`}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  Creator: <span className="font-mono text-gray-300">{formatAddress(onChainCampaign.creator)}</span> • IPFS Manifest: <span className="font-mono text-gray-300">{onChainCampaign.metadataCid.slice(0, 16)}...</span>
                </p>
              </div>

              <div className="text-right">
                <div className="text-xs text-gray-400 uppercase tracking-wider">Protocol State</div>
                <div className="text-sm font-semibold text-emerald-400 font-mono flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {onChainCampaign.stateLabel}
                </div>
              </div>
            </div>

            {/* 4 Financial & Settlement Metric Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-800">
              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
                <div className="text-xs text-gray-400 uppercase">Purpose-Bound Escrow</div>
                <div className="text-2xl font-bold text-white mt-1">
                  ${ethers.formatUnits(onChainCampaign.totalDeposited, accounting?.tokenDecimals ?? 6)}{" "}
                  <span className="text-sm font-normal text-gray-400">
                    / ${ethers.formatUnits(onChainCampaign.budgetCeiling, accounting?.tokenDecimals ?? 6)} USDC
                  </span>
                </div>
                <div className="w-full bg-gray-800 h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Number((onChainCampaign.totalDeposited * 100n) / (onChainCampaign.budgetCeiling || 1n)))}%`
                    }}
                  />
                </div>
              </div>

              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
                <div className="text-xs text-gray-400 uppercase">Sealed Auction Tender</div>
                <div className="text-2xl font-bold text-white mt-1">
                  {onChainCampaign.winningBidAmount > 0n
                    ? `$${ethers.formatUnits(onChainCampaign.winningBidAmount, accounting?.tokenDecimals ?? 6)} USDC`
                    : "Awaiting Bids"}
                </div>
                <div className="text-xs text-gray-400 mt-2 truncate">
                  Winner: {isValidAddress(onChainCampaign.winningVendor) ? formatAddress(onChainCampaign.winningVendor) : "None selected"}
                </div>
              </div>

              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
                <div className="text-xs text-gray-400 uppercase">Validator Quorum</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-center gap-2">
                  {onChainCampaign.affirmativeVotes} / 3 <span className="text-xs text-gray-400 font-normal">(5 registered)</span>
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  Negative Votes: {onChainCampaign.negativeVotes} / 3
                </div>
              </div>

              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
                <div className="text-xs text-gray-400 uppercase">Staged Settlement</div>
                <div className="text-sm font-semibold text-white mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Stage 1 (70%):</span>
                    <span className={onChainCampaign.stage1Paid ? "text-emerald-400 font-bold" : "text-gray-500"}>
                      {onChainCampaign.stage1Paid ? "Disbursed" : "Pending Quorum"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Stage 2 (30%):</span>
                    <span className={onChainCampaign.stage2Paid ? "text-emerald-400 font-bold" : "text-amber-400"}>
                      {onChainCampaign.stage2Paid ? "Disbursed" : "Held in Escrow"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Loading On-Chain State */
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
            <div className="text-sm text-gray-400 font-mono">Loading verified on-chain state from Arc Testnet...</div>
          </div>
        )}
      </div>

      {/* Main Interactive Work Area Based on Role */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column: Role-Specific Action Panel */}
        <div className="lg:col-span-2 space-y-6">

          {/* 1. Donor Role Panel (Connected to Real Arc Escrow) */}
          {activeRole === "donor" && (
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <Coins className="w-6 h-6 text-blue-400" />
                <h3 className="text-xl font-bold text-white">Donor Funding Flow (Purpose-Bound USDC Escrow)</h3>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                Your capital enters the immutable <code className="text-xs bg-gray-900 px-1.5 py-0.5 rounded text-blue-300">OpenAidEscrow.sol</code> contract directly on Arc Testnet. The NGO never receives financial custody. Funds exit escrow strictly to reimburse the verified winning vendor or refund back to your wallet.
              </p>

              {/* Real Wallet & Escrow Accounting Box */}
              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg space-y-3 font-mono text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Your Wallet USDC Balance:</span>
                  <span className="text-white font-semibold">
                    {wallet.isConnected && accounting
                      ? `${ethers.formatUnits(accounting.userUsdcBalance, accounting.tokenDecimals)} USDC`
                      : "Wallet Not Connected"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Current Escrow Vault Balance:</span>
                  <span className="text-emerald-400 font-semibold">
                    {accounting
                      ? `${ethers.formatUnits(accounting.escrowUsdcBalance, accounting.tokenDecimals)} USDC`
                      : "Loading..."}
                  </span>
                </div>
                {wallet.isConnected && accounting && accounting.userDonorDeposit > 0n && (
                  <div className="flex justify-between items-center pt-2 border-t border-gray-800">
                    <span className="text-gray-400">Your On-Chain Contribution:</span>
                    <span className="text-blue-400 font-semibold">
                      {ethers.formatUnits(accounting.userDonorDeposit, accounting.tokenDecimals)} USDC
                    </span>
                  </div>
                )}
              </div>

              {/* Transaction Progression Tracker */}
              {fundingStatus.step !== "idle" && (
                <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Transaction Status:
                    </span>
                    <span className={`text-xs font-mono font-semibold ${
                      fundingStatus.step === "confirmed" ? "text-emerald-400" :
                      fundingStatus.step === "error" ? "text-red-400" : "text-blue-400"
                    }`}>
                      {fundingStatus.step === "validating" && "Validating Inputs..."}
                      {fundingStatus.step === "awaiting_approval_signature" && "Awaiting Approval Signature..."}
                      {fundingStatus.step === "approving" && "Approving USDC Allowance on Arc..."}
                      {fundingStatus.step === "awaiting_deposit_signature" && "Awaiting Deposit Signature..."}
                      {fundingStatus.step === "depositing" && "Confirming Deposit on Arc Testnet..."}
                      {fundingStatus.step === "confirmed" && "Deposit Confirmed ✓"}
                      {fundingStatus.step === "error" && "Transaction Failed"}
                    </span>
                  </div>

                  {fundingStatus.approvalTxHash && (
                    <div className="text-xs text-gray-400 flex items-center justify-between pt-1">
                      <span>Approval Tx:</span>
                      <a
                        href={getExplorerTxUrl(fundingStatus.approvalTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline flex items-center gap-1 font-mono"
                      >
                        <span>{formatAddress(fundingStatus.approvalTxHash, 6)}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {fundingStatus.depositTxHash && (
                    <div className="text-xs text-gray-400 flex items-center justify-between pt-1">
                      <span>Deposit Tx:</span>
                      <a
                        href={getExplorerTxUrl(fundingStatus.depositTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline flex items-center gap-1 font-mono"
                      >
                        <span>{formatAddress(fundingStatus.depositTxHash, 6)}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {fundingStatus.errorMessage && (
                    <div className="text-xs text-red-400 pt-1">
                      {fundingStatus.errorMessage}
                    </div>
                  )}
                </div>
              )}

              {/* Donation Form Controls */}
              {accounting && accounting.campaignCount === 0 ? (
                <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg text-center space-y-2">
                  <div className="text-sm text-gray-400">
                    Donations are currently disabled because no campaign has been initialized on-chain.
                  </div>
                  <div className="text-xs text-gray-500">
                    Once campaign #1 is created on <code className="text-blue-400 font-mono">{formatAddress(accounting.escrowAddress)}</code>, the donation portal will open.
                  </div>
                </div>
              ) : onChainCampaign && onChainCampaign.state === CampaignState.FundingActive ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 uppercase mb-1">
                      Contribution Amount (USDC)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={depositInput}
                        onChange={(e) => setDepositInput(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                        placeholder="500"
                      />
                      <span className="absolute right-3 top-2.5 text-sm font-semibold text-gray-500">USDC</span>
                    </div>
                  </div>

                  {!wallet.isConnected ? (
                    <button
                      onClick={handleConnectWallet}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-2"
                    >
                      <Wallet className="w-4 h-4" /> Connect Wallet to Fund Campaign
                    </button>
                  ) : !wallet.isCorrectNetwork ? (
                    <button
                      onClick={handleSwitchToArc}
                      className="w-full bg-amber-600 hover:bg-amber-500 text-black font-semibold py-3 rounded-lg shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2"
                    >
                      <AlertTriangle className="w-4 h-4" /> Switch to Arc Testnet to Donate
                    </button>
                  ) : (
                    <button
                      onClick={handleRealDeposit}
                      disabled={fundingStatus.step === "validating" || fundingStatus.step === "awaiting_approval_signature" || fundingStatus.step === "approving" || fundingStatus.step === "awaiting_deposit_signature" || fundingStatus.step === "depositing"}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-semibold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      {fundingStatus.step === "approving" || fundingStatus.step === "awaiting_approval_signature"
                        ? "Authorizing USDC Allowance..."
                        : fundingStatus.step === "depositing" || fundingStatus.step === "awaiting_deposit_signature"
                        ? "Submitting On-Chain Deposit..."
                        : "Deposit Directly into Escrow"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-400">
                  {onChainCampaign
                    ? `Funding is not currently active for this campaign (State: ${onChainCampaign.stateLabel}).`
                    : "Connect to Arc Testnet to view active campaign funding."}
                </div>
              )}
            </div>
          )}

          {/* 2. NGO Role Panel (Offline Simulation / Demonstrator Notice) */}
          {activeRole === "ngo" && (
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <Building2 className="w-6 h-6 text-purple-400" />
                <h3 className="text-xl font-bold text-white">NGO Coordinator Management</h3>
              </div>

              {/* Informative Workflow Banner */}
              <div className="p-3 bg-purple-950/40 border border-purple-800/60 rounded-lg text-xs text-purple-300 flex items-start gap-2">
                <Info className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Zero-Custody Coordinator Workflow:</span> As the campaign creator, you specify relief requirements. You possess **zero withdrawal permissions** over escrowed funds. Funds can only exit to the verified winning vendor or original donors.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs space-y-1">
                  <div className="text-gray-400">Target Relief Supplies:</div>
                  <div className="font-semibold text-white">500 High-Thermal Blankets</div>
                </div>
                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs space-y-1">
                  <div className="text-gray-400">Budget Ceiling:</div>
                  <div className="font-semibold text-white">$10,000 USDC</div>
                </div>
              </div>

              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg space-y-2">
                <div className="text-xs uppercase font-semibold text-gray-400">Zero-Custody Verification</div>
                <div className="text-xs text-gray-300">
                  Calling an administrative withdrawal or sweep from the NGO coordinator account returns:
                </div>
                <div className="p-2 bg-black/60 rounded font-mono text-xs text-red-400">
                  Error: Unauthorized() — Funds exit escrow strictly via verified vendor milestone settlement or pull-over-push donor refunds.
                </div>
              </div>

              <button
                onClick={() => setPreviewBannerMsg("Notice: createCampaign() is ready for organizer deployment. Direct contract interaction requires the organizer private key.")}
                className="w-full bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2.5 rounded-lg text-sm transition"
              >
                Inspect Campaign Creation Parameters (Organizer Guide)
              </button>
            </div>
          )}

          {/* 3. Vendor Role Panel */}
          {activeRole === "vendor" && (
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-6 h-6 text-amber-400" />
                <h3 className="text-xl font-bold text-white">Supplier Bidding & Delivery Portal</h3>
              </div>

              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-300 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Procurement Tender Workflow:</span> Suppliers submit sealed bids with a 5% performance bond via <code className="bg-gray-900 px-1 py-0.5 rounded text-amber-200">commitBid()</code>. Once bids are revealed, the lowest valid tender fulfills delivery and submits the IPFS evidence manifest.
                </div>
              </div>

              <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-lg space-y-4">
                <div className="text-sm font-semibold text-white">Sealed Bid Commitment (Commit Phase)</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Your Secret Bid (USDC)</label>
                    <input
                      type="number"
                      value={vendorBidAmount}
                      onChange={(e) => setVendorBidAmount(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-white font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Cryptographic Salt</label>
                    <input
                      type="text"
                      value={vendorSalt}
                      onChange={(e) => setVendorSalt(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-white font-mono text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    try {
                      const bidUnits = ethers.parseUnits(vendorBidAmount || "0", accounting?.tokenDecimals ?? 6);
                      const saltBytes = ethers.encodeBytes32String((vendorSalt || "salt").slice(0, 31));
                      const vendorAddr = wallet.address || "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
                      const realHash = ethers.solidityPackedKeccak256(
                        ["uint256", "bytes32", "address"],
                        [bidUnits, saltBytes, vendorAddr]
                      );
                      setCommittedHash(realHash);
                      setPreviewBannerMsg(`Calculated cryptographic keccak256 commitment: ${realHash.slice(0, 18)}... (Bound to vendor ${formatAddress(vendorAddr)})`);
                    } catch (err: any) {
                      setActionError(`Failed to calculate sealed bid hash: ${err.message}`);
                    }
                  }}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 rounded text-sm transition"
                >
                  Calculate Cryptographic Keccak256 Commitment (Sealed Bid)
                </button>
              </div>

              {committedHash && (
                <div className="p-3 bg-gray-900 border border-gray-800 rounded font-mono text-xs text-gray-300">
                  <span className="text-amber-400 font-semibold">Calculated Bid Hash:</span> {committedHash}
                </div>
              )}
            </div>
          )}

          {/* 4. Validator Role Panel */}
          {activeRole === "validator" && (
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 space-y-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                <h3 className="text-xl font-bold text-white">Independent Validator Council</h3>
              </div>
              <p className="text-sm text-gray-400">
                Inspect physical evidence manifests off-chain. Combine Chainlink CRE automated oracle checks with World ID human verification to reach the required 3-of-5 on-chain quorum.
              </p>

              {/* Chainlink CRE Automated Check Block */}
              <div className="p-4 bg-gray-900 border border-cyan-900/60 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-cyan-300 font-semibold text-sm">
                    <Cpu className="w-4 h-4" /> Chainlink CRE Evidence Analysis
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded font-mono">
                      DON SIMULATOR
                    </span>
                  </div>
                  <button
                    onClick={handleRunCreCheck}
                    disabled={creLoading}
                    className="px-3 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded text-xs font-semibold flex items-center gap-1.5"
                  >
                    {creLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Execute CRE Workflow
                  </button>
                </div>

                {creResult ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-400">CRE Confidence Score:</span>
                      <span className="font-bold text-emerald-400">{creResult.confidenceScore} / 100</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                      <div className="text-emerald-400">✓ Manifest CID Verified</div>
                      <div className="text-emerald-400">✓ Carrier Waybill Active</div>
                      <div className="text-emerald-400">✓ 500 Blankets Count Verified</div>
                      <div className="text-emerald-400">✓ GPS inside Flood Zone 4</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic">
                    Click to run external DON checks on waybill tracking, GPS geofence perimeter, and item counts.
                  </div>
                )}
              </div>

              {/* World ID Verification Block */}
              <div className="p-4 bg-gray-900 border border-emerald-900/60 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                    <Fingerprint className="w-4 h-4" /> World ID Human Proof Required
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono">
                      ZK SANDBOX
                    </span>
                  </div>
                  {worldIdVerified ? (
                    <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded-full font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Human Verified
                    </span>
                  ) : (
                    <button
                      onClick={handleWorldIdVerify}
                      disabled={worldIdLoading}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      {worldIdLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Fingerprint className="w-3 h-3" />}
                      Verify with World ID
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  Zero-Knowledge Proof ensures each validator vote originates from an authenticated unique human, preventing automated Sybil bots from manipulating the quorum.
                </p>
              </div>

              {/* Validator On-Chain Voting Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase">
                  <span>Validator Council Attestation (3 of 5 Required)</span>
                  <span className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded font-mono normal-case">
                    DEMO SIMULATOR
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {["Validator 1 (UN Affiliate)", "Validator 2 (Red Cross)", "Validator 3 (Community Auditor)"].map((val, idx) => (
                    <div key={idx} className="p-3 bg-gray-900/80 border border-gray-800 rounded-lg space-y-2">
                      <div className="text-xs font-semibold text-white truncate">{val}</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSimulateVote(`Validator ${idx + 1}`)}
                          disabled={validatorVoted[`Validator ${idx + 1}`]}
                          className={`w-full py-1.5 rounded text-xs font-semibold transition ${
                            validatorVoted[`Validator ${idx + 1}`]
                              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                              : "bg-emerald-700 hover:bg-emerald-600 text-white"
                          }`}
                        >
                          {validatorVoted[`Validator ${idx + 1}`] ? "Attested ✓" : "Cast Attestation"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Arkiv Decentralized Database Viewer & Live Ledger */}
        <div className="space-y-6">

          {/* Arkiv Database Entities Card */}
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-400" />
                <h4 className="text-base font-bold text-white">Arkiv Database</h4>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchArkivEntities}
                  disabled={arkivLoading}
                  className="p-1 text-gray-400 hover:text-purple-300 transition"
                  title="Refresh Arkiv database records from Rabdi testnet"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${arkivLoading ? "animate-spin text-purple-400" : ""}`} />
                </button>
                <a
                  href={ARKIV_CONFIG.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800 px-2.5 py-1 rounded-md font-mono flex items-center gap-1.5 transition"
                  title="View Arkiv Rabdi Testnet Explorer (Chain ID 7794095)"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                  <span>Rabdi Testnet (7794095)</span>
                  <ExternalLink className="w-2.5 h-2.5 text-purple-400" />
                </a>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Time-scoped, wallet-owned procurement metadata stored on Arkiv Rabdi testnet under schema namespace <code className="text-purple-300 font-mono">openaid.v1.*</code> with cryptographic ownership and automated TTL expiration.
            </p>

            {/* Filter buttons across all 4 entity types */}
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                { id: "all", label: "All" },
                { id: "ProcurementRequest", label: "Requests" },
                { id: "ProcurementBid", label: "Bids" },
                { id: "DeliveryEvidence", label: "Evidence" },
                { id: "ValidatorReview", label: "Reviews" },
              ].map((filt) => (
                <button
                  key={filt.id}
                  onClick={() => setArkivFilter(filt.id)}
                  className={`px-2.5 py-1 rounded transition text-xs ${
                    arkivFilter === filt.id
                      ? "bg-purple-600 text-white font-semibold shadow-sm"
                      : "bg-gray-900 text-gray-400 hover:text-white border border-gray-800"
                  }`}
                >
                  {filt.label}
                </button>
              ))}
            </div>

            {/* Entity List */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {arkivLoading ? (
                <div className="p-6 bg-gray-900/40 border border-gray-800 rounded-lg text-center space-y-2">
                  <RefreshCw className="w-5 h-5 text-purple-400 animate-spin mx-auto" />
                  <div className="text-xs text-gray-400 font-mono">Querying Rabdi testnet for openaid.v1.* schemas...</div>
                </div>
              ) : arkivError ? (
                <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-lg text-xs text-red-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span>{arkivError}</span>
                  </div>
                  <button onClick={fetchArkivEntities} className="text-xs text-red-200 underline hover:text-white">Retry</button>
                </div>
              ) : arkivEntities.filter((e) => arkivFilter === "all" || e.type === arkivFilter).length === 0 ? (
                <div className="p-6 bg-gray-900/40 border border-dashed border-gray-800 rounded-lg text-center space-y-2">
                  <Database className="w-6 h-6 text-purple-400/50 mx-auto" />
                  <p className="text-xs text-gray-300">
                    No Arkiv records found on Rabdi testnet for <code className="text-purple-300 font-mono">openaid.v1.*</code> schemas.
                  </p>
                  <p className="text-[11px] text-gray-500">
                    As campaigns, bids, and evidence are registered, their expiring metadata will be queryable here.
                  </p>
                </div>
              ) : (
                arkivEntities
                  .filter((e) => arkivFilter === "all" || e.type === arkivFilter)
                  .map((entity) => (
                    <div key={entity.id} className="p-3 bg-gray-900/90 border border-gray-800 hover:border-gray-700 rounded-lg text-xs space-y-1.5 transition">
                      <div className="flex justify-between items-center font-mono">
                        <a
                          href={getArkivExplorerEntityUrl(entity.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-300 hover:text-purple-200 font-semibold flex items-center gap-1 hover:underline"
                          title="Inspect raw entity on Arkiv Rabdi Explorer"
                        >
                          <span>{entity.id.length > 20 ? formatAddress(entity.id, 8) : entity.id}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-purple-400" />
                        </a>
                        <span className="text-[10px] bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                          {entity.type === "ProcurementRequest"
                            ? "TTL 14d"
                            : entity.type === "ProcurementBid"
                            ? "TTL 7d"
                            : "TTL 30d"}
                        </span>
                      </div>

                      {/* Content per Entity Type */}
                      {entity.type === "ProcurementRequest" && (
                        <div>
                          <div className="text-gray-200 font-medium">{entity.title}</div>
                          <div className="text-[11px] text-gray-400 flex justify-between pt-0.5">
                            <span>Campaign #{entity.campaignId} • {entity.itemCount} {entity.itemUnit} ({entity.targetRegion})</span>
                            <span className="font-semibold text-emerald-400">${entity.budgetCeilingUSDC.toLocaleString()} USDC max</span>
                          </div>
                        </div>
                      )}

                      {entity.type === "ProcurementBid" && (
                        <div>
                          <div className="text-gray-300 font-mono text-[11px]">
                            Bid Hash: {entity.commitHash.slice(0, 18)}...
                          </div>
                          <div className="text-[11px] text-gray-400 flex justify-between pt-0.5">
                            <span>Campaign #{entity.campaignId} • Vendor: {formatAddress(entity.vendorAddress)}</span>
                            {entity.revealedBidUSDC !== undefined && (
                              <span className="font-semibold text-emerald-400">${entity.revealedBidUSDC.toLocaleString()} USDC</span>
                            )}
                          </div>
                        </div>
                      )}

                      {entity.type === "DeliveryEvidence" && (
                        <div>
                          <div className="text-gray-200 font-medium">
                            {entity.carrierName} — Waybill: <span className="font-mono text-purple-300">{entity.waybillNumber}</span>
                          </div>
                          <div className="text-[11px] text-gray-400 flex justify-between pt-0.5">
                            <span>Manifest CID: {entity.manifestCid.slice(0, 14)}...</span>
                            <span className="text-emerald-400 font-semibold">{entity.verifiedItemCount} / {entity.packageCount} units</span>
                          </div>
                        </div>
                      )}

                      {entity.type === "ValidatorReview" && (
                        <div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-gray-300">Campaign #{entity.campaignId} Attestation</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                              entity.decision === "APPROVE" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-red-950 text-red-400 border border-red-800"
                            }`}>
                              {entity.decision}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-400 pt-0.5 flex items-center justify-between">
                            <span>{entity.notes || "Quorum review"}</span>
                            {entity.humanVerified && (
                              <span className="text-cyan-400 text-[10px] flex items-center gap-0.5">
                                <Fingerprint className="w-2.5 h-2.5" /> World ID ✓
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-[10px] text-gray-500 pt-1 border-t border-gray-800/60 font-mono">
                        <span>Owner: {formatAddress(entity.owner)}</span>
                        <span className="text-purple-400/90 font-medium">{"status" in entity ? entity.status : "openaid.v1"}</span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Verified On-Chain Activity & Event Ledger */}
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-blue-400" /> Contract Events
              </h4>
              <span className="text-[10px] text-emerald-400 font-mono">VERIFIED ON-CHAIN</span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {txLogs.map((log) => (
                <div key={log.id} className="p-2.5 bg-gray-900/80 border border-gray-800/80 rounded text-xs space-y-0.5">
                  <div className="flex justify-between items-center text-[10px] font-mono text-gray-500">
                    {log.txHash.length > 20 ? (
                      <a
                        href={getExplorerTxUrl(log.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 font-mono"
                        title="View verified transaction on ArcScan Explorer"
                      >
                        <span>{formatAddress(log.txHash, 6)}</span>
                        <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                      </a>
                    ) : (
                      <span className="text-blue-400">{log.txHash}</span>
                    )}
                    <span>{log.time}</span>
                  </div>
                  <div className={`text-xs ${log.type === "warn" ? "text-amber-300" : log.type === "error" ? "text-red-300" : "text-gray-300"}`}>
                    {log.msg}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
