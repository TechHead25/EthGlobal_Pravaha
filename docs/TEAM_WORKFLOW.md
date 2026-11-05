# OpenAid Protocol — Team Workflow & Engineering Collaboration Model

## 1. Overview & Collaboration Principles

This document formalizes the engineering workflow for a 5-person development team building OpenAid Protocol for the ETHGlobal hackathon. It guarantees accountability, parallel execution without git collisions, disciplined security reviews, and genuine individual contributions under separate GitHub identities.

### Core Principles
1. **Single Accountable Owner per Issue:** Every task or feature must have exactly one primary owner responsible for its specification, execution, and test verification.
2. **Small, Reviewable Pull Requests:** Keep PRs under 400 lines of diff where possible. No giant monolithic PRs on the last day.
3. **Strict Interface Contracts:** Smart contract boundaries and interfaces must be defined and frozen before frontend and integration test construction begin.
4. **Authentic Individual Git Commits:** Every contributor commits using their own configured Git identity. No shared generic accounts or fabricated authorship.
5. **No Direct Commits to `main`:** Once team development begins, `main` is protected. All additions land via reviewed PRs that pass CI checks.

---

## 2. Five-Person Functional Domain Ownership

| Role Identifier | Functional Domain | Primary Responsibilities | Target Deliverables |
| :--- | :--- | :--- | :--- |
| **Member 1 (Arch & Treasury)** | **Protocol Architecture, Escrow Vault & System Integration** | Core protocol architecture, `EscrowSettlement.sol`, `CampaignRegistry.sol`, token custody, donor accounting, proportional refund accounting, overall contract integration. | Escrow and registry contracts, deploy scripts, system orchestration. |
| **Member 2 (Procurement)** | **Procurement Auction & Bidding Mechanics** | `ProcurementAuction.sol`, commit–reveal state transitions, cryptographic bid hashing, collateral/bond staking, tie-breaking, winner determination. | Auction contract, commit-reveal unit test suite, gas optimization for bidding. |
| **Member 3 (Settlement)** | **Delivery Verification, Quorum & Dispute Settlement** | `ValidatorRegistry.sol`, multi-validator quorum logic (3-of-5), Stage 1 (70%) release, timelock challenge window, Stage 2 (30%) finalization, dispute penalty slashes. | Validator registry, quorum voting contracts, settlement state machine logic. |
| **Member 4 (Frontend)** | **Frontend Application & Web3 Integration** | Next.js 14 App Router, RainbowKit/Wagmi wallet connection, multi-role dashboard (Donor, NGO, Vendor, Validator), IPFS upload client, real-time status updates. | Responsive Web3 UI, role switcher, IPFS manifest creation form, contract call hooks. |
| **Member 5 (QA & CI)** | **Integration Testing, Test Harness & Demo Reliability** | Hardhat end-to-end integration test suite, negative/adversarial exploit tests, CI pipeline maintenance, mock ERC-20 token, deterministic hackathon demo automation script. | E2E integration test suite, invariant tests, GitHub Actions CI, live demo test runner. |

---

## 3. GitHub Issues & Lifecycle Management

1. **Issue Creation:** Every task is logged as a GitHub Issue using standard labels:
   - `domain:core-contracts`
   - `domain:auction`
   - `domain:settlement`
   - `domain:frontend`
   - `domain:qa-testing`
   - `type:feature`, `type:bug`, `type:security`, `type:docs`
2. **Issue Assignment:** Exactly one team member assigns themselves to the issue before starting work.
3. **Definition of Ready (DoR):** An issue can only be worked on if its contract interface, state transitions, or UI wireframe is documented in `docs/`.

---

## 4. Git Branch Strategy & Commit Guidelines

```
main (Protected)
  ^
  |-- PR (Reviewed & CI Passed)
  |
  +-- feat/commit-reveal-auction (Member 2)
  +-- feat/escrow-vault (Member 1)
  +-- feat/validator-quorum (Member 3)
  +-- feat/role-frontend (Member 4)
  +-- feat/e2e-adversarial-tests (Member 5)
```

### Branch Naming Conventions
- `feat/<short-descriptor>` (e.g. `feat/escrow-vault`)
- `fix/<short-descriptor>` (e.g. `fix/quorum-math`)
- `test/<short-descriptor>` (e.g. `test/adversarial-double-vote`)
- `docs/<short-descriptor>` (e.g. `docs/protocol-rules-update`)

### Commit Hygiene
- Configure your local Git identity before committing:
  ```bash
  git config user.name "Your Name"
  git config user.email "your.email@example.com"
  ```
- Use Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Stage explicit files: `git add contracts/EscrowSettlement.sol test/Escrow.test.ts`.
- **Never** commit `.env`, private keys, build artifacts (`artifacts/`, `.next/`), or uninspected files.

---

## 5. Pull Request & Code Review Protocol

1. **PR Creation:** Open a PR targeting `main` using the repository PR template (`.github/pull_request_template.md`).
2. **Required Validation:**
   - Attach CLI evidence of local tests passing (`npx hardhat test`).
   - Confirm zero secret leaks.
3. **Review Requirements:**
   - **Smart contract changes** require review from at least one other smart contract engineer (e.g., Member 1, 2, or 3).
   - **Security checklist:** Reentrancy guard present, Checks-Effects-Interactions followed, token math checked, events emitted.
4. **Merging Strategy:** Squash and merge (or rebase merge) to maintain a clean linear commit history on `main`.

---

## 6. Merge Conflict Resolution Protocol

1. If your branch diverges from `main`:
   ```bash
   git fetch origin
   git checkout feat/your-feature
   git merge origin/main
   # Or git rebase origin/main
   ```
2. In case of Solidity contract interface conflicts:
   - The contract author and integrator must resolve the signature alignment in direct conversation before committing the resolution.
   - Re-run full test suite (`npx hardhat test`) immediately after resolving conflicts.

---

## 7. Hackathon Cadence & Synchronizations

- **Daily Standup (10 mins):** What did you finish? What are you building today? Any blockers or interface changes?
- **Integration Freeze (6 hours before submission):** No new features. Only bug fixes, documentation polish, frontend styling, and demo rehearsals.
- **Demo Dry Run (3 hours before submission):** Full team rehearsal of the live demo script using the deployed testnet/local environment.
