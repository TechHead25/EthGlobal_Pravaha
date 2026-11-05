# OpenAid Protocol — Formal Security Requirements Specification

## 1. Overview & Security Invariant Mandate

This specification details the mandatory security requirements for all smart contracts in the OpenAid Protocol. Every code contribution, pull request, and automated audit must be evaluated against these explicit requirements.

### The Core Escrow Solvency Invariant
At all times $t$, the contract balance of `EscrowSettlement` must satisfy:
$$\text{IERC20.balanceOf}(\text{address}(\text{EscrowSettlement})) \ge \sum_{c \in \text{Campaigns}} \left( \text{ActiveEscrow}_c + \text{UnclaimedSurplus}_c + \text{UnclaimedRefunds}_c \right)$$

---

## 2. Security Requirements Matrix

### 2.1. Authorization & Role Separation
- **`SEC-001` (Zero Administrative Custody):**
  - Smart contracts must not implement any arbitrary fund sweeping, owner rescue, or admin withdrawal functions.
  - No role (including deployer, contract owner, or NGO campaign creator) shall have authority to alter the recipient of escrowed funds.
- **`SEC-002` (Explicit Inter-Contract Authorization):**
  - Restricted external functions (e.g. `executeStage1Settlement`, `lockDispute`) must restrict callers strictly to the authorized deployed contract addresses (e.g., `ValidatorRegistry`). Calls from unauthorized addresses must revert with `error UnauthorizedCaller()`.
- **`SEC-003` (Vendor Commitment Binding):**
  - Evidence submission can only be performed by the recorded `winningVendor` for that campaign:
    ```solidity
    if (msg.sender != campaign.winningVendor) revert Unauthorized();
    ```

### 2.2. Reentrancy & Execution Ordering
- **`SEC-004` (Checks-Effects-Interactions):**
  - In all state-changing functions, contract state variables (mappings, balances, booleans, enums) must be updated *before* any external message calls or token transfers are initiated.
- **`SEC-005` (Reentrancy Guard Enforcement):**
  - Every external function that performs token transfers or cross-contract state updates must be guarded with OpenZeppelin's `nonReentrant` modifier.

### 2.3. Token-Handling Assumptions & Standards
- **`SEC-006` (SafeERC20 Adoption):**
  - All token interactions (`transfer`, `transferFrom`, `approve`) must use OpenZeppelin's `SafeERC20` wrapper to safely handle non-standard ERC-20 tokens (e.g., tokens that do not return a boolean on success, like USDT).
- **`SEC-007` (Balance Delta Accounting):**
  - To defend against fee-on-transfer tokens or deflationary mechanics, escrow accounting must verify the actual balance received:
    ```solidity
    uint256 balanceBefore = token.balanceOf(address(this));
    token.safeTransferFrom(msg.sender, address(this), amount);
    uint256 actualReceived = token.balanceOf(address(this)) - balanceBefore;
    ```
- **`SEC-008` (Decimals Normalization):**
  - The protocol must support standard 6-decimal stablecoins (e.g. USDC, USDT) and 18-decimal stablecoins (e.g. DAI). All percentage calculations must use basis points (10,000 = 100%) or standard integer division with rounding down in favor of escrow preservation.

### 2.4. Auction Cryptographic Integrity
- **`SEC-009` (Commitment Binding & Anti-Frontrunning):**
  - The commit hash must explicitly incorporate the sender's address:
    $$\text{commitment} = \text{keccak256}(\text{abi.encodePacked}(\text{bidAmount}, \text{salt}, \text{msg.sender}))$$
  - The reveal function must fail if `msg.sender` does not match the original committer address.
- **`SEC-010` (Collateral Slashing on Non-Reveal):**
  - Committing a bid requires transferring a mandatory `bidBond` into escrow. If a vendor fails to call `revealBid` before the reveal deadline, their bond is irrevocably forfeited and credited to the campaign pool.

### 2.5. Validator Quorum & Voting Integrity
- **`SEC-011` (Double-Voting Immunity):**
  - The contract must track validator participation per campaign using a persistent storage mapping (`hasVoted[campaignId][validatorAddress]`).
  - Attempting to submit a second vote from the same address must revert immediately with `error AlreadyVoted()`.
- **`SEC-012` (Quorum Threshold Strictness):**
  - Stage 1 settlement can only execute when affirmative votes reach or exceed the defined threshold (e.g. $\ge 3$ out of 5).
  - Negative votes (`REJECT`) must be tracked independently; reaching 3 negative votes must terminate verification and trigger a refund state.

### 2.6. Settlement Protection & Double-Spend Prevention
- **`SEC-013` (Double Settlement Defense):**
  - Staged disbursements must be guarded by dedicated booleans or packed bit flags:
    ```solidity
    if (escrow.stage1Paid) revert Stage1AlreadyPaid();
    escrow.stage1Paid = true;
    ```
  - Stage 2 settlement must verify `stage1Paid == true`, `stage2Paid == false`, `block.timestamp > challengeExpiry`, and `!isDisputed`.
- **`SEC-014` (Pull-over-Push Refund Isolation):**
  - Donor refunds must never be executed via batch iterations over an array of addresses.
  - Each donor must pull their own refund via `claimRefund(campaignId)`. An external call failure or malicious revert from one donor cannot obstruct refunds for other donors.

### 2.7. Failure Safety & Timeouts
- **`SEC-015` (Predictable Deterministic Timeouts):**
  - Every time-sensitive phase (`FundingActive`, `BiddingCommit`, `BiddingReveal`, `AwaitingDelivery`, `InChallengePeriod`) must possess an explicit timestamp comparison check.
  - If a timeout occurs, any caller must be able to trigger the appropriate failure transition (`FundingFailed`, `AuctionFailed`, `DeliveryFailed`), ensuring funds are never frozen indefinitely.
