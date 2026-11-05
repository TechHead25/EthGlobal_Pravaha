# OpenAid Protocol — Formal Protocol Rules & Governance Mechanics

## 1. Governance & Authority Principles

OpenAid Protocol enforces decentralized coordination through code-enforced rules. There is no central administrator, benevolent owner, or multisig endowed with discretionary power to divert, confiscate, or re-route escrowed donor funds.

---

## 2. Exhaustive Protocol Rules by Domain

### 2.1. Campaign Lifecycle & Funding Rules

- **`RULE-CAMP-01` (Creation Authority):**
  - Any registered NGO or community coordinator may call `createCampaign(...)`.
  - The creator specifies `budgetCeiling`, `metadataIpfsCid`, `fundingDeadline`, and `deliveryDeadline`.
  - The creator has **zero custodial rights** over deposited funds.
- **`RULE-CAMP-02` (Funding Model):**
  - Donors deposit ERC-20 tokens directly into `EscrowSettlement`.
  - Deposits are credited to `campaignEscrow[campaignId]` and mapped to `donorContributions[campaignId][donorAddress]`.
  - If total deposits reach `budgetCeiling` before `fundingDeadline`, the campaign transitions to `FundingSuccessful` and activates the procurement auction.
- **`RULE-CAMP-03` (Funding Timeout & Cancellation):**
  - If `block.timestamp > fundingDeadline` and `totalDeposited < budgetCeiling`, the campaign enters `FundingFailed`.
  - Donors are entitled to a 100% proportional pull-refund of their deposited tokens.
  - An NGO creator may cancel an active campaign only if `totalDeposited == 0`. Once funds are received, the creator cannot cancel unilaterally.
- **`RULE-CAMP-04` (No Arbitrary Withdrawal Invariant):**
  - Campaign funds can **never** be withdrawn to an arbitrary address under any circumstance.
  - Funds only exit escrow via:
    1. Direct staged payouts to the authenticated winning vendor.
    2. Proportional refunds to original depositing donors.

---

### 2.2. Vendor Qualification & Sealed Commit–Reveal Auction Rules

- **`RULE-AUCT-01` (Vendor Participation):**
  - *Decision for MVP:* Permissionless participation with economic bond, OR pre-screened vendor whitelist.
  - *MVP Rule:* Permissionless bidding open to any address that deposits a mandatory `bidBond` (5% of `budgetCeiling`). This eliminates registration bottlenecks during the hackathon while mitigating spam/griefing attacks.
- **`RULE-AUCT-02` (Commitment Mechanics):**
  - Commit window duration: Production = 72 hours; Demo Mode = 30 seconds.
  - Vendor submits:
    $$\text{hash} = \text{keccak256}(\text{abi.encodePacked}(\text{bidAmount}, \text{salt}, \text{msg.sender}))$$
  - The vendor's address (`msg.sender`) is strictly bound in the hash to prevent front-running and copy-commit attacks.
- **`RULE-AUCT-03` (Reveal Window Mechanics):**
  - Reveal window duration: Production = 48 hours; Demo Mode = 30 seconds.
  - Vendor reveals `(bidAmount, salt)`.
  - The contract recalculates `keccak256(...)` and compares it to stored commitment.
  - If `bidAmount > budgetCeiling`, the reveal is rejected.
- **`RULE-AUCT-04` (Winner Selection & Ties):**
  - The valid revealed bid with the lowest `bidAmount` is selected as the winning bidder.
  - **Tie-Breaking Rule:** If two or more vendors reveal the exact same lowest bid, the vendor whose reveal transaction was mined in the earlier block (or earlier transaction index in the same block) wins.
- **`RULE-AUCT-05` (Bid Bond Settlement & Forfeiture):**
  - Non-winning revealed vendors may immediately withdraw their full `bidBond`.
  - The winning vendor's `bidBond` is retained in escrow as a performance guarantee until final settlement.
  - **Non-Reveal Forfeiture:** Any vendor who submits a commit hash but fails to reveal before the reveal deadline forfeits their `bidBond` to the campaign escrow pool (benefiting donors).
- **`RULE-AUCT-06` (Zero Valid Reveals Fallback):**
  - If zero valid reveals are submitted before the reveal deadline, the campaign transitions to `AuctionFailed`.
  - Donors may immediately claim 100% refunds.

---

### 2.3. Delivery Fulfillment & Evidence Commitment Rules

- **`RULE-EVID-01` (Commitment Authority & Deadline):**
  - Only the authenticated winning vendor may call `submitDeliveryEvidence(...)`.
  - Evidence must be submitted before `deliveryDeadline`.
- **`RULE-EVID-02` (Content-Addressed Manifest Commitment):**
  - The vendor commits an IPFS CID pointing to a canonical JSON manifest containing multi-angle photos, GPS coordinates, carrier bills of lading, and timestamped item logs.
  - The contract stores `evidenceCid` and records `evidenceSubmittedAt = block.timestamp`.
- **`RULE-EVID-03` (Manifest Versioning & Immutability):**
  - For the MVP, evidence submission is immutable and one-time. Once committed, the vendor cannot overwrite the CID.
  - Submitting evidence locks the campaign into `VerificationPending` and begins the validator review window.
- **`RULE-EVID-04` (Delivery Timeout & Slashing):**
  - If `block.timestamp > deliveryDeadline` and no evidence CID has been committed:
    - Campaign transitions to `DeliveryFailed`.
    - Winning vendor's performance bond is slashed (credited to donor pool).
    - 100% of donor principal in escrow is unlocked for refund claims.

---

### 2.4. Independent Validator Quorum Rules

- **`RULE-VAL-01` (Validator Registry & Authentication):**
  - Validators are registered in `ValidatorRegistry.sol` (initial set: 5 independent entities).
  - Only addresses flagged as `isAuthorized == true` can vote.
