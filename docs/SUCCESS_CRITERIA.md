# OpenAid Protocol — Hackathon Demo Success Criteria

## 1. Purpose & Target Standard

This document establishes the measurable, non-negotiable success conditions for evaluating OpenAid Protocol during development, automated testing, and live presentation at the ETHGlobal hackathon.

Every requirement defined herein must be provably demonstrated through automated integration tests and an interactive, role-based Web3 frontend.

---

## 2. Measurable Demonstration Acceptance Criteria

### Criterion 1: Zero-Custody NGO Creation & Direct Escrow Funding
- [ ] **SC-1.1:** NGO wallet connects to the frontend, submits a campaign specification (e.g. "Clean Water Purification Kits for Flood Region A", budget: 10,000 USDC), and deploys the campaign record on-chain.
- [ ] **SC-1.2:** Donor wallet deposits 10,000 Mock USDC directly into the `EscrowSettlement` contract.
- [ ] **SC-1.3:** **Custody Verification:** UI and block explorer verify that the NGO wallet balance did **NOT** increase, and that `EscrowSettlement` token balance equals exactly 10,000 USDC.
- [ ] **SC-1.4:** Attempting to call any hypothetical or administrative fund transfer from the NGO account reverts with `error Unauthorized()` or `error InvalidState()`.

### Criterion 2: Sealed Commit–Reveal Procurement Auction
- [ ] **SC-2.1:** Vendor A submits a commit hash for 9,200 USDC + bond.
- [ ] **SC-2.2:** Vendor B submits a commit hash for 8,500 USDC + bond.
- [ ] **SC-2.3:** An observer or competitor inspecting mempool or state storage cannot discern either bid price before the reveal window opens.
- [ ] **SC-2.4:** Both vendors reveal price and salt during the reveal window.
- [ ] **SC-2.5:** Protocol automatically selects Vendor B as the winner ($8,500 < $9,200).
- [ ] **SC-2.6:** Non-winning Vendor A's bid bond is returned in full; Vendor B's bond is locked as performance collateral.

### Criterion 3: Delivery Evidence Commitment to IPFS
- [ ] **SC-3.1:** Winning Vendor B generates an evidence package containing multi-angle photos, geostamped delivery coordinates, and logistics bills of lading.
- [ ] **SC-3.2:** Vendor uploads the package to IPFS via the UI, receiving an immutable content CID (e.g., `ipfs://bafybeic...`).
- [ ] **SC-3.3:** Vendor calls `submitDeliveryEvidence(campaignId, ipfsCID)` on-chain before the delivery deadline.
- [ ] **SC-3.4:** State transitions from `AwaitingDelivery` to `VerificationPending`.

### Criterion 4: Multi-Validator Quorum Attestation (3 of 5)
- [ ] **SC-4.1:** Five independent validator accounts are registered in `ValidatorRegistry`.
- [ ] **SC-4.2:** Validator 1 and Validator 2 review the IPFS manifest and submit affirmative votes (`APPROVE`). Campaign remains in `VerificationPending`.
- [ ] **SC-4.3:** Validator 3 casts the third affirmative vote (`APPROVE`).
- [ ] **SC-4.4:** The 3-of-5 threshold is reached, automatically triggering:
  - State transition to `Stage1Settled`.
  - Immediate transfer of 70% of winning bid ($5,950 USDC) directly to Vendor B.
  - Initiation of the challenge countdown window.

### Criterion 5: Challenge Window & Stage 2 Final Settlement
- [ ] **SC-5.1:** In Demo Timing Mode, the challenge countdown is set to 120 seconds.
- [ ] **SC-5.2:** No fraud challenge is filed during the countdown.
- [ ] **SC-5.3:** After 120 seconds, any party (or automated relayer) calls `finalizeSettlement(campaignId)`.
- [ ] **SC-5.4:** Remaining 30% of winning bid ($2,550 USDC) and Vendor B's performance bond are transferred to Vendor B.
- [ ] **SC-5.5:** Campaign state transitions to `Completed`. Remaining unspent budget ($1,500 USDC) is credited for donor refund.

### Criterion 6: Adversarial & Failure Demonstration (Negative Testing)
- [ ] **SC-6.1 (Double-Voting Prevention):** Validator 1 attempts to vote a second time on the same campaign; transaction reverts on-chain with `error AlreadyVoted()`.
- [ ] **SC-6.2 (Unauthorized Settlement Release):** Vendor or NGO attempts to call `releaseFinalPayment()` before challenge window expiry; transaction reverts with `error ChallengePeriodActive()`.
- [ ] **SC-6.3 (Delivery Timeout & 100% Donor Refund):** In a separate test scenario, Vendor B fails to submit delivery evidence before `deliveryDeadline`.
- [ ] **SC-6.4:** State transitions to `FailedDelivery`. Donor calls `claimRefund(campaignId)` and receives 100% of their deposited capital back.

---

## 3. Demo Quality & Presentation Checklist

- [ ] **Deterministic Execution:** The demo flow can be executed in under 4 minutes without unexpected transaction stalls or manual private key juggling.
- [ ] **Multi-Role UI Switching:** The frontend provides a clear, high-contrast role switcher (Donor, NGO, Vendor, Validator) with pre-configured local test accounts.
- [ ] **Honest Truth Architecture:** The presenter and UI explicitly acknowledge that on-chain CIDs prove data authenticity and integrity, while physical delivery assurance relies on validator consensus and challenge rights.
- [ ] **Zero Fabricated Tests:** All test commands displayed in documentation are backed by passing Hardhat test executions.
