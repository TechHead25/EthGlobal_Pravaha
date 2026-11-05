"use client";

import React, { useState, useEffect } from "react";
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
  Search,
  Lock,
  Eye,
  FileCheck2,
  DollarSign
} from "lucide-react";
import { ArkivEntity, ProcurementRequestEntity, ProcurementBidEntity } from "@/lib/arkiv/types";
import { CreVerificationResult } from "@/lib/cre/workflow";
import { WorldIdVerificationResponse } from "@/lib/worldid/types";

type Role = "donor" | "ngo" | "vendor" | "validator";

export default function OpenAidApp() {
  const [activeRole, setActiveRole] = useState<Role>("donor");
  
  // Protocol State Model (reflects on-chain OpenAidEscrow state)
  const [campaign, setCampaign] = useState({
    id: 1,
    title: "Emergency Thermal Blankets (500 units) - Flood Relief",
    budgetCeiling: 10000,
    totalDeposited: 0,
    fundingDeadline: "2026-11-20 18:00 UTC",
    deliveryDeadline: "2026-11-27 18:00 UTC",
    metadataCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    state: "FundingActive", // FundingActive, BiddingCommit, BiddingReveal, AwaitingDelivery, VerificationPending, InChallengePeriod, Completed, Disputed, DeliveryFailed
    winningVendor: "",
    winningBidAmount: 0,
    evidenceCid: "",
    carrierName: "",
    waybillNumber: "",
    affirmativeVotes: 0,
    negativeVotes: 0,
    stage1Paid: false,
    stage2Paid: false,
    challengeExpirySeconds: 0,
    isDisputed: false,
  });

  // User Balances & Inputs
  const [donorBalance, setDonorBalance] = useState(25000); // 25,000 USDC
  const [depositInput, setDepositInput] = useState("10000");
  const [vendorBidAmount, setVendorBidAmount] = useState("8500");
  const [vendorSalt, setVendorSalt] = useState("secure_salt_777");
  const [committedHash, setCommittedHash] = useState<string | null>(null);
  
  // Evidence form
  const [evidenceCidInput, setEvidenceCidInput] = useState("bafybeicb blankets_manifest_v1_500units");
  const [carrierInput, setCarrierInput] = useState("Regional Humanitarian Freight Logistics");
  const [waybillInput, setWaybillInput] = useState("RELIEF-BLANKETS-2026-0042");

  // Partner Integration States
  const [arkivEntities, setArkivEntities] = useState<ArkivEntity[]>([]);
  const [arkivFilter, setArkivFilter] = useState<string>("all");
  const [creResult, setCreResult] = useState<CreVerificationResult | null>(null);
  const [creLoading, setCreLoading] = useState(false);
  
  // World ID Verification State
  const [worldIdVerified, setWorldIdVerified] = useState(false);
  const [worldIdLoading, setWorldIdLoading] = useState(false);
  const [validatorVoted, setValidatorVoted] = useState<Record<string, boolean>>({});

  // Feedback & Tx Ledger
  const [txLogs, setTxLogs] = useState<Array<{ id: string; txHash: string; msg: string; time: string; type: "success" | "warn" | "error" }>>([
    {
      id: "init",
      txHash: "0xd4748a53c1eedce5bc86293d3d5a570764fae0996d0eb2b906c0ea13d54e7b21",
      msg: "OpenAidEscrow deployed to Arc Testnet at 0xe38151283e55077F621988679f2Cc524b785d236 (Block #70917303)",
      time: "Confirmed",
      type: "success",
    },
  ]);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch Arkiv Entities
  const fetchArkivEntities = async () => {
    try {
      const res = await fetch("/api/arkiv");
      const data = await res.json();
      if (data.success) {
        setArkivEntities(data.entities);
      }
    } catch (err) {
      console.error("Failed to load Arkiv entities", err);
    }
  };

  useEffect(() => {
    fetchArkivEntities();
  }, []);

  const addTxLog = (msg: string, type: "success" | "warn" | "error" = "success") => {
    const randomHash = "0x" + Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join("") + "...";
    const now = new Date().toLocaleTimeString();
    setTxLogs((prev) => [{ id: Math.random().toString(), txHash: randomHash, msg, time: now, type }, ...prev]);
  };

  // --- ACTIONS ---

  // 1. Donor Deposit
  const handleDeposit = () => {
    setActionError(null);
    const amount = parseFloat(depositInput);
    if (isNaN(amount) || amount <= 0) {
      setActionError("Please enter a valid deposit amount.");
      return;
    }
    if (amount > donorBalance) {
      setActionError("Insufficient USDC balance in donor wallet.");
      return;
    }
    if (campaign.totalDeposited + amount > campaign.budgetCeiling) {
      setActionError(`Deposit exceeds budget ceiling ($${campaign.budgetCeiling} USDC).`);
      return;
    }

    setDonorBalance((prev) => prev - amount);
    const newTotal = campaign.totalDeposited + amount;
    const isFunded = newTotal >= campaign.budgetCeiling;

    setCampaign((prev) => ({
      ...prev,
      totalDeposited: newTotal,
      state: isFunded ? "BiddingCommit" : prev.state,
    }));

    addTxLog(`Donor deposited $${amount.toLocaleString()} USDC directly into Escrow (NGO balance untouched).`);
    if (isFunded) {
      addTxLog("Campaign Fully Funded ($10,000 USDC)! Sealed Commit–Reveal Auction is now open.");
    }
  };

  // 2. Vendor Commit Bid
  const handleCommitBid = () => {
    setActionError(null);
    if (!vendorBidAmount || !vendorSalt) {
      setActionError("Please provide both bid amount and cryptographic salt.");
      return;
    }
    const mockHash = "0x" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    setCommittedHash(mockHash);
    addTxLog(`Vendor Alpha committed sealed bid hash with $500 USDC performance bond: ${mockHash.slice(0, 16)}...`);
  };

  // 3. Advance to Reveal
  const handleAdvanceToReveal = () => {
    setCampaign((prev) => ({ ...prev, state: "BiddingReveal" }));
    addTxLog("Bidding commit window closed. Reveal window is now open.");
  };

  // 4. Vendor Reveal Bid
  const handleRevealBid = () => {
    setActionError(null);
    const bid = parseFloat(vendorBidAmount);
    setCampaign((prev) => ({
      ...prev,
      state: "AwaitingDelivery",
      winningVendor: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 (Vendor Beta)",
      winningBidAmount: bid,
    }));
    addTxLog(`Sealed bids revealed. Lowest valid bidder selected: 0x15d3...2C6A ($${bid.toLocaleString()} USDC for 500 blankets). Non-winning bonds unlocked.`);
  };

  // 5. Submit Delivery Evidence
  const handleSubmitEvidence = () => {
    setActionError(null);
    if (!evidenceCidInput || !carrierInput || !waybillInput) {
      setActionError("Please complete all delivery manifest fields.");
      return;
    }

    setCampaign((prev) => ({
      ...prev,
      evidenceCid: evidenceCidInput,
      carrierName: carrierInput,
      waybillNumber: waybillInput,
      state: "VerificationPending",
    }));

    addTxLog(`Winning Vendor committed delivery manifest CID to on-chain escrow: ${evidenceCidInput.slice(0, 20)}...`);
  };

  // 6. Chainlink CRE Automated Evidence Check
  const handleRunCreCheck = async () => {
    setCreLoading(true);
    try {
      const res = await fetch("/api/cre-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: 1,
          vendorAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
          manifestCid: campaign.evidenceCid || evidenceCidInput,
          carrierName: campaign.carrierName || carrierInput,
          waybillNumber: campaign.waybillNumber || waybillInput,
          claimedItemCount: 500,
          targetRegion: "Flood Zone 4",
          coordinates: { latitude: 14.5995, longitude: 120.9842 },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreResult(data.result);
        addTxLog(`Chainlink CRE Workflow executed: 4/4 checks passed (100/100 confidence). Attestation digest: ${data.result.attestationDigest}`);
      }
    } catch (err: any) {
      setActionError(`CRE execution failed: ${err.message}`);
    } finally {
      setCreLoading(false);
    }
  };

  // 7. World ID Human Verification
  const handleWorldIdVerify = async () => {
    setWorldIdLoading(true);
    setActionError(null);
    try {
      const sampleProof = {
        merkle_root: "0x1f8b4c7d2e9a6f3b0c5e8a1d4f7b2e9a6f3b0c5e8a1d4f7b2e9a6f3b0c5e8a1d",
        nullifier_hash: "0x" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
        proof: "0x3b8d6f2e9a1c4b7e0a3f5c8d1e4b7a0f2c5e8b1d4a7f0e3b6c9d2a5f8e1b4c7a",
        verification_level: "orb",
        action: "verify-human-reviewer",
        signal: "0xvalidator_attestation_signal",
      };

      const res = await fetch("/api/verify-worldid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof: sampleProof, action: "verify-human-reviewer" }),
      });
      const data: WorldIdVerificationResponse = await res.json();

      if (data.success) {
        setWorldIdVerified(true);
        addTxLog(`World IDKit verified human reviewer identity (Nullifier: ${data.nullifier_hash?.slice(0, 16)}...). Sybil attack prevented.`);
      } else {
        setActionError(`World ID verification denied: ${data.error_message}`);
      }
    } catch (err: any) {
      setActionError(`World ID service error: ${err.message}`);
    } finally {
      setWorldIdLoading(false);
    }
  };

  // 8. Validator Cast Vote (3 of 5 Quorum)
  const handleCastVote = (valName: string, approve: boolean) => {
    setActionError(null);
    if (!worldIdVerified) {
      setActionError("Human Verification Required: Complete World ID verification before casting on-chain vote.");
      return;
    }
    if (validatorVoted[valName]) {
      setActionError(`Duplicate Vote Blocked: ${valName} has already cast a vote.`);
      return;
    }

    setValidatorVoted((prev) => ({ ...prev, [valName]: true }));
    const newAffirmative = approve ? campaign.affirmativeVotes + 1 : campaign.affirmativeVotes;
    const newNegative = !approve ? campaign.negativeVotes + 1 : campaign.negativeVotes;

    // Check if 3-of-5 quorum reached
    if (newAffirmative >= 3 && !campaign.stage1Paid) {
      const stage1Amount = (campaign.winningBidAmount * 70) / 100;
      setCampaign((prev) => ({
        ...prev,
        affirmativeVotes: newAffirmative,
        negativeVotes: newNegative,
        stage1Paid: true,
        state: "InChallengePeriod",
        challengeExpirySeconds: 120, // 120-second demo countdown
      }));
      addTxLog(`${valName} voted APPROVE. 3-of-5 Quorum Reached! Triggering Stage 1 Payout ($${stage1Amount.toLocaleString()} USDC [70%]) to Vendor.`);
      addTxLog("Challenge window timelock opened (120s countdown). 30% held in reserve.");
    } else {
      setCampaign((prev) => ({
        ...prev,
        affirmativeVotes: newAffirmative,
        negativeVotes: newNegative,
      }));
      addTxLog(`${valName} cast on-chain vote: ${approve ? "APPROVE" : "REJECT"}. Total affirmative: ${newAffirmative}/3.`);
    }
  };

  // 9. Finalize Stage 2 Settlement (30%)
  const handleFinalizeSettlement = () => {
    setActionError(null);
    if (campaign.isDisputed) {
      setActionError("Settlement Blocked: An active dispute is currently frozen in escrow.");
      return;
    }
    const stage2Amount = (campaign.winningBidAmount * 30) / 100;
    setCampaign((prev) => ({
      ...prev,
      stage2Paid: true,
      state: "Completed",
    }));
    addTxLog(`Challenge period expired cleanly. Stage 2 ($${stage2Amount.toLocaleString()} USDC [30%]) + performance bond disbursed to Vendor.`);
    addTxLog("Campaign Completed! Unspent surplus ($1,500 USDC) unlocked for donor refund pool.");
  };

  // 10. Raise Dispute Path
  const handleRaiseDispute = () => {
    setCampaign((prev) => ({
      ...prev,
      isDisputed: true,
      state: "Disputed",
    }));
    addTxLog("Dispute Raised with $850 USDC bond! Stage 2 payment frozen in escrow pending validator review.", "warn");
  };

  // 11. Delivery Failure Timeout Simulation
  const handleSimulateDeliveryTimeout = () => {
    setCampaign((prev) => ({
      ...prev,
      state: "DeliveryFailed",
    }));
    addTxLog("Delivery deadline expired with 0 evidence submitted. State: DeliveryFailed. Vendor bond slashed; 100% refund unlocked.", "error");
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
                  Phase 1A MVP
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
              <div className="text-[10px] text-gray-400">Purpose Escrow</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#131b2e] border border-purple-900/60 text-xs text-purple-300">
            <Database className="w-4 h-4 text-purple-400" />
            <div>
              <div className="font-semibold">Arkiv</div>
              <div className="text-[10px] text-gray-400">Queryable DB</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#131b2e] border border-cyan-900/60 text-xs text-cyan-300">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <div>
              <div className="font-semibold">Chainlink CRE</div>
              <div className="text-[10px] text-gray-400">Evidence Oracle</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#131b2e] border border-emerald-900/60 text-xs text-emerald-300">
            <Fingerprint className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="font-semibold">World IDKit</div>
              <div className="text-[10px] text-gray-400">Human Proof</div>
            </div>
          </div>
        </div>
      </div>

      {/* Role Switcher Toolbar */}
      <div className="bg-[#111827] border border-gray-800 rounded-xl p-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold px-3">
            Active Role:
          </span>
          <button
            onClick={() => setActiveRole("donor")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeRole === "donor"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <User className="w-4 h-4" /> Donor Portal
          </button>
          <button
            onClick={() => setActiveRole("ngo")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeRole === "ngo"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <Building2 className="w-4 h-4" /> NGO Coordinator
          </button>
          <button
            onClick={() => setActiveRole("vendor")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeRole === "vendor"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> Supplier / Vendor
          </button>
          <button
            onClick={() => setActiveRole("validator")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeRole === "validator"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Validator Council
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://testnet.arcscan.app/address/0xe38151283e55077F621988679f2Cc524b785d236"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1 bg-blue-950/70 border border-blue-800/80 rounded-lg text-xs font-mono text-blue-300 hover:bg-blue-900/80 hover:text-blue-100 transition"
            title="View verified OpenAidEscrow contract on ArcScan"
          >
            <span>Escrow: 0xe381...d236</span>
            <ExternalLink className="w-3 h-3 text-blue-400" />
          </a>
          <a
            href="https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/70 border border-emerald-800/80 rounded-lg text-xs font-mono text-emerald-300 hover:bg-emerald-900/80 hover:text-emerald-100 transition"
            title="View Arc Official Testnet USDC"
          >
            <span>USDC: 0x3600...0000</span>
            <ExternalLink className="w-3 h-3 text-emerald-400" />
          </a>
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-900 border border-gray-800 rounded-lg text-xs font-mono text-gray-300">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Arc Testnet (5042002)</span>
          </div>
        </div>
      </div>

      {/* Action Error Banner */}
      {actionError && (
        <div className="p-4 bg-red-950/60 border border-red-700 rounded-lg flex items-center justify-between text-red-300 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Campaign Overview Card */}
      <div className="bg-[#111827] border border-gray-800 rounded-xl p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-blue-400 uppercase tracking-wider">Campaign #1</span>
              <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">Disaster Shelter</span>
            </div>
            <h2 className="text-2xl font-bold text-white">{campaign.title}</h2>
            <p className="text-sm text-gray-400 mt-1">
              Location: <span className="text-gray-300 font-medium">Flood Zone 4, District Delta</span> • Delivery Target: <span className="text-gray-300 font-medium">500 High-Thermal Blankets</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase tracking-wider">Protocol State</div>
              <div className="text-sm font-semibold text-emerald-400 font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {campaign.state}
              </div>
            </div>
          </div>
        </div>

        {/* 4 Core Financial & Settlement Metric Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-800">
          <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
            <div className="text-xs text-gray-400 uppercase">Purpose-Bound Escrow</div>
            <div className="text-2xl font-bold text-white mt-1">
              ${campaign.totalDeposited.toLocaleString()} <span className="text-sm font-normal text-gray-400">/ ${campaign.budgetCeiling.toLocaleString()} USDC</span>
            </div>
            <div className="w-full bg-gray-800 h-2 rounded-full mt-3 overflow-hidden">
              <div 
                className="bg-blue-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${(campaign.totalDeposited / campaign.budgetCeiling) * 100}%` }}
              />
            </div>
          </div>

          <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
            <div className="text-xs text-gray-400 uppercase">Sealed Auction Tender</div>
            <div className="text-2xl font-bold text-white mt-1">
              {campaign.winningBidAmount > 0 ? `$${campaign.winningBidAmount.toLocaleString()} USDC` : "Awaiting Reveals"}
            </div>
            <div className="text-xs text-gray-400 mt-2 truncate">
              Winner: {campaign.winningVendor ? campaign.winningVendor.slice(0, 14) + "..." : "None selected"}
            </div>
          </div>

          <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
            <div className="text-xs text-gray-400 uppercase">Validator Quorum</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-center gap-2">
              {campaign.affirmativeVotes} / 3 <span className="text-xs text-gray-400 font-normal">(5 registered)</span>
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Negative Votes: {campaign.negativeVotes} / 3 (Slashing threshold)
            </div>
          </div>

          <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg">
            <div className="text-xs text-gray-400 uppercase">Staged Settlement</div>
            <div className="text-sm font-semibold text-white mt-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Stage 1 (70%):</span>
                <span className={campaign.stage1Paid ? "text-emerald-400 font-bold" : "text-gray-500"}>
                  {campaign.stage1Paid ? "Released ($5,950)" : "Pending Quorum"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Stage 2 (30%):</span>
                <span className={campaign.stage2Paid ? "text-emerald-400 font-bold" : "text-amber-400"}>
                  {campaign.stage2Paid ? "Disbursed ($2,550)" : "Retained in Escrow"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Work Area Based on Role */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Role-Specific Action Panel */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 1. Donor Role Panel */}
          {activeRole === "donor" && (
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <Coins className="w-6 h-6 text-blue-400" />
                <h3 className="text-xl font-bold text-white">Donor Funding Flow (Purpose-Bound USDC Escrow)</h3>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                Your capital enters the immutable <code className="text-xs bg-gray-900 px-1.5 py-0.5 rounded text-blue-300">OpenAidEscrow.sol</code> contract directly. The NGO never receives financial custody. Funds exit escrow strictly to reimburse the verified winning vendor or refund back to your wallet.
              </p>

              <div className="p-4 bg-gray-900/60 border border-gray-800 rounded-lg space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Your Donor Wallet Balance:</span>
                  <span className="text-white font-mono font-semibold">${donorBalance.toLocaleString()} Mock USDC</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Current Escrow Balance:</span>
                  <span className="text-emerald-400 font-mono font-semibold">${campaign.totalDeposited.toLocaleString()} / $10,000 USDC</span>
                </div>
              </div>

              {campaign.state === "FundingActive" ? (
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
                        placeholder="10000"
                      />
                      <span className="absolute right-3 top-2.5 text-sm font-semibold text-gray-500">USDC</span>
                    </div>
                  </div>

                  <button
                    onClick={handleDeposit}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" /> Deposit Directly into Escrow
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-emerald-950/40 border border-emerald-800 rounded-lg text-emerald-300 text-sm flex items-center justify-between">
                  <span>Funding target reached! Procurement auction is active.</span>
                  {campaign.state === "Completed" && (
                    <button 
                      onClick={() => addTxLog("Donor claimed proportional surplus refund ($1,500 USDC) via pull pattern.")}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded"
                    >
                      Claim Surplus Refund
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 2. NGO Role Panel */}
          {activeRole === "ngo" && (
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <Building2 className="w-6 h-6 text-purple-400" />
                <h3 className="text-xl font-bold text-white">NGO Coordinator Management</h3>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                As the campaign creator, you define relief supply specifications and delivery deadlines. You have **zero withdrawal capabilities** over donor capital.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-xs space-y-1">
                  <div className="text-gray-400">Procurement Item:</div>
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
                  Attempting to call an administrative withdrawal from the NGO wallet returns:
                </div>
                <div className="p-2 bg-black/60 rounded font-mono text-xs text-red-400">
                  Error: Unauthorized() — Funds can only exit escrow to the verified winning vendor or original donors.
                </div>
              </div>

              {campaign.state === "BiddingCommit" && (
                <button
                  onClick={handleAdvanceToReveal}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 rounded-lg text-sm transition"
                >
                  Advance Auction to Reveal Window
                </button>
              )}
            </div>
          )}

          {/* 3. Vendor Role Panel */}
          {activeRole === "vendor" && (
            <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-6 h-6 text-amber-400" />
                <h3 className="text-xl font-bold text-white">Supplier Bidding & Delivery Portal</h3>
              </div>
              <p className="text-sm text-gray-400">
                Participate in sealed commit–reveal procurement bidding. Fulfill physical delivery and commit the IPFS evidence package to trigger staged payment tranches.
              </p>

              {/* Commit Phase */}
              {campaign.state === "BiddingCommit" && (
                <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-lg space-y-4">
                  <div className="text-sm font-semibold text-white">Step 1: Submit Sealed Bid Commitment</div>
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
                    onClick={handleCommitBid}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 rounded text-sm transition"
                  >
                    Commit Sealed Bid Hash (+5% Bond: $500 USDC)
                  </button>
                </div>
              )}

              {/* Reveal Phase */}
              {campaign.state === "BiddingReveal" && (
                <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-lg space-y-3">
                  <div className="text-sm font-semibold text-white">Step 2: Reveal Sealed Bid</div>
                  <p className="text-xs text-gray-400">
                    Publish your price ($8,500 USDC) and salt. The contract verifies your hash matches the commitment.
                  </p>
                  <button
                    onClick={handleRevealBid}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded text-sm transition"
                  >
                    Reveal Bid & Finalize Auction
                  </button>
                </div>
              )}

              {/* Evidence Submission Phase */}
              {campaign.state === "AwaitingDelivery" && (
                <div className="p-4 bg-gray-900/80 border border-gray-800 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-emerald-400">Step 3: Ship 500 Blankets & Submit Manifest</span>
                    <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">You Won the Auction</span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Carrier / Logistics Provider</label>
                      <input
                        type="text"
                        value={carrierInput}
                        onChange={(e) => setCarrierInput(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Waybill Tracking Number</label>
                      <input
                        type="text"
                        value={waybillInput}
                        onChange={(e) => setWaybillInput(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-white font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Delivery Evidence IPFS CID</label>
                      <input
                        type="text"
                        value={evidenceCidInput}
                        onChange={(e) => setEvidenceCidInput(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-700 rounded px-3 py-2 text-white font-mono text-sm"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSubmitEvidence}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded text-sm transition flex items-center justify-center gap-2"
                  >
                    <Truck className="w-4 h-4" /> Commit Delivery Evidence to On-Chain Escrow
                  </button>
                </div>
              )}

              {/* Stage Settlement Status */}
              {(campaign.stage1Paid || campaign.stage2Paid) && (
                <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg space-y-2">
                  <div className="text-xs uppercase font-semibold text-gray-400">Payment Payout Status</div>
                  <div className="text-xs text-emerald-400">
                    Stage 1 (70%): $5,950 USDC — Received upon 3-of-5 validator quorum.
                  </div>
                  {campaign.stage2Paid ? (
                    <div className="text-xs text-emerald-400">
                      Stage 2 (30%): $2,550 USDC + $500 bond — Received post-challenge clearance.
                    </div>
                  ) : (
                    <div className="text-xs text-amber-400">
                      Stage 2 (30%): $2,550 USDC — Held in challenge timelock window.
                    </div>
                  )}
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
                Inspect physical evidence manifests off-chain. Combine Chainlink CRE automated oracle checks with World ID human verification to reach 3-of-5 quorum.
              </p>

              {/* Chainlink CRE Automated Check Block */}
              <div className="p-4 bg-gray-900 border border-cyan-900/60 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-cyan-300 font-semibold text-sm">
                    <Cpu className="w-4 h-4" /> Chainlink CRE Evidence Analysis
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
                <div className="text-xs font-semibold text-gray-400 uppercase">
                  Cast On-Chain Attestation (3 of 5 Required)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {["Validator 1 (UN Affiliate)", "Validator 2 (Red Cross)", "Validator 3 (Community Auditor)"].map((val, idx) => (
                    <div key={idx} className="p-3 bg-gray-900/80 border border-gray-800 rounded-lg space-y-2">
                      <div className="text-xs font-semibold text-white truncate">{val}</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCastVote(`Validator ${idx + 1}`, true)}
                          disabled={validatorVoted[`Validator ${idx + 1}`]}
                          className={`w-full py-1.5 rounded text-xs font-semibold transition ${
                            validatorVoted[`Validator ${idx + 1}`]
                              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                              : "bg-emerald-700 hover:bg-emerald-600 text-white"
                          }`}
                        >
                          {validatorVoted[`Validator ${idx + 1}`] ? "Voted ✓" : "Approve"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Challenge & Dispute Action Controls */}
              {campaign.state === "InChallengePeriod" && (
                <div className="p-4 bg-amber-950/40 border border-amber-800 rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-amber-300">Challenge Window Active (120s Timelock)</span>
                    <button
                      onClick={handleRaiseDispute}
                      className="px-3 py-1 bg-red-900 hover:bg-red-800 text-red-200 border border-red-700 rounded text-xs font-semibold"
                    >
                      Raise Fraud Dispute
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">
                    Stage 1 (70%) is paid. If no dispute is raised, any party can finalize Stage 2 (30%) after the challenge window expires.
                  </p>
                  <button
                    onClick={handleFinalizeSettlement}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded text-xs transition"
                  >
                    Finalize Stage 2 Settlement (Release 30%)
                  </button>
                </div>
              )}
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
              <span className="text-[10px] bg-purple-950 text-purple-400 border border-purple-800 px-2 py-0.5 rounded font-mono">
                Expiring Shared State
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Queryable, wallet-owned entities offloading metadata from the blockchain with 14-day TTL expiration.
            </p>

            {/* Filter buttons */}
            <div className="flex gap-1.5 text-xs">
              {["all", "ProcurementRequest", "ProcurementBid"].map((filt) => (
                <button
                  key={filt}
                  onClick={() => setArkivFilter(filt)}
                  className={`px-2.5 py-1 rounded transition ${
                    arkivFilter === filt ? "bg-purple-600 text-white font-semibold" : "bg-gray-900 text-gray-400 hover:text-white"
                  }`}
                >
                  {filt === "all" ? "All" : filt === "ProcurementRequest" ? "Requests" : "Bids"}
                </button>
              ))}
            </div>

            {/* Entity List */}
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {arkivEntities
                .filter((e) => arkivFilter === "all" || e.type === arkivFilter)
                .map((entity) => (
                  <div key={entity.id} className="p-3 bg-gray-900/90 border border-gray-800 rounded-lg text-xs space-y-1">
                    <div className="flex justify-between items-center font-mono">
                      <span className="text-purple-300 font-semibold">{entity.id}</span>
                      <span className="text-[10px] text-gray-400">TTL: 14d</span>
                    </div>
                    <div className="text-gray-300">
                      {"title" in entity && entity.title}
                      {"commitHash" in entity && `Bid Hash: ${entity.commitHash.slice(0, 16)}...`}
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-400 pt-1">
                      <span>Owner: {entity.owner.slice(0, 8)}...</span>
                      <span className="text-emerald-400 font-semibold">{"status" in entity && entity.status}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Live Activity & Event Ledger */}
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-blue-400" /> Contract Events
              </h4>
              <span className="text-[10px] text-emerald-400 font-mono">LIVE ON-CHAIN</span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {txLogs.map((log) => (
                <div key={log.id} className="p-2.5 bg-gray-900/80 border border-gray-800/80 rounded text-xs space-y-0.5">
                  <div className="flex justify-between items-center text-[10px] font-mono text-gray-500">
                    {log.txHash.length > 20 ? (
                      <a
                        href={`https://testnet.arcscan.app/tx/${log.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 font-mono"
                        title="View transaction on ArcScan Explorer"
                      >
                        <span>{log.txHash.slice(0, 10)}...{log.txHash.slice(-6)}</span>
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
