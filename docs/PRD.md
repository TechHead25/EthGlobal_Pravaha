# OpenAid Protocol — Product Requirements Document (PRD)

## 1. Document Control & Scope Overview

| Attribute | Details |
| :--- | :--- |
| **Document ID** | PRD-OPENAID-001 |
| **Status** | Pre-Development Approved |
| **Target Version** | v0.1.0-MVP (ETHGlobal Hackathon) |
| **Lead Architect** | Protocol Architecture Lead |

---

## 2. Functional Requirements (FR)

### Module 1: Campaign Management & Direct Escrow Funding
- **`FR-001` (Campaign Creation):** An NGO coordinator must be able to deploy a new campaign by defining:
  - Human-readable name and IPFS CID containing detailed relief specifications.
  - Relief budget ceiling (in standard ERC-20, e.g. Mock USDC).
  - Funding deadline (`fundingDeadline`).
  - Target fulfillment timeline / delivery deadline (`deliveryDeadline`).
  - Required validator threshold parameters (defaults: 3-of-5 quorum, 70/30 staged split, 72h challenge window).
- **`FR-002` (Zero-Custody Escrow):** All campaign funds must be deposited directly from donor wallets into the immutable `EscrowSettlement` contract. The NGO address must never receive custody or approval over these tokens.
- **`FR-003` (Donor Tracking):** The contract must record individual donor contribution balances per campaign to facilitate exact proportional refunds if the campaign is aborted or fails.
- **`FR-004` (Funding Target Completion):** When donor contributions reach the budget ceiling prior to `fundingDeadline`, the campaign automatically transitions to `BiddingActive`. If the deadline passes without reaching the minimum target, donors may claim full refunds.

### Module 2: Sealed Commit–Reveal Procurement Auction
- **`FR-005` (Bid Commitment):** During the commit window, registered or qualified vendors must submit a cryptographic commitment:
  $$\text{commitment} = \text{keccak256}(\text{abi.encodePacked}(\text{bidAmount}, \text{salt}, \text{msg.sender}))$$
- **`FR-006` (Bid Bond / Collateral):** To disincentivize griefing or ghost bidding, vendors must deposit a nominal bid bond (e.g., 5% of target budget or fixed fee) alongside the commit hash.
- **`FR-007` (Bid Reveal):** During the reveal window, vendors reveal their plain text `bidAmount` and `salt`. The contract verifies the hash matches the stored commitment and that `bidAmount <= budgetCeiling`.
- **`FR-008` (Winner Selection):** Upon reveal window closure, the contract selects the lowest valid revealed bid. In the event of an exact tie, the earliest submitted valid reveal is selected as the winning vendor. Any excess campaign funds beyond the winning bid remain reserved or are returned proportionally.
- **`FR-009` (Bond Refund & Slashing):** Non-winning vendors receive 100% of their bid bond back. Winning vendor bond is retained as performance bond until successful delivery. Vendors who commit but fail to reveal forfeit their bond to the campaign escrow.

### Module 3: Delivery Evidence Commitment
- **`FR-010` (Evidence Submission):** The selected winning vendor must submit a single root IPFS CID pointing to a structured delivery evidence manifest before `deliveryDeadline`.
- **`FR-011` (Manifest Integrity):** The contract must record `evidenceIpfsHash` and the exact block timestamp of submission, locking the campaign into `VerificationPending`.
- **`FR-012` (Delivery Timeout):** If the winning vendor fails to submit evidence before `deliveryDeadline`, the campaign enters `FailedDelivery`, slashing the vendor bond and enabling full donor refunds.

### Module 4: Decentralized Validator Quorum
- **`FR-013` (Validator Registry):** An authorized registry must manage the active validator set (initial pool: 5 designated independent entities).
- **`FR-014` (One-Vote-Per-Validator):** Each validator may cast at most one affirmative (`APPROVE`) or negative (`REJECT`) vote per campaign. Double voting or vote altering is programmatically blocked.
- **`FR-015` (Quorum Threshold Enforcement):** Verification succeeds if and only if $\ge 3$ affirmative votes are recorded before the verification deadline.
- **`FR-016` (Rejection / Quorum Failure):** If $\ge 3$ validators vote `REJECT` or the voting window expires without reaching 3 affirmative votes, the delivery is marked unverified.

### Module 5: Staged Settlement & Challenge Period
- **`FR-017` (Stage 1 Immediate Payout — 70%):** Upon reaching the 3-of-5 validator approval threshold, 70% of the winning bid amount is immediately released to the winning vendor's wallet address.
- **`FR-018` (Challenge Window Initiation):** Upon Stage 1 release, a timelock challenge window begins (production: 72 hours; hackathon demo: 120 seconds).
- **`FR-019` (Challenge Filing):** Any donor, validator, or community member may file a dispute within the challenge window by posting a dispute bond and linking evidence of fraud or non-delivery.
- **`FR-020` (Stage 2 Final Payout — 30%):** If the challenge window expires with no active challenge, the remaining 30% is unlocked and transferred to the vendor along with their initial performance bond.
- **`FR-021` (Dispute Resolution):** If an active dispute is filed, Stage 2 funds are frozen pending review. If the dispute is upheld by validator majority, the 30% is refunded to donors, and the vendor performance bond is slashed.