- **`RULE-VAL-02` (One-Vote-Per-Validator):**
  - A validator may cast exactly one vote per campaign: `APPROVE` or `REJECT`.
  - Double-voting is strictly prevented via mapping:
    ```solidity
    if (hasVoted[campaignId][msg.sender]) revert AlreadyVoted();
    ```
- **`RULE-VAL-03` (Quorum Threshold):**
  - Verification requires $\ge 3$ affirmative (`APPROVE`) votes within the validator review window (Production = 7 days; Demo Mode = 60 seconds).
  - The 3-of-5 quorum condition triggers automatic transition to `Stage1Settled`.
- **`RULE-VAL-04` (Quorum Failure / Consensus Rejection):**
  - If $\ge 3$ validators vote `REJECT` or the review window expires with $< 3$ affirmative votes:
    - Campaign transitions to `VerificationFailed`.
    - Vendor receives 0% payout; performance bond is slashed.
    - 100% of escrowed funds revert to donors.

---

### 2.5. Staged Settlement & Challenge Rules

- **`RULE-SETT-01` (Stage 1 Disbursement — 70%):**
  - Condition: Reaching 3-of-5 validator quorum automatically triggers `executeStage1Settlement()`.
  - Amount: Exactly 70% of the winning bid amount:
    $$\text{payout}_1 = \text{winningBidAmount} \times 70 / 100$$
  - Recipient: Winning vendor's wallet address.
  - Consequence: Campaign state changes to `InChallengePeriod`; challenge countdown timer starts.
- **`RULE-SETT-02` (Challenge Window Duration):**
  - Production: 72 hours.
  - Demo Mode: 60 to 120 seconds.
- **`RULE-SETT-03` (Raising a Dispute):**
  - Any donor, validator, or registered participant may call `raiseDispute(campaignId, counterEvidenceCid)` by posting a `disputeBond` (e.g. 10% of remaining 30%).
  - Calling `raiseDispute` freezes Stage 2 disbursement and sets `isDisputed = true`.
- **`RULE-SETT-04` (Stage 2 Final Disbursement — 30%):**
  - Condition: Challenge window expires (`block.timestamp >= challengeExpiry`) AND `isDisputed == false`.
  - Anyone may trigger `finalizeSettlement(campaignId)`.
  - Amount: Remaining 30% of winning bid plus return of winning vendor's `bidBond`:
    $$\text{payout}_2 = (\text{winningBidAmount} \times 30 / 100) + \text{bidBond}$$
  - Unspent budget ceiling surplus ($\text{budgetCeiling} - \text{winningBidAmount}$) is unlocked for donor refund.
  - Campaign transitions to `Completed`.
- **`RULE-SETT-05` (Dispute Resolution):**
  - If disputed, the 5 validators vote specifically on the dispute evidence.
  - If $\ge 3$ validators uphold the dispute (fraud verified):
    - Remaining 30% is canceled and credited to the donor refund pool.
    - Vendor's performance bond is slashed.
    - Challenger receives their dispute bond back + reward from slashed bond.
  - If the dispute is dismissed by majority:
    - Vendor receives Stage 2 (30%).
    - Challenger's dispute bond is forfeited and split among validators/vendor.

---

### 2.6. Donor Refund Rules (Pull Pattern)

- **`RULE-REF-01` (Pull-over-Push Security):**
  - To prevent DoS attacks via malicious donor smart contracts that revert on transfer, refunds are **never pushed** automatically.
  - Donors call `claimRefund(campaignId)` to withdraw their entitlement.
- **`RULE-REF-02` (Proportional Calculation):**
  - If 100% of the campaign fails:
    $$\text{refundAmount} = \text{donorContributions}[campaignId][donorAddress]$$
  - If a campaign settles successfully under budget, the donor's proportional share of unspent surplus is:
    $$\text{surplusRefund} = (\text{budgetCeiling} - \text{winningBidAmount}) \times \frac{\text{donorContribution}}{\text{totalDeposited}}$$

---

## 3. Protocol Decisions & Trade-off Matrix

| Decision Area | Options Considered | Recommended MVP Choice | Rationale & Security Implications |
| :--- | :--- | :--- | :--- |
| **Vendor Qualification** | A. Strict KYC/Permissioned Whitelist<br>B. Permissionless with Bid Bond | **Option B: Permissionless + Bid Bond** | Maximizes hackathon demo accessibility. Staking a 5% bond prevents mempool griefing and spam commits. |
| **Validator Consensus** | A. Off-chain Schnorr/BLS aggregate signature<br>B. On-chain multi-tx voting (3/5)<br>C. Single trusted oracle | **Option B: On-chain multi-tx voting** | Simplest, most transparent, and auditable for a hackathon. Clear on-chain events and zero black-box crypto dependencies. |
| **Dispute Escalation** | A. Centralized NGO veto<br>B. Kleros / Aragon Court integration<br>C. Secondary validator dispute vote | **Option C: Secondary validator vote** | Avoids external protocol dependencies while maintaining multi-party consensus and preventing single-actor veto. |
| **Storage Availability Fallback** | A. Strict requirement that IPFS gateway responds<br>B. On-chain CID anchoring with local preview fallback | **Option B: CID on-chain + UI fallback** | Smart contract only cares about the cryptographic string/bytes CID. If public IPFS gateways experience lag, demo remains 100% functional via local cached manifest. |
| **Reversibility of Actions** | A. Reversible staged payments<br>B. Finalized stage 1, reversible stage 2 | **Option B: Final Stage 1, Conditional Stage 2** | Stage 1 (70%) is non-reversible once paid to ensure vendor can cover real physical procurement costs. Stage 2 (30%) acts as the retention safety buffer. |
