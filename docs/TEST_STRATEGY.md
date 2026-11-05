# OpenAid Protocol — Comprehensive Test Strategy & Verification Plan

## 1. Testing Philosophy & Test Pyramid

The OpenAid test strategy is designed to provide high mathematical assurance of protocol safety, escrow solvency, and state machine correctness within a fast-paced hackathon schedule.

```
                  / \
                 / E2E \       <-- Scripted Demo & Web3 UI Integration (Member 5 & 4)
                /-------\
               / Adversarial \  <-- Exploit vectors, double-spend, reentrancy (Member 5)
              /---------------\
             /   Integration   \ <-- Full Campaign Lifecycle across contracts (Member 1, 2, 3)
            /-------------------\
           /     Unit Tests      \ <-- Individual function, error & guard checks (All Members)
          /-----------------------\
```

---

## 2. Test Suites & Coverage Requirements

### 2.1. Unit Test Matrix (`test/unit/`)

| Test Suite | Target Contract | Key Test Cases & Coverage Criteria |
| :--- | :--- | :--- |
| `CampaignRegistry.test.ts` | `CampaignRegistry.sol` | - Campaign creation with valid parameters succeeds and emits `CampaignCreated`.<br>- Creation with zero budget ceiling reverts with `InvalidBudget()`.<br>- State update by unauthorized caller reverts with `Unauthorized()`.<br>- Status transitions follow defined state machine. |
| `EscrowSettlement.test.ts` | `EscrowSettlement.sol` | - Single and multi-donor deposits credit balances accurately.<br>- Deposits beyond `budgetCeiling` revert with `BudgetCeilingExceeded()`.<br>- Unauthorized call to `executeStage1Settlement` reverts with `UnauthorizedCaller()`.<br>- Proportional refund calculation is mathematically exact.<br>- Reentrancy attempt via malicious token or recipient reverts with `ReentrancyGuardReentrantCall()`. |
| `ProcurementAuction.test.ts`| `ProcurementAuction.sol`| - Vendor commits valid hash with bond; commitment stored accurately.<br>- Reveal with valid salt and amount succeeds and emits `BidRevealed`.<br>- Reveal with altered amount or wrong salt reverts with `InvalidCommitHash()`.<br>- Front-runner attempting to reveal identical hash from different address reverts.<br>- Lowest revealed bid selected as winner on finalization.<br>- Tie-breaking selects earliest revealed bid.<br>- Non-revealing vendor loses bid bond. |
| `ValidatorRegistry.test.ts` | `ValidatorRegistry.sol` | - Authorized validator can cast vote; emits `VoteCast`.<br>- Unauthorized address attempting to vote reverts with `NotAnAuthorizedValidator()`.<br>- Validator attempting to vote twice reverts with `AlreadyVoted()`.<br>- Quorum triggers exactly on the 3rd affirmative vote.<br>- Dispute filing with bond sets `isDisputed = true`. |

---

## 3. End-to-End Integration Tests (`test/integration/`)

### 3.1. `LifecycleHappyPath.test.ts`
- **Objective:** Verify seamless progression from campaign creation to final completion.
- **Sequence:**
  1. NGO deploys campaign for 10,000 USDC.
  2. Donor A deposits 6,000 USDC; Donor B deposits 4,000 USDC.
  3. Auction opens: Vendor Alpha bids 9,200 USDC; Vendor Beta bids 8,500 USDC.
  4. Both reveal: Vendor Beta wins at 8,500 USDC.
  5. Vendor Beta submits delivery evidence IPFS CID.
  6. Validators 1, 2, 3 vote `APPROVE`.
  7. Stage 1 executes: Vendor Beta receives 5,950 USDC (70%).
  8. Challenge period (120s / simulated time) passes with zero disputes.
  9. Final settlement executes: Vendor Beta receives 2,550 USDC (30%) + bond.
  10. Donors A and B claim surplus refunds from remaining 1,500 USDC proportional to deposits ($60\% \times 1,500 = 900$; $40\% \times 1,500 = 600$).

### 3.2. `DeliveryTimeoutRefund.test.ts`
- **Objective:** Verify 100% capital recovery when a vendor defaults.
- **Sequence:**
  1. Campaign funded and auction won by Vendor Alpha.
  2. Block time advanced beyond `deliveryDeadline` without evidence submission.
  3. Timeout triggered -> Campaign state transitions to `DeliveryFailed`.
  4. Donor A calls `claimRefund()` -> Receives exact 6,000 USDC.
  5. Donor B calls `claimRefund()` -> Receives exact 4,000 USDC.
  6. Escrow balance reaches zero.

---

## 4. Adversarial & Negative Security Tests (`test/adversarial/`)

| Attack Vector | Test File | Implemented Scenario | Expected Assertions |
| :--- | :--- | :--- | :--- |
| **NGO Fund Theft** | `AdversarialEscrow.test.ts` | NGO attempts to call `executeStage1Settlement` or arbitrary transfer to personal wallet. | Transaction reverts with `UnauthorizedCaller()`; escrow balance unchanged. |
| **Validator Double-Vote** | `AdversarialVoting.test.ts` | Validator 1 calls `castVote(campaignId, true)` twice. | First call succeeds; second call reverts with `AlreadyVoted()`. Affirmative vote count remains 1. |
| **Premature Stage 2 Withdrawal** | `AdversarialSettlement.test.ts` | Vendor calls `finalizeSettlement()` while challenge window is still active (`block.timestamp < challengeExpiry`). | Transaction reverts with `ChallengePeriodNotExpired()`. |
| **Reentrancy Exploitation** | `ReentrancyAttack.test.ts` | Malicious contract calls `claimRefund()` and triggers recursive re-entry in its fallback function. | Second call reverts via `nonReentrant`; attacker receives only their legitimate balance. |
| **Front-Running Commit Steal** | `AuctionAdversarial.test.ts` | Attacker observes vendor's commitment hash in mempool and submits it from their own account. | Attacker's subsequent reveal fails with `InvalidCommitHash()`; attacker bond is slashed. |

---

## 5. Invariant & Fuzz Properties

Using Hardhat or property-based checks:

1. **Invariant 1 (Solvency):**  
   At every state transition, `MockUSDC.balanceOf(EscrowSettlement) == sum(activeCampaignEscrows) + sum(unclaimedRefunds)`.
2. **Invariant 2 (Monotonic Payouts):**  
   For any campaign $c$, `stage1Disbursed <= 0.70 * winningBid` and `stage2Disbursed <= 0.30 * winningBid`.
3. **Invariant 3 (Terminal States):**  
   Once a campaign enters `Completed` or `Refunded`, its state cannot transition to any other value.

---

## 6. Test Execution Commands & Acceptance Standards

```bash
# Execute complete Hardhat test suite
npx hardhat test

# Execute with gas reporting
REPORT_GAS=true npx hardhat test

# Execute code coverage audit
npx hardhat coverage
```

### Acceptance Standard for Milestone M2
- 100% of unit, integration, and adversarial tests must pass cleanly.
- Zero uncaught exceptions or unhandled promise rejections.
- Test suite execution time under 30 seconds for rapid developer feedback.
