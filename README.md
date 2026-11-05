# OpenAid Protocol

[![CI](https://github.com/TechHead25/EthGlobal_Pravaha/actions/workflows/ci.yml/badge.svg)](https://github.com/TechHead25/EthGlobal_Pravaha/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity: ^0.8.24](https://img.shields.io/badge/Solidity-^0.8.24-blue.svg)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-yellowgreen.svg)](https://hardhat.org/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2014-black.svg)](https://nextjs.org/)

> **A decentralized charitable procurement and staged settlement protocol separating custody, procurement, verification, and settlement to eliminate single points of trust in humanitarian aid.**

---

## 1. Executive Overview

Traditional humanitarian and charitable aid systems suffer from severe opacity, high administrative overhead, and the constant risk of fund misappropriation. In typical setups, non-governmental organizations (NGOs) or charitable entities maintain unilateral custody over donated capital, allowing bad actors or compromised accounts to siphon or misallocate donations with minimal auditability.

**OpenAid Protocol** re-architects disaster relief and charitable procurement as a trust-minimized, multi-actor state machine deployed on EVM-compatible blockchains. It enforces a strict separation of powers between:
- **Donors:** Provide purpose-bound capital locked directly in smart contract escrow.
- **NGOs / Campaign Creators:** Define relief specifications, budget ceilings, and delivery criteria without touching custody of funds.
- **Vendors / Suppliers:** Compete via sealed commit–reveal auctions to supply relief goods at verified market rates.
- **Independent Validators:** Verify physical evidence manifests off-chain and attest on-chain via quorum consensus.

### The Cardinal Rule
**No participant—not even the campaign creator or protocol deployer—can unilaterally withdraw or redirect campaign funds to an arbitrary address.** Escrowed capital is programmatically locked and can only flow directly to a winning vendor following verified delivery and challenge clearance, or return to original donors if requirements fail.

---

## 2. Core Protocol Workflow

```
[ Donors ] -- (1. Fund Campaign) --> [ Escrow Vault ]
                                            |
[ NGO ] ---- (2. Create Campaign & RFP) --->|
                                            v
[ Vendors ] - (3. Commit/Reveal Bids) -> [ Lowest Valid Bid Selected ]
                                            |
[ Vendor ] -- (4. Ship Goods & Submit IPFS Manifest)
                                            |
[ Validators (3/5 Quorum) ] - (5. Review Evidence & Cast Attestation Vote)
                                            |
                                  [ Quorum Reached? ]
                                   /               \
                             YES  /                 \ NO / Timeout
                                 v                   v
            [ Stage 1: 70% Immediate Release ]   [ 100% Refund to Donors ]
                                 |
                     [ 72h Challenge Window ]
                      /                    \
              No Dispute                  Disputed / Upheld
                  v                              v
   [ Stage 2: 30% Final Release ]        [ 30% Refund to Donors / Vendor Penalized ]
```

1. **Campaign Creation & Direct Escrow Funding:** An NGO creates a campaign defining supply requirements, budget ceiling, delivery location, and deadlines. Donors deposit ERC-20 tokens directly into the immutable escrow contract.
2. **Commit–Reveal Procurement Auction:** Qualified vendors submit cryptographic bid commitments (`hash(price, salt, vendorAddress)`), followed by a reveal phase. The protocol selects the lowest valid revealed bid and locks the winning vendor.
3. **Delivery Evidence Submission:** The winning vendor fulfills the physical delivery and uploads tamper-evident multi-angle photo, GPS, and bill-of-lading evidence manifests to IPFS, committing the root IPFS CID to the contract.
4. **Independent Quorum Attestation:** A decentralized validator set (initially 3-of-5 threshold) inspects evidence off-chain and casts on-chain verification votes.
5. **Staged Settlement & Challenge Window:**
   - **Tranche 1 (70%):** Released immediately to the vendor upon 3-of-5 quorum attestation.
   - **Challenge Period:** A timelock window opens during which any participant may challenge delivery claims with counter-evidence.
   - **Tranche 2 (30%):** Automatically released to the vendor upon challenge period expiry without an active, upheld dispute. If a dispute is substantiated, the remaining funds revert to donors.

---

## 3. Technology Stack

- **Smart Contracts:** Solidity (`^0.8.24`), OpenZeppelin Contracts v5.x (`SafeERC20`, `ReentrancyGuard`, `ECDSA`).
- **Development & Testing:** Hardhat, TypeScript, Ethers.js v6 / Viem.
- **Frontend Application:** Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide Icons.
- **Wallet & Chain Interaction:** Wagmi, Viem, RainbowKit (EVM compatible).
- **Decentralized Storage:** IPFS (via Pinata / Web3.Storage) for content-addressed evidence manifests.
- **CI / CD Automation:** GitHub Actions.

---

## 4. Current Status & Implementation Roadmap

| Milestone | Scope | Status |
| :--- | :--- | :--- |
| **M0: Pre-Development Foundation** | Architecture, PRD, threat modeling, state machine specs, interfaces, agent rules | **Complete** |
| **M1: Core Smart Contracts** | `EscrowSettlement`, `CampaignRegistry`, `ProcurementAuction`, `ValidatorRegistry` | In Progress |
| **M2: Contract Test Suite** | Hardhat unit, integration, invariant, and adversarial negative tests | Pending M1 |
| **M3: Frontend & Web3 Integration** | Next.js role-based portal (Donor, NGO, Vendor, Validator dashboards) | Pending M1 |
| **M4: Storage & Evidence Pipeline** | IPFS hashing, manifest serialization, metadata pinning | Pending M3 |
| **M5: End-to-End Demo & Verification** | Local testnet scripted run, edge-case failure demonstrations | Final Stage |

---

## 5. Repository Documentation Index

All technical, security, and operational documentation is maintained under [`docs/`](./docs/):

- [`docs/PROJECT_BRIEF.md`](./docs/PROJECT_BRIEF.md) — High-level vision, problem statement, target audiences, and core value proposition.
- [`docs/PRD.md`](./docs/PRD.md) — Product Requirements Document: functional/non-functional specs, user stories, acceptance criteria (`FR-xxx`, `NFR-xxx`).
- [`docs/SUCCESS_CRITERIA.md`](./docs/SUCCESS_CRITERIA.md) — Measurable hackathon demo acceptance conditions and demo rubric alignment.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — System architecture, component boundaries, trust topology, and Mermaid sequence flows.
- [`docs/PROTOCOL_RULES.md`](./docs/PROTOCOL_RULES.md) — Exhaustive protocol rules for funding, bidding, quorum attestation, settlement tranches, and timeouts.
- [`docs/STATE_MACHINE.md`](./docs/STATE_MACHINE.md) — Formal campaign lifecycle state transitions, authorized actors, guards, events, and failure paths.
- [`docs/CONTRACT_INTERFACES.md`](./docs/CONTRACT_INTERFACES.md) — Proposed Solidity interfaces (`IOpenAidEscrow`, `IProcurementAuction`, etc.), structs, and custom errors.
- [`docs/DATA_AND_EVENTS.md`](./docs/DATA_AND_EVENTS.md) — On-chain state schemas, event definitions, IPFS evidence manifest JSON schemas, and indexing models.
- [`docs/THREAT_MODEL.md`](./docs/THREAT_MODEL.md) — Threat matrix, attacker profiles, trust assumptions, attack vectors, and protocol-level mitigations.
- [`docs/SECURITY_REQUIREMENTS.md`](./docs/SECURITY_REQUIREMENTS.md) — Cryptographic and smart contract security requirements (`SEC-xxx`), reentrancy, and escrow invariant protections.
- [`docs/TEST_STRATEGY.md`](./docs/TEST_STRATEGY.md) — Comprehensive multi-tier test strategy covering unit, integration, invariant, and negative attack tests.
- [`docs/RISKS_AND_ASSUMPTIONS.md`](./docs/RISKS_AND_ASSUMPTIONS.md) — Open trade-offs, trust assumptions, physical-world verification limitations, and fallback mechanics.
- [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) — Granular implementation phases, task breakdown, dependencies, and Definition of Done.
- [`docs/TEAM_WORKFLOW.md`](./docs/TEAM_WORKFLOW.md) — 5-person engineering team ownership matrix, GitHub branch strategy, PR reviews, and conflict handling.
- [`docs/DEMO_SCRIPT.md`](./docs/DEMO_SCRIPT.md) — Deterministic, reproducible hackathon live demo script highlighting happy paths and failure recoveries.
- [`AGENTS.md`](./AGENTS.md) — Mandatory operational constraints and instructions for AI agents working in this repository.

---

## 6. Prerequisites & Local Setup

### Prerequisites
- **Node.js:** `v20.x` or higher
- **Package Manager:** `npm` (v10+)
- **Git:** `v2.40+`

### Environment Configuration
1. Clone the repository:
   ```bash
   git clone https://github.com/TechHead25/EthGlobal_Pravaha.git
   cd EthGlobal_Pravaha
   ```
2. Copy the sample environment file:
   ```bash
   cp .env.example .env.local
   ```
3. Update `.env.local` with local development or testnet parameters.

### Build and Test Execution (Post M1)
When contract and frontend packages are initialized:
```bash
# Compile contracts
npx hardhat compile

# Run complete test suite
npx hardhat test

# Run local Hardhat node
npx hardhat node

# Run frontend development server
npm run dev
```

---

## 7. License

OpenAid Protocol is open-source software licensed under the [MIT License](./LICENSE).