### Module 6: Pull-Payment Donor Refunds
- **`FR-022` (Pull-over-Push Refund):** In any abort, failure, or refund scenario, donors withdraw funds via an explicit `claimRefund(campaignId)` function to prevent denial-of-service (DoS) attacks from failing recipient contracts.

---

## 3. Non-Functional Requirements (NFR)

- **`NFR-001` (Custodial Security):** The smart contract escrow must contain zero arbitrary withdrawal pathways, zero owner rescue mechanisms, and zero sweeping functions. Funds can leave only to the winning vendor or original donors.
- **`NFR-002` (Reentrancy Immunity):** All external token transfer functions must follow the Checks-Effects-Interactions (CEI) pattern and implement OpenZeppelin's `ReentrancyGuard`.
- **`NFR-003` (Gas Efficiency):** Contract execution must be optimized for L2s (Base, Arbitrum) and Ethereum mainnet. Struct packing, custom errors, and event emission for off-chain indexing must be utilized.
- **`NFR-004` (Configurable Time Parameters):** The protocol must support a global or constructor parameter differentiating **Production Timings** (e.g. 7-day bidding, 72-hour challenge) from **Demo Timings** (e.g. 60-second bidding, 120-second challenge).
- **`NFR-005` (Content-Addressed Immutability):** Off-chain manifests must strictly use content-addressed storage (IPFS/Filecoin) such that tampering with any document, photo, or hash invalidates the on-chain pointer.

---

## 4. User Stories & Acceptance Criteria

### US-1: Donor Contribution
> **As a donor**, I want to deposit funds into a specific relief campaign escrow knowing my capital cannot be redirected by the NGO, so that my money only supports verified goods.
- **AC 1.1:** Donor can deposit ERC-20 (Mock USDC) via frontend wallet connection.
- **AC 1.2:** Escrow records donor's deposit amount mapped to `(campaignId, donorAddress)`.
- **AC 1.3:** NGO cannot withdraw or transfer deposited tokens directly.

### US-2: Vendor Commit–Reveal Bidding
> **As a relief supply vendor**, I want to submit a sealed bid without competitors seeing my pricing until the bidding closes, so that I have a fair procurement opportunity.
- **AC 2.1:** Vendor generates hash with price, salt, and address off-chain and submits on-chain.
- **AC 2.2:** After commit deadline, vendor reveals price and salt.
- **AC 2.3:** Contract validates the hash and records the lowest valid revealed bid.

### US-3: Validator Quorum Review
> **As an independent validator**, I want to inspect the IPFS evidence manifest and vote on delivery authenticity, so that vendor settlement is conditioned on objective ground truth.
- **AC 3.1:** Validator accesses the IPFS manifest containing photos, GPS data, and recipient confirmations.
- **AC 3.2:** Validator casts on-chain vote (`APPROVE` / `REJECT`).
- **AC 3.3:** When 3 affirmative votes are recorded, Stage 1 (70%) automatically unlocks.

### US-4: Donor Refund on Delivery Failure
> **As a donor**, I want to withdraw my original donation if the winning vendor fails to deliver within the contract deadline, so that my capital is not lost to unfulfilled promises.
- **AC 4.1:** Delivery deadline expires without valid IPFS evidence submission.
- **AC 4.2:** Campaign transitions to `FailedDelivery`.
- **AC 4.3:** Donor calls `claimRefund()` and receives their proportional share of the escrowed funds.

---

## 5. Scope Matrix: Hackathon MVP vs. Out-of-Scope

| Capability / Feature | MVP Scope (Hackathon) | Future / Out-of-Scope |
| :--- | :---: | :---: |
| Single ERC-20 (Mock USDC) Escrow | **Yes** | Multi-token / Native ETH support |
| Commit–Reveal Sealed Bidding | **Yes** | Zero-knowledge private bids (e.g. Semaphore/MACI) |
| On-Chain 3-of-5 Validator Quorum | **Yes** | Decentralized EigenLayer AVS / PoS validator network |
| Staged Settlement (70% Stage 1, 30% Stage 2) | **Yes** | Dynamic multi-tranche milestone curves |
| IPFS Content-Addressed Manifest Commitment | **Yes** | Automated AI satellite imagery computer vision oracles |
| Pull-Payment Donor Refunds | **Yes** | Secondary market yield generation for idle escrow |
| Single-Chain Deployment (Hardhat / Sepolia / Base) | **Yes** | Cross-chain intent bridges (CCIP / LayerZero) |
| Role-Based Frontend (Donor, NGO, Vendor, Validator) | **Yes** | Mobile native app (React Native) |
| Fast Demo Mode Timings | **Yes** | Multi-day legal jurisdiction arbitration |

---

## 6. Success Metrics for MVP

1. **Custody Security:** Zero instances of unauthorized fund redirection in smart contract audit test suites.
2. **Auction Integrity:** 100% of sealed bids hidden until reveal; lowest valid bidder selected deterministically in 100% of test runs.
3. **Settlement Accuracy:** Exact 70% released on 3-of-5 quorum, exact 30% released after challenge timeout.
4. **End-to-End Demo Completeness:** A complete multi-role flow executed within 5 minutes during live presentation.
