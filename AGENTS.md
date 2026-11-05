# OpenAid Protocol — Mandatory Coding Agent Instructions

> **Notice to AI Coding Agents (Antigravity and Peer LLMs):**  
> This file establishes immutable operational boundaries, security guidelines, architectural invariants, and workflow mandates for all automated or human-agent pair programming tasks in this repository. Read and strictly adhere to these instructions before executing commands or modifying code.

---

## 1. Project Overview & Prime Invariants

OpenAid Protocol is a decentralized charitable procurement and staged settlement protocol. Its core design objective is to eliminate single points of trust in humanitarian aid by strictly separating control among **Donors**, **NGOs / Campaign Creators**, **Vendors / Suppliers**, and **Independent Delivery Validators**.

### The Cardinal Protocol Invariant
> **No single participant—including the NGO campaign creator, the protocol deployer, or any administrative role—shall ever possess the capability to unilaterally withdraw, sweep, redirect, or siphon escrowed funds to an arbitrary address.**

Escrowed donor funds can only leave the protocol escrow under two strictly enforced, mutually exclusive conditions:
1. **Verified Staged Settlement:** Payout is released directly to the **winning vendor** who submitted the lowest valid revealed bid and whose physical delivery manifest was verified by an on-chain validator quorum (70% upon quorum attestation + 30% upon expiry of the challenge period without valid dispute).
2. **Deterministic Donor Refund:** Payout is returned proportionally to **original donors** via a pull-over-push withdrawal mechanism if a campaign fails to fund, auction reveal fails, no vendor bids, delivery times out, or a challenge is upheld.

---

## 2. Scope Boundaries

### What Agents MAY Do
- Write, refactor, and optimize Solidity contracts strictly complying with the architecture defined in `docs/ARCHITECTURE.md` and `docs/PROTOCOL_RULES.md`.
- Implement TypeScript test suites (unit, integration, state invariant, adversarial) using Hardhat.
- Implement the Next.js frontend, React hooks, and wallet connector components.
- Maintain and update documentation in `docs/` to mirror verified code realities.
- Run local compilation, linting, and testing commands (`npx hardhat compile`, `npx hardhat test`, `npm run lint`, `npm run build`).
- Create and manage feature branches following the defined Git conventions.

### What Agents MUST NEVER Do
- **NEVER** introduce arbitrary fund withdrawal backdoors (e.g., `emergencyWithdraw()`, owner rescue functions, unconstrained sweeping functions).
- **NEVER** commit, display, or stage secrets, private keys, mnemonic phrases, or real `.env` files.
- **NEVER** use destructive Git commands (`git reset --hard`, `git clean -fd`, `git push --force`).
- **NEVER** invent mock test results or claim a test or build succeeded without actually executing the command and observing the output.
- **NEVER** introduce Foundry, alternate Solidity frameworks, or heavy extraneous backend microservices outside the agreed stack (Hardhat + TypeScript + Next.js + IPFS).
- **NEVER** bypass access controls, permission checks, or sanitize failure tests by commenting out assertions.
- **NEVER** push directly to the remote repository without explicit user instruction.

---

## 3. Smart Contract Engineering & Security Rules

All smart contract code must adhere to senior-level Ethereum application security standards:

1. **Solidity Version & Tooling:**
   - Use Solidity `^0.8.24` (or latest stable compatible with Hardhat).
   - Use explicit OpenZeppelin Contracts v5.x for audited base primitives (`ReentrancyGuard`, `SafeERC20`, `IERC20`, `ECDSA`).
2. **Checks-Effects-Interactions (CEI):**
   - Strictly update internal state (balances, flags, states, mappings) *before* invoking external calls or transferring tokens.
   - Guard all state-changing external functions with `nonReentrant`.
3. **Token Handling Assurances:**
   - Always use `SafeERC20` (`safeTransfer`, `safeTransferFrom`).
   - Explicitly support standard ERC-20 tokens (e.g. Mock USDC, DAI with 6 or 18 decimals).
   - Assume tokens may have transfer fees or balance changes; calculate escrow balances by checking actual balance delta where appropriate.
