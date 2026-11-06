# OpenAid Protocol V2 — Technical & Security Specification

> **Status:** PROPOSED ARCHITECTURAL SPECIFICATION (PRE-IMPLEMENTATION)  
> **Target Contracts:** `contracts/core/OpenAidEscrowV2.sol`, `contracts/registry/ValidatorRegistry.sol`, `contracts/registry/VendorRegistry.sol`  
> **Protocol Version:** 2.0.0-draft  
> **Authors:** Protocol Security Architect, Senior Smart Contract Engineer  
> **Date:** November 2026  

---

## 1. Architectural Overview & Prime Invariants

OpenAid Protocol V2 expands the purpose-bound donor capital allocation engine into a multi-category, fault-tolerant procurement architecture. V2 introduces isolated sub-vaults, ranked backup vendor failover, permissionless validator liveness timeouts with dynamic backup panel slotting, cryptographic vendor qualification attestations, and action-bound World ID recipient feedback.

### The Cardinal Protocol Invariants (Unbreakable Rules)

1. **Absolute Zero Custody:**
   $$\forall \text{ tx}, \quad \text{balance}(\text{NGO}) \cap \text{escrowedFunds} = \emptyset$$
   No administrative address, contract deployer, or NGO campaign creator shall ever possess the capability to unilaterally withdraw, sweep, or redirect deposited tokens.

2. **Sub-Vault Fund Conservation & Non-Interference:**
   $$\sum_{k=1}^{M} \left( \text{AllocatedPayout}_k + \text{UnspentSurplus}_k + \text{RefundableBalance}_k \right) \le \text{TotalEscrowBalance}$$
   No state transition, dispute, default, or refund in Sub-Vault $A$ can decrement, freeze, or alter the balance or payout schedule of Sub-Vault $B$.

3. **Deterministic Staged Settlement:**
   Token disbursement to vendors can only occur under verified conditions:
   - **Stage 1 (70%):** Requires affirmative 3-of-5 quorum from the assigned validator panel upon physical delivery evidence commitment.
   - **Stage 2 (30%):** Requires clean expiration of the timelocked challenge window without an active dispute.

---

## 2. Feature 1: Backup Vendor Award & Automated Failover

### 2.1 State Transitions
When the primary winning vendor ($\text{Vendor}_1$) defaults (due to delivery deadline timeout or verified dispute):
1. $\text{Vendor}_1$'s performance bond is slashed.
2. The sub-vault transitions from `AwaitingDelivery` to `PendingBackupAcceptance` (or `Refunded` if no qualified backup exists).
3. The registered second-best revealed bidder ($\text{Vendor}_2$) is granted a strictly timelocked acceptance window of $T_{\text{accept}} = 48 \text{ hours}$.
4. If $\text{Vendor}_2$ calls `acceptBackupAssignment()` and deposits their performance bond within 48 hours, they become `winningVendor` and a new delivery deadline begins.
5. If $\text{Vendor}_2$ declines, fails to bond, or exceeds 48 hours, the sub-vault transitions to `DeliveryFailed` (triggering proportional donor refund).

### 2.2 Price Spread Formula & Rounding
Let $b_1$ be the winning bid and $b_2$ be the backup bid. The maximum allowable price spread is configured as $\text{MAX\_SPREAD\_BPS} = 1500$ (15.00%).
$$\text{MaxAllowedBid} = b_1 + \frac{b_1 \times \text{MAX\_SPREAD\_BPS}}{\text{BASIS\_POINTS\_DENOMINATOR}}$$
Where $\text{BASIS\_POINTS\_DENOMINATOR} = 10000$. Integer division rounds down (floor), favoring protocol solvency:
$$\text{QualifiesForBackup} \iff b_2 \le \text{MaxAllowedBid} \quad \land \quad b_2 \le \text{SubVault.budgetCeiling}$$

### 2.3 Bond Slashing & Deficit Offset
- $\text{Vendor}_1$'s bond is $5\%$ of $b_1$:
  $$\text{Bond}_1 = \frac{b_1 \times 500}{10000}$$
- If $b_2 > b_1$, a price deficit exists: $\Delta_{\text{deficit}} = b_2 - b_1$.
- $\text{Bond}_1$ is split:
  $$\text{DeficitSubsidy} = \min(\text{Bond}_1, \Delta_{\text{deficit}})$$
  $$\text{RemainingBond} = \text{Bond}_1 - \text{DeficitSubsidy}$$
- $\text{DeficitSubsidy}$ is absorbed into the sub-vault payout allocation to protect donor capital.
- Any $\text{RemainingBond}$ is allocated 50% to the donor refund surplus pool and 50% to the protocol security reserve.

---

## 3. Feature 2: Validator Liveness & Dynamic Replacement

### 3.1 72-Hour Inactivity Timeout Trigger
- The liveness timer begins immediately when evidence is anchored on-chain: `c.evidenceSubmittedAt`.
- If 72 hours elapse and $\text{affirmativeVotes} < 3$ and $\text{negativeVotes} < 3$, any account may permissionlessly call:
  ```solidity
  function triggerValidatorTimeout(uint256 campaignId, uint8 subVaultId) external nonReentrant
  ```

