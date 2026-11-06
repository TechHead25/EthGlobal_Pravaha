# OpenAid Protocol — Partner Track Verification & Judging Guide

> **ETHGlobal Mumbai Hackathon Partner Track Audit & Verification Manual**  
> This document provides partner track judges with an exhaustive, step-by-step verification guide for all four protocol integrations: **Arc (Circle Layer 1)**, **World (World ID & IDKit)**, **Arkiv (Rabdi Testnet)**, and **Chainlink CRE (Consensus Runtime Environment)**.

---

## Executive Summary & Quick-Verification Table

OpenAid Protocol eliminates single points of trust in humanitarian aid by decoupling **custody**, **procurement**, **verification**, and **settlement**:

| Partner | Target Track(s) | Prize Tier | Status | 10-Second Test Command | Core Architectural Invariant |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Arc (Circle)** | 1. Best DeFi / Onchain Finance in Arc Studio<br>2. Smart Contracts w/ Advanced Stablecoin Logic | \$3,000<br>\$3,000 | **100% PASS** | `npm run test:arc`<br>`npm run test:contracts` | Zero-Custody, 70/30 Staged Settlement, Sub-Vault Isolation, 15% Backup Vendor Spread Cap |
| **World** | 1. World ID Agent Pass<br>2. Best Use of IDKit | \$2,500<br>\$2,500 | **100% PASS** | `npm run test:worldid`<br>`npm run test:validator` | Dynamic 5-of-14 Panel Selection (Efraimidis-Spirakis), BN254 Recipient Receipt Replay Shield |
| **Arkiv** | 1. Mirror Something Ethereum Depends On<br>2. Build on Arkiv<br>3. Swarm Bonus | \$4,000<br>\$4,000<br>\$500-\$1k | **100% PASS** | `npm run test:arkiv`<br>`npm run seed:arkiv` | Humanitarian Tender, Bids & Evidence Mirroring, Wallet Ownership, Auto-Expiration (`expiresAt`) |
| **Chainlink** | Best Workflow with CRE | \$1,500 | **100% PASS** | `npm run test:cre` | 4-Node DON Consensus Handshake with Google Gemini AI & World ID, 3-of-4 BFT Threshold |

---

## 30-Second Quickstart for Judges

To run all **99 automated partner integration tests** and verify all four partner tracks in a single command:

```bash
npm run test:partners
```

To run the full Solidity smart contract test suite on Arc Testnet architecture:

```bash
npm run test:contracts
```

**Total Passing Tests Across Entire Suite:** **115 Passing Tests** (0 failures, 0 flakiness).

---

## Track 1: Arc (Circle Layer 1) — Advanced Stablecoin & DeFi Architecture

### 1. Tracks Targeted
- **Best DeFi / Onchain Finance App in Arc Studio** (\$3,000)
- **Smart Contracts with Advanced Stablecoin Logic** (\$3,000)

### 2. Architecture & Invariants Enforced
OpenAid Protocol deploys on **Arc Testnet** (Circle Layer 1, Chain ID: `5042002`) utilizing the official Arc Testnet Circle USDC token (`0x3600000000000000000000000000000000000000`, 6 decimals).

Five cardinal protocol invariants are mathematically and programmatically enforced in Solidity:
1. **Zero Custody:** Neither the NGO campaign creator, the contract deployer, nor any admin account ever holds or routes donor funds. Donor capital flows strictly into immutable escrow.
2. **Two Mutually Exclusive Exit Paths:**
   - **Path A (Verified Staged Settlement):** 70% immediate tranche upon 3-of-5 validator quorum attestation; 30% second tranche released upon 72-hour timelock challenge window expiry without an active dispute.
   - **Path B (Proportional Donor Refund):** If funding fails, auction fails, delivery fails, or a dispute is upheld, 100% of remaining funds return to original donors via pull-over-push math:
     $$\text{refund} = \frac{\text{donorDeposit} \times \text{remainingBalance}}{\text{totalDeposited}}$$