4. **Custom Errors:**
   - Use custom errors (e.g. `error Unauthorized()`, `error InvalidState(uint8 current, uint8 expected)`) instead of string revert messages to minimize deployment and runtime gas.
5. **Commit–Reveal Auction Integrity:**
   - Commit phase: Vendors submit `keccak256(abi.encodePacked(bidAmount, salt, vendorAddress))`.
   - Reveal phase: Vendors submit `bidAmount` and `salt`. Verify hash matches commit and that `bidAmount <= campaignBudget`.
   - Prevent vendor address spoofing by binding `msg.sender` into the commit hash.
6. **Validator Quorum Enforcement:**
   - 3-of-5 threshold signature or distinct multi-account on-chain voting.
   - Prevent double voting via persistent bitmasks or mapping `hasVoted[campaignId][validatorAddress]`.
   - Prevent validator collision by verifying validator registration against an immutable or governed `ValidatorRegistry`.
7. **Time Manipulation Defense:**
   - Never use `block.timestamp` for short-duration randomness or sub-minute precision.
   - Use timestamps only for coarse time boundaries (auction deadline, challenge window). Clearly document demo acceleration parameters versus production parameters.

---

## 4. Testing & Verification Expectations

Every pull request or contract implementation must be accompanied by comprehensive tests:

1. **Unit Tests:** Test every external and public function in isolation. Verify that unauthorized actors cannot trigger restricted transitions.
2. **Adversarial / Negative Tests:** Every state transition must have explicit tests verifying it reverts with the expected custom error under invalid states, invalid inputs, unauthorized callers, or expired deadlines.
3. **State Invariant Tests:**
   - Invariant A: Total token balance of `EscrowSettlement` must always equal sum of active campaign escrows + unclaimed vendor payouts + unclaimed donor refunds.
   - Invariant B: Once a campaign enters `Settled` or `Refunded`, no further funds can be extracted from that campaign's escrow.
4. **Determinism:** Hardhat test suites must pass cleanly without network connectivity or external RPC dependencies.

---

## 5. Git Workflow & Branch Conventions

- **Default / Base Branch:** `main`
- **Branch Naming Scheme:**
  - `feat/<feature-name>` (e.g. `feat/commit-reveal-auction`)
  - `fix/<issue-name>` (e.g. `fix/quorum-tiebreak`)
  - `docs/<doc-name>` (e.g. `docs/protocol-rules`)
  - `test/<test-suite>` (e.g. `test/settlement-invariants`)
- **Commit Message Format:**
  Follow Conventional Commits:
  - `feat: implement commit-reveal bidding in ProcurementAuction.sol`
  - `test: add adversarial tests for double-voting in ValidatorRegistry`
  - `docs: update state machine diagram for challenge timeouts`
  - `fix: correct balance delta accounting in EscrowSettlement.sol`
- **Staging Rules:**
  - Always run `git status` and `git diff --check` prior to staging.
  - Stage specific modified paths explicitly (`git add path/to/file`).
  - Never run blanket `git add .` or `git add -A` without checking untracked files.

---

## 6. Agent Reporting Format

When completing a task, responding to queries, or delivering code, format your output with the following standard structure:

```markdown
### 1. Executive Summary
[Brief 2-3 sentence overview of actions taken and objectives achieved]

### 2. Files Modified / Created
- [`path/to/file1.ext`](file:///c:/Projects/EthGLobal/path/to/file1.ext) — [Brief description]
- [`path/to/file2.ext`](file:///c:/Projects/EthGLobal/path/to/file2.ext) — [Brief description]

### 3. Key Architectural / Protocol Decisions
- [Decision 1 and rationale]
- [Decision 2 and rationale]

### 4. Verification & Validation Evidence
[Exact shell commands run, exit codes, and output snippets proving correctness]

### 5. Identified Blockers & Unresolved Questions
- [Any blocking questions requiring human stakeholder decision]

### 6. Recommended Next Steps
- [Immediate follow-up actions for the next development milestone]
```