### 3.2 Epoch Tracking & Vote Invalidation Defense
To prevent double-voting or invalidating valid votes already cast:
1. Each sub-vault maintains `validatorEpoch` (initialized to 1).
2. Existing votes cast by honest validators who responded within 72 hours are **retained and permanently recorded**.
3. Inactive validators (where `hasVoted[subVaultId][validator] == false`) are marked as inactive for that sub-vault.
4. Up to 2 backup validators are slotted in from the pre-approved `ValidatorRegistry` backup pool using a deterministic pseudo-random seed:
   $$\text{Seed} = \text{keccak256}(\text{abi.encodePacked}(\text{block.prevrandao}, \text{campaignId}, \text{subVaultId}, \text{epoch}))$$
5. Maximum replacement rounds: $\text{MAX\_REPLACEMENT\_ROUNDS} = 2$.
6. If the backup pool is exhausted or round 2 times out, the sub-vault transitions to `VerificationFailed`, triggering a 100% refund of that sub-vault's funds to donors.

---

## 4. Feature 3: Isolated Sub-Vaults & Allocation Engine

### 4.1 Data Structure & Storage Layout
```solidity
struct SubVault {
    uint8 id;
    bytes32 categoryKey;         // keccak256("FOOD"), keccak256("CLOTHING"), etc.
    uint256 budgetCeiling;      // Maximum allowed USDC
    uint256 totalAllocated;     // Winning bid liability
    uint256 totalDeposited;     // Active donor deposits
    uint256 unspentSurplus;     // budgetCeiling - winningBid
    SubVaultState state;
    address winningVendor;
    address backupVendor;
    uint256 backupBidAmount;
    uint64 backupAcceptanceDeadline;
    uint8 validatorEpoch;
    address[5] activeValidators;
    uint8 affirmativeVotes;
    uint8 negativeVotes;
    bool stage1Paid;
    bool stage2Paid;
    uint64 challengeExpiry;
    bool isDisputed;
}
```

### 4.2 Shared Deposit Allocation
- Donors may deposit directly to a specific `subVaultId`, OR deposit to the `Campaign` root.
- Root deposits are distributed according to the NGO's predefined immutable weight vector:
  $$\text{Allocated}_k = \frac{\text{DepositAmount} \times W_k}{\sum_{j=1}^M W_j}$$
- If a sub-vault reaches its `budgetCeiling`, excess deposits flow to the remaining underfunded sub-vaults. If all sub-vaults are fully funded, the deposit transaction reverts with `CampaignFullyFunded()`.

### 4.3 Independent Settlement & Refund Invariant
- Each sub-vault executes its own 70/30 staged payouts independently.
- If Sub-Vault 1 (Food) succeeds, 100% of its $\$20,000$ allocation settles to its winning vendor.
- If Sub-Vault 2 (Clothing) fails, 100% of its $\$10,000$ allocation is refunded to donors proportionally.
- Cross-vault fund siphoning is mathematically impossible because all transfer functions parameterize both `amount` and internal `subVault.totalDeposited` deductions.

---

## 5. Feature 4: Qualified Vendor Bidding & Anti-Collusion

### 5.1 Minimum 3-Bid Quorum
An auction cannot advance from `BiddingReveal` to `AwaitingDelivery` unless at least 3 distinct, eligible vendors have successfully revealed valid bids:
$$\text{RevealedCount}(\text{subVaultId}) \ge 3$$
If fewer than 3 valid bids are revealed before `revealDeadline`, the sub-vault transitions to `AuctionFailed`. Donors may withdraw their funds or the NGO may reopen bidding.

### 5.2 Cryptographic Qualification Attestation (EIP-712)
Solidity cannot query Arkiv directly. Therefore, vendor qualification is authenticated on-chain via an EIP-712 typed signature from an authorized `VendorRegistrySigner`:

```solidity
struct VendorQualification {
    address vendor;
    bytes32 categoryKey;
    uint256 minTrustScore;       // e.g., 70
    uint256 validUntil;
    uint256 nonce;
}
```

The vendor must present this signature when calling `commitBid()`:
```solidity
bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
    QUALIFICATION_TYPEHASH,
    vendor,
    categoryKey,
    minTrustScore,
    validUntil,
    nonce
)));
address signer = ECDSA.recover(digest, signature);
if (!isAuthorizedSigner[signer]) revert UnauthorizedVendorQualification();
```

---

## 6. Feature 5: Action-Bound World ID Recipient Feedback

### 6.1 Action Binding & Nullifier Integrity
To prevent cross-campaign feedback injection, World ID nullifiers are bound to a unique action digest:
$$\text{ActionId} = \text{keccak256}(\text{abi.encodePacked}(\text{campaignId}, \text{subVaultId}, \text{deliveryManifestCid}))$$
The nullifier hash is tracked per action:
```solidity
mapping(bytes32 => mapping(uint256 => bool)) public hasSubmittedFeedback;
```
If `hasSubmittedFeedback[actionId][nullifierHash] == true`, the submission reverts with `DuplicateFeedback()`.

### 6.2 Separation of Feedback from Escrow Settlement
- Recipient feedback does **NOT** directly release or freeze funds on-chain.
- Feedback is aggregated off-chain and recorded in Arkiv to update the vendor's long-term **Trust Score**.
- Escrow settlement is strictly governed by the 3-of-5 validator quorum and 72-hour timelocked challenge window.
