# OpenAid Protocol — System Architecture & Technical Specification

## 1. System Context & Overview

OpenAid Protocol is a decentralized charitable procurement and staged settlement architecture designed for EVM blockchains. It eliminates the traditional custodial monopoly held by charities and NGOs by introducing a strict separation of powers enforced by immutable smart contracts.

```mermaid
graph TB
    subgraph Users & Stakeholders
        D[Donors]
        N[NGO Coordinator]
        V[Vendors / Suppliers]
        VAL[Independent Validators (3/5 Quorum)]
    end

    subgraph Presentation & Client Layer
        UI[Next.js 14 Web3 Frontend]
        WAGMI[Wagmi / Viem / RainbowKit]
        IPFS_CLIENT[IPFS Client / Pinata API]
    end

    subgraph On-Chain Smart Contract Core (EVM)
        CR[CampaignRegistry.sol]
        ES[EscrowSettlement.sol]
        PA[ProcurementAuction.sol]
        VR[ValidatorRegistry.sol]
        ERC20[(Mock USDC / ERC-20)]
    end

    subgraph Content-Addressed Off-Chain Storage
        IPFS[(IPFS Distributed Network / Filecoin)]
    end

    %% Interactions
    D -->|1. Connect & Donate| UI
    N -->|2. Create Campaign & RFP| UI
    V -->|3. Commit/Reveal Bids| UI
    VAL -->|4. Inspect Evidence & Vote| UI

    UI --> WAGMI
    UI --> IPFS_CLIENT

    WAGMI -->|Submit Tx / Read State| CR
    WAGMI -->|Deposit / Claim Refund| ES
    WAGMI -->|Commit / Reveal Bid| PA
    WAGMI -->|Cast Attestation Vote| VR

    CR <-->|Verify Status & Budget| ES
    PA <-->|Notify Winning Bid & Vendor| ES
    VR <-->|Trigger Staged Settlement| ES
    ES <-->|SafeERC20 Custody| ERC20

    IPFS_CLIENT -->|Upload Manifest & Photos| IPFS
    VAL -.->|Fetch & Verify Evidence| IPFS
```

---

## 2. Core Protocol Components & Responsibilities

### 2.1. `CampaignRegistry.sol`
- **Primary Responsibility:** Source of truth for campaign configuration and high-level lifecycle state.
- **Key State Variables:**
  - `campaignId => CampaignDetails` (creator NGO, budget ceiling, metadata IPFS CID, target delivery deadline, status).
- **Core Functions:**
  - `createCampaign(...)`: Registers a new humanitarian relief tender.
  - `updateCampaignStatus(...)`: Internal/authorized caller updates the state machine.
  - `cancelCampaign(...)`: Allows creator or emergency timeout to abort an unfunded campaign.

### 2.2. `EscrowSettlement.sol`
- **Primary Responsibility:** Sole custodian of ERC-20 capital. Enforces purpose-bound fund routing and zero-custody invariants.
- **Key State Variables:**
  - `campaignId => totalDeposited, totalAllocated, stage1Paid, stage2Paid`.
  - `campaignId => donorAddress => contributionAmount`.
  - `campaignId => winningVendorAddress, winningBidAmount`.
  - `campaignId => challengeExpiryTimestamp`.
- **Core Functions:**
  - `depositFunds(campaignId, amount)`: Pulls ERC-20 from donor to escrow; tracks individual balance.
  - `executeStage1Settlement(campaignId)`: Triggered by `ValidatorRegistry` on 3-of-5 quorum; transfers 70% to winning vendor.
  - `executeStage2Settlement(campaignId)`: Releases remaining 30% post-challenge period if no dispute is upheld.
  - `claimRefund(campaignId)`: Pull-based refund mechanism for donors if campaign aborts or fails.
- **Invariants Enforced:**
  - No generic `withdraw` or admin sweeps.
  - Checks-Effects-Interactions (CEI) and `ReentrancyGuard` on all token operations.

### 2.3. `ProcurementAuction.sol`
- **Primary Responsibility:** Manages sealed commit–reveal procurement bidding to eliminate front-running and vendor price collusion.
- **Key State Variables:**
  - `campaignId => vendorAddress => bidCommitmentHash`.
  - `campaignId => vendorAddress => bidBondAmount`.
  - `campaignId => lowestRevealedBid, winningVendor`.
  - `campaignId => commitDeadline, revealDeadline`.
- **Core Functions:**
  - `commitBid(campaignId, commitmentHash)`: Stores cryptographic hash with bond.
  - `revealBid(campaignId, amount, salt)`: Verifies hash, checks price ceiling, updates lowest bidder.
  - `finalizeAuction(campaignId)`: Selects winner and notifies `EscrowSettlement`.
  - `claimBondRefund(campaignId)`: Allows non-winning vendors to withdraw collateral.

### 2.4. `ValidatorRegistry.sol`
- **Primary Responsibility:** Manages validator set authorization, collects delivery attestation votes, enforces 3-of-5 threshold, and handles dispute flags.
- **Key State Variables:**
  - `validatorAddress => isAuthorized`.
  - `campaignId => validatorAddress => hasVoted, voteDecision`.
  - `campaignId => affirmativeVotes, negativeVotes`.
  - `campaignId => isDisputed, challengerAddress, disputeEvidenceCid`.
- **Core Functions:**
  - `submitEvidence(campaignId, ipfsCid)`: Vendor commits off-chain delivery manifest.
  - `castVote(campaignId, approve)`: Registered validator submits on-chain vote. Triggers Stage 1 when affirmative count reaches 3.
  - `raiseDispute(campaignId, counterEvidenceCid)`: Locks Stage 2 funds during challenge window.