3. **Sub-Vault Isolation:** Multi-item campaigns (e.g. Food \$50k, Blankets \$30k) operate as isolated sub-vaults. A delivery failure or dispute in one sub-vault never drains or locks funds in another.
4. **15% Backup Vendor Spread Cap:** If the winning vendor defaults or is penalized, the backup vendor can only be awarded if their revealed bid $\le 1.15 \times \text{winning\_bid}$. The defaulted vendor's slashed bond offsets any price difference.
5. **No Sweep / Emergency Withdraw Backdoors:** Zero `emergencyWithdraw()`, owner rescue, or admin draining functions exist in the codebase.

### 3. Live Deployed On-Chain Evidence
- **Network:** Arc Testnet (Chain ID: `5042002`, RPC: `https://rpc.testnet.arc.network`)
- **Deployed OpenAidEscrow Contract:** [`0xe38151283e55077F621988679f2Cc524b785d236`](https://testnet.arcscan.app/address/0xe38151283e55077F621988679f2Cc524b785d236)
- **Live ArcScan Blocks & Events:** Live on-chain activity viewable at Blocks `#71,080,450`, `#71,079,103`, and `#71,072,386`.

### 4. Source Code Map
- [`contracts/core/OpenAidEscrow.sol`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/contracts/core/OpenAidEscrow.sol) — Core settlement engine, sub-vault accounting, commit-reveal procurement auctions, 70/30 staged release, and pull-over-push refunds.
- [`src/lib/arc/config.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/lib/arc/config.ts) — Official Arc Testnet configuration, USDC address (`0x3600...`), decimals (6), and block explorer links.
- [`src/server/chain.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/server/chain.ts) — Read-only SSR indexing of live Arc events, block timestamps, and escrow balance accounting.
- [`src/app/(site)/transparency/page.tsx`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/app/(site)/transparency/page.tsx) — Public ledger interface reading real-time Arc Testnet state.

### 5. Step-by-Step Test Commands
```bash
# 1. Run the Hardhat smart contract test suite (16 tests)
npx hardhat test test/OpenAidEscrow.test.ts

# 2. Run the Arc integration & safety guard suite (19 tests)
npm run test:arc
```

**Expected Result:** 35 passing tests verifying Chain ID validation, token decimal alignment (6 decimals), deposit allowances, reentrancy guards, and staged settlement payouts.

---

## Track 2: World (World ID & IDKit) — Sybil-Resistant Validator Selection & Binary Recipient Receipt

### 1. Tracks Targeted
- **World ID Agent Pass** (\$2,500)
- **Best Use of IDKit** (\$2,500)

### 2. Architecture & Invariants Enforced
OpenAid integrates World ID IDKit v1.3 and BN254 Semaphore zero-knowledge proofs in two distinct, mission-critical protocol layers:

#### A. Dynamic Validator Panel Selection (`src/lib/validator/selection.ts`)
- Maintains a pool of 14 registered, World ID-verified validators.
- Implements the **Efraimidis-Spirakis weighted sampling algorithm** with cryptographic seed generation:
  $$\text{seed} = \text{keccak256}(\text{block.prevrandao}, \text{campaignId}, \text{subVaultId})$$
  $$w_i = \min(\text{score}_i, 80)$$
  $$u_i = \frac{\text{hash}(\text{seed}, \text{subVaultId}, \text{validatorId})}{2^{256}}$$
  $$\text{key}_i = u_i^{1 / w_i}$$
  $$\text{panel} = \text{top 5 validators by key}, \quad \text{alternates} = \text{next 3 by key}$$
- **Conflict of Interest Filtering:** Automatically screens out any validator affiliated with the campaign creator NGO or bidding vendors.
- **Alternate Replacement:** If a validator times out or withdraws, they are dynamically replaced with the next alternate in strict key order without stalling the panel.

#### B. Binary World ID Recipient Receipt (`src/app/api/recipient-receipt/route.ts` & `src/lib/worldid/recipient-receipt.ts`)
- On-the-ground disaster relief beneficiaries submit zero-knowledge Semaphore proofs over the BN254 elliptic curve committing to:
  $$\text{action} = \text{keccak256}(\text{campaignId}, \text{subVaultId}, \text{deliveryManifestCid})$$
- **Anti-Replay Protection:** Tracks nullifiers per `actionId`. Submitting the same nullifier twice for the same sub-campaign is rejected with **HTTP 409 Conflict (`ALREADY_VERIFIED`)**.
- **Decoupled Safety Invariant:** Setting `HasReceived(subCampaignId, nullifier) = true` feeds proof into the validator quorum and Chainlink CRE; it **never** triggers an automatic, unreviewed on-chain payout.

#### C. World ID Integration Guide & Developer Debrief
- [`docs/WORLD_ID_INTEGRATION_GUIDE.md`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/docs/WORLD_ID_INTEGRATION_GUIDE.md) includes Section 8 documenting:
  - **Time to First Success:** ~35 minutes from IDKit package installation to valid simulated proof verification.
  - **Integration Friction Points:** BigInt scalar field modulus arithmetic ($r = 21888242871839275222246405745257275088548364400416034343698204186575808495617\text{n}$), UTF-8 vs 32-byte hex action digest handling, and headless CI mock environments.
  - **Minimum Sufficient Assurance Rationale:** Why `orb` verification is strictly enforced for validator selection while `device` credential level is accepted for on-the-ground beneficiaries in crisis zones.

### 3. Source Code Map
- [`src/lib/validator/selection.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/lib/validator/selection.ts) — Efraimidis-Spirakis weighted panel draw, conflict filtering, and alternate replacement.
- [`src/app/api/recipient-receipt/route.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/app/api/recipient-receipt/route.ts) — Decoupled beneficiary receipt route with anti-replay nullifier tracking.
- [`src/lib/worldid/recipient-receipt.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/lib/worldid/recipient-receipt.ts) — BN254 scalar verification, action digest hashing, and receipt queries.
- [`src/lib/worldid/verifier.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/lib/worldid/verifier.ts) — Core IDKit Semaphore proof validation.
- [`docs/WORLD_ID_INTEGRATION_GUIDE.md`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/docs/WORLD_ID_INTEGRATION_GUIDE.md) — Comprehensive World ID integration guide, threat model, and engineering debrief.

### 4. Step-by-Step Test Commands
```bash
# 1. Run the World ID server-side verification suite (22 tests)
npm run test:worldid

# 2. Run the dynamic validator selection & recipient receipt suite (16 tests)
npm run test:validator
```

**Expected Result:** 38 passing tests verifying BN254 parameter validation, zero-leak nullifier checks, HTTP 409 replay attack prevention, and Efraimidis-Spirakis mathematical distribution.

---

## Track 3: Arkiv (Rabdi Testnet) — Decentralized Provenance & Data Mirroring

### 1. Tracks Targeted
- **Mirror Something Ethereum Depends On** (\$4,000)
- **Build on Arkiv** (\$4,000)
- **Swarm Bonus** (\$500-\$1,000)

### 2. Architecture & Invariants Enforced
OpenAid mirrors high-volume, text-heavy procurement tenders, sealed bids, delivery evidence, and validator audit reviews onto **Arkiv Rabdi Testnet** (Chain ID: `7794095`) under the versioned `openaid.v1` namespace:
- `openaid.v1.requests` — Humanitarian procurement tenders with item specifications and budget ceilings.
- `openaid.v1.bids` — Cryptographic sealed-bid commitments and revealed pricing.
- `openaid.v1.evidence` — Logistics carrier waybills, manifest CIDs, and physical package counts.
- `openaid.v1.reviews` — World ID-verified validator quorum votes and audit notes.

Key Arkiv features leveraged:
1. **Time-Scoped Expiration (`expiresAt`):** Entities automatically prune after their domain TTL (e.g. 14 days for tenders, 90 days for evidence), eliminating recurring gas fees and centralized database maintenance.
2. **Cryptographic Wallet Ownership:** Every entity has an `owner` address matching the creator's wallet. Unauthenticated mutations are rejected on-chain.
3. **PII & Privacy Screening Interceptor (`validatePublicSuitability`):** An interceptor scans all payloads for private keys, names, and personal phone numbers, rejecting sensitive data before persistence.
4. **Isomorphic Dual-Mode Adapter:** Supports both live Rabdi testnet wallet signing and an in-memory deterministic adapter for fast, zero-flakiness automated CI testing.
5. **Re-Runnable Seed Script:** Provided in `scripts/seed-arkiv.ts` satisfying track qualification criteria.
6. **Detailed Ecosystem Feedback:** Authored [`arkiv/friction.md`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/arkiv/friction.md), [`arkiv/why-arkiv.md`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/arkiv/why-arkiv.md), and [`arkiv/how-you-use-arkiv.md`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/arkiv/how-you-use-arkiv.md).

### 3. Source Code Map
- [`scripts/seed-arkiv.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/scripts/seed-arkiv.ts) — Re-runnable data import script for all 4 entity types.
- [`src/lib/arkiv/schemas.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/lib/arkiv/schemas.ts) — Schema definitions under `openaid.v1` namespace with indexed query attributes.
- [`src/lib/arkiv/adapter.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/lib/arkiv/adapter.ts) — Dual-mode client with wallet ownership and expiration enforcement.
- [`src/lib/arkiv/validation.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/lib/arkiv/validation.ts) — Strict payload validation and PII detection.
- [`arkiv/friction.md`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/arkiv/friction.md) — Comprehensive developer experience feedback and recommendations for the Arkiv core team.

### 4. Step-by-Step Test Commands
```bash
# 1. Execute the re-runnable Arkiv data import script
npm run seed:arkiv

# 2. Run the Arkiv schema, ownership, and query test suite (21 tests)
npm run test:arkiv
```

**Expected Result:** 21 passing tests verifying namespace isolation, expiration policy assignment, wallet access control, and privacy violation prevention.

---

## Track 4: Chainlink CRE — Consensus Runtime Environment & AI Handshake

### 1. Tracks Targeted
- **Best Workflow with CRE** (\$1,500)

### 2. Architecture & Invariants Enforced
OpenAid implements a simulated **4-Node Specialized Decentralized Oracle Network (DON)** using the Chainlink Consensus Runtime Environment (CRE) workflow:
- **Node 1 (Carrier API Verification):** Validates real-world tracking status (`DELIVERED`) against commercial freight carrier APIs.
- **Node 2 (Spatial Geofencing):** Cross-checks latitude/longitude delivery coordinates against the campaign's disaster relief polygon boundary.
- **Node 3 (AI Spec Match Handshake):** Dispatches delivery invoices to the Google Gemini API (`/api/verify-invoice`) for structured optical character extraction and RFP specification matching.
- **Node 4 (Last-Mile Human Proof):** Checks for the presence of a verified World ID recipient receipt and valid beneficiary nullifier.

#### Byzantine Fault Tolerance (BFT) Invariant:
- Requires at least **3-of-4 BFT consensus** across specialized DON nodes to recommend `APPROVE_FOR_HUMAN_REVIEW` to the human validator panel.
- If two or more nodes detect a discrepancy (e.g. carrier reports `IN_TRANSIT`, GPS falls outside the polygon, or Gemini detects under-delivery), the DON fails consensus and emits `REJECT` with 0 affirmative votes.

### 3. Source Code Map
- [`src/lib/cre/workflow.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/lib/cre/workflow.ts) — Core Chainlink CRE consensus workflow simulation.
- [`src/lib/cre/don.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/lib/cre/don.ts) — 4-node specialized DON consensus engine and BFT threshold computation.
- [`src/lib/cre/schemas.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/lib/cre/schemas.ts) — Input/output Zod schemas and validation rules.
- [`src/app/api/verify-delivery/route.ts`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/src/app/api/verify-delivery/route.ts) — API endpoint executing the CRE workflow.
- [`docs/CHAINLINK_CRE_INTEGRATION_GUIDE.md`](file:///c:/Users/suyas/OneDrive/Desktop/pravaha/EthGlobal_Pravaha/docs/CHAINLINK_CRE_INTEGRATION_GUIDE.md) — Architectural overview, DON topology, and threat analysis.

### 4. Step-by-Step Test Commands
```bash
# 1. Run the Chainlink CRE DON consensus & BFT tolerance suite (21 tests)
npm run test:cre

# 2. Run the CRE to Gemini AI handshake test in the validator suite
npm run test:validator
```

**Expected Result:** 21 passing tests verifying carrier state transitions, GPS ray-casting geofencing, 3-of-4 Byzantine fault tolerance, and under-delivery rejection.

---

## 4-Minute Video Presentation Structure (For the Team)

Because 4 minutes is limited, structure the video to tell the unified story while highlighting each partner naturally:

```
[0:00 - 0:45] The Problem & The Arc Settlement Engine
- Problem: $30B+ in humanitarian aid lost to corruption, lack of custody separation, and administrative overhead.
- Solution: OpenAid Protocol on Arc Testnet (Circle Layer 1). Show zero-custody escrow, USDC deposits, and sub-vault isolation.

[0:45 - 1:45] Procurement & Provenance on Arkiv
- NGO creates humanitarian RFP; vendors submit sealed commit-reveal bids.
- Show Arkiv Rabdi Testnet provenance: Tenders, bids, and evidence manifests stored under openaid.v1 with wallet ownership and auto-expiration.

[1:45 - 2:45] Delivery Verification: Chainlink CRE + Google Gemini AI
- Vendor fulfills delivery and submits shipping waybill & invoice photos.
- Chainlink CRE 4-Node DON executes:
  - Carrier tracking check (Node 1)
  - Disaster zone geofence match (Node 2)
  - Google Gemini AI structured invoice match (Node 3)
  - World ID recipient receipt check (Node 4)
- 3-of-4 BFT consensus recommends APPROVE for human review.

[2:45 - 3:30] Human Validator Panel & Recipient Proof on World ID
- Show dynamic 5-of-14 validator selection via Efraimidis-Spirakis weighted sampling algorithm (World ID Sybil resistance).
- Show beneficiary on the ground submitting BN254 Semaphore proof (anti-replay nullifier shield).

[3:30 - 4:00] Staged Settlement & Judging Callout
- Validators attest on Arc: Tranche 1 (70%) releases immediately to vendor.
- 72-hour timelock opens for community challenges before Tranche 2 (30%) releases.
- End screen: Call out docs/PARTNER_VERIFICATION_GUIDE.md for full code audits and test instructions!
```

---

## Complete Test Suite Verification Summary

```bash
# Partner Test Suite Breakdown:
npm run test:arc        # 19 passing (Arc Testnet safety guards & accounting)
npm run test:arkiv      # 21 passing (Arkiv schemas, expiration & ownership)
npm run test:cre        # 21 passing (Chainlink CRE 4-node DON & BFT consensus)
npm run test:worldid    # 22 passing (World ID BN254 Semaphore verification & anti-replay)
npm run test:validator  # 16 passing (Dynamic panel selection & CRE-Gemini handshake)
npx hardhat test        # 16 passing (OpenAidEscrow Solidity smart contract)

# Total Across Entire Protocol:
# 115 passing tests (100% success rate)
```