---

## 3. Trust Boundaries & Security Topology

```
+-----------------------------------------------------------------------------------------+
| TRUST BOUNDARY 1: Web Browser / Client App                                              |
| - Unauthenticated user input, client-side cryptographic hashing, local private keys.   |
+-----------------------------------------------------------------------------------------+
                                          |
                                (Signed Transactions)
                                          v
+-----------------------------------------------------------------------------------------+
| TRUST BOUNDARY 2: Blockchain Smart Contracts (Zero-Trust Custody)                       |
| - Deterministic execution, state machine guarantees, immutable math, CEI pattern.     |
| - Invariant: Escrow contract never trusts NGO or individual caller with fund transfers. |
+-----------------------------------------------------------------------------------------+
       |                                                            |
(Storage Commitments)                                      (Validator Voting)
       v                                                            v
+-----------------------------+               +-------------------------------------------+
| TRUST BOUNDARY 3: IPFS      |               | TRUST BOUNDARY 4: Physical Reality Bridge |
| - Tamper-evident CIDs.      |               | - 3-of-5 human validator quorum consensus.|
| - Proves integrity of data, |               | - Challenge window for community audits.  |
|   NOT physical truth.       |               | - Does NOT claim smart contract omni-     |
|                             |               |   science over physical delivery.         |
+-----------------------------+               +-------------------------------------------+
```

---

## 4. End-to-End Sequence Flows

### 4.1. Campaign Funding & Procurement Flow

```mermaid
sequenceDiagram
    autonumber
    actor NGO as NGO Coordinator
    actor Donor as Impact Donor
    participant CR as CampaignRegistry
    participant ES as EscrowSettlement
    participant PA as ProcurementAuction
    actor Vendor as Vendor Alpha

    NGO->>CR: createCampaign(budgetCeiling, metadataCID, deadlines)
    CR-->>NGO: CampaignCreated(campaignId)

    Donor->>ES: depositFunds(campaignId, 10000 USDC)
    ES->>ES: Record donor contribution; totalDeposited = 10000
    ES-->>Donor: FundsDeposited(campaignId, Donor, 10000)

    CR->>PA: openAuction(campaignId, commitDeadline, revealDeadline)
    
    Vendor->>PA: commitBid(campaignId, hash(price, salt, vendorAddress)) + Bond
    PA-->>Vendor: BidCommitted(campaignId, Vendor)
    
    Note over Vendor,PA: Commit Window Closes -> Reveal Window Opens
    Vendor->>PA: revealBid(campaignId, price=8500, salt)
    PA->>PA: Validate hash == stored commitment
    PA-->>Vendor: BidRevealed(campaignId, Vendor, 8500)
    
    PA->>ES: registerWinningBid(campaignId, Vendor, 8500)
    ES->>ES: Lock 8500 allocation; reserve 1500 for donor refund
```

### 4.2. Verification, Staged Settlement & Challenge Flow

```mermaid
sequenceDiagram
    autonumber
    actor Vendor as Winning Vendor
    participant VR as ValidatorRegistry
    participant ES as EscrowSettlement
    actor Val1 as Validator 1
    actor Val2 as Validator 2
    actor Val3 as Validator 3
    actor Challenger as Community Challenger

    Vendor->>VR: submitEvidence(campaignId, ipfsCID)
    VR-->>Vendor: EvidenceSubmitted(campaignId, ipfsCID)

    Val1->>VR: castVote(campaignId, APPROVE)
    Val2->>VR: castVote(campaignId, APPROVE)
    Val3->>VR: castVote(campaignId, APPROVE)
    
    Note over VR: 3-of-5 Quorum Reached!
    VR->>ES: triggerStage1Settlement(campaignId)
    ES->>Vendor: SafeERC20.transfer(5950 USDC [70%])
    ES->>ES: Start Challenge Countdown (72h / 120s)
    ES-->>Vendor: Stage1Settled(campaignId, 5950)

    alt Challenge Period Passes Cleanly
        Note over ES: Challenge Window Expires (No Disputes)
        Vendor->>ES: finalizeSettlement(campaignId)
        ES->>Vendor: SafeERC20.transfer(2550 USDC [30%]) + Return Bond
        ES-->>Vendor: Stage2Settled(campaignId, 2550)
    else Dispute Raised & Upheld
        Challenger->>VR: raiseDispute(campaignId, fraudProofCID) + DisputeBond
        VR->>VR: Halt Stage 2 settlement
        Note over VR: Validators uphold dispute
        VR->>ES: resolveDispute(campaignId, fraudProven=true)
        ES->>ES: Cancel Stage 2; credit remaining 2550 to donor refund pool
    end
```

---

## 5. Deployment & Network Assumptions

1. **EVM Compatibility:** Solidity `^0.8.24` with Cancun EVM support (PUSH0, TSTORE where available, or standard Shanghai fallback).
2. **Target Networks:**
   - **Local Hardhat Network:** Chain ID `31337` (deterministic tests and rapid development).
   - **Target Public Testnets:** Base Sepolia (Chain ID `84532`) or Ethereum Sepolia (Chain ID `11155111`).
3. **Gas Optimization:**
   - Storage slots tightly packed (e.g. `uint128 amount`, `uint64 timestamp`, `uint8 status`).
   - Bitmaps / mappings used for vote tracking to prevent unbounded loops.
   - External calls placed strictly after internal updates.
