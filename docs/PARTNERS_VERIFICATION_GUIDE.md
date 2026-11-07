# OpenAid Protocol — Hackathon Partners Verification Guide

> **ETHGlobal Mumbai — Official Sponsor & Partner Judging Reference**  
> This guide provides hackathon judges and partner evaluators with direct pointers to the code, live deployments, test suites, and documentation required for verifying our integrations across **Arkiv**, **Arc (Circle)**, **Chainlink CRE**, and **World ID**.

---

## Quick Navigation for Judges

| Partner Track | Key Verification Directory / File | Live Network / Contract | Test Command |
| :--- | :--- | :--- | :--- |
| **Arkiv Network** | [`/arkiv/`](../arkiv/) & [`docs/ARKIV_INTEGRATION_GUIDE.md`](./ARKIV_INTEGRATION_GUIDE.md) | **Rabdi Testnet** (Chain ID: `7794095`) | `npm run test:arkiv` |
| **Arc (Circle)** | [`contracts/core/OpenAidEscrow.sol`](../contracts/core/OpenAidEscrow.sol) & [`docs/ARC_SECURITY_AUDIT.md`](./ARC_SECURITY_AUDIT.md) | **Arc Testnet** (`0xe381...d236`) | `npm run test:arc` |
| **Chainlink CRE** | [`/chainlink-cre/`](../chainlink-cre/) & [`docs/CHAINLINK_CRE_INTEGRATION_GUIDE.md`](./CHAINLINK_CRE_INTEGRATION_GUIDE.md) | Multi-Node DON Simulation & CRE SDK | `npm run test:cre` |
| **World ID** | [`src/lib/worldid/`](../src/lib/worldid/) & [`docs/WORLD_ID_INTEGRATION_GUIDE.md`](./WORLD_ID_INTEGRATION_GUIDE.md) | World IDKit v1.3 ZK Verifier | `npm run test:worldid` |

---

## 1. Arkiv Network Judging Verification

> **Track Focus:** *"Mirror something Ethereum depends on"* / *"Build on Arkiv"* ($15,000 Prize Pool)  
> **Target Subfolder:** Evaluators should inspect the root **[`/arkiv/`](../arkiv/)** folder.

Arkiv's official hackathon judging rubric assigns equal weight across developer feedback, architectural rationale, ecosystem reach, and technical execution. We have structured dedicated documentation answering each specific criterion:

### 1.1. Arkiv Evaluation Rubric Mapping
1. **Developer Experience & Feedback (25% Weight):**
   - **File:** [`arkiv/friction.md`](../arkiv/friction.md)
   - **Summary:** Honest, production-grade review detailing DX hurdles, in-memory mocking in CI, TypeScript typing improvements, smart contract event synchronization, and client-side PII safeguards (`validatePublicSuitability`).
2. **Why Arkiv vs. Traditional DBs (25% Weight):**
   - **File:** [`arkiv/why-arkiv.md`](../arkiv/why-arkiv.md)
   - **Summary:** Architectural analysis resolving the trilemma between expensive on-chain EVM storage slots, vulnerable centralized Web2 databases (AWS RDS/PostgreSQL), and unqueryable raw IPFS CIDs.
3. **Ecosystem Reach & Impact (25% Weight):**
   - **File:** [`arkiv/reach.md`](../arkiv/reach.md)
   - **Summary:** Analysis of how DePIN logistics, humanitarian public goods DAOs, and autonomous procurement agents leverage wallet-owned, expiring shared state.
4. **Technical Implementation Architecture:**
   - **Files:** [`arkiv/how-you-use-arkiv.md`](../arkiv/how-you-use-arkiv.md) and [`docs/ARKIV_INTEGRATION_GUIDE.md`](./ARKIV_INTEGRATION_GUIDE.md)
   - **Code Implementation:** [`src/lib/arkiv/adapter.ts`](../src/lib/arkiv/adapter.ts), [`src/lib/arkiv/types.ts`](../src/lib/arkiv/types.ts)
   - **Versioned Schemas on Rabdi Testnet:**
     - `openaid.v1.requests`: NGO tenders with indexed `campaignId`, `status`, and `targetRegion`.
     - `openaid.v1.bids`: Sealed bid commitments and revealed supplier bids.
     - `openaid.v1.evidence`: Shipping waybills, carrier names, and IPFS manifest CIDs.
     - `openaid.v1.reviews`: World ID-verified validator council audit decisions.

### 1.2. How to Run Arkiv Tests
```bash
# Execute isolated Arkiv unit, schema, privacy, and query tests (21 tests)
npm run test:arkiv
```

---

## 2. Arc (Circle) Judging Verification

> **Track Focus:** *"Best Smart Contracts on Arc with Advanced Stablecoin Logic"* / *"Best DeFi App Built in Arc Studio"* ($15,000 Prize Pool)

OpenAid implements zero-custody, conditional USDC settlement deployed live on Arc Testnet, enforcing staged payouts (70% upon 3-of-5 validator quorum attestation + 30% upon challenge period expiry).

### 2.1. Live On-Chain Deployments & Proofs
- **Network:** Arc Testnet (Circle Layer 1, Chain ID `5042002` / `0x4cef52`)
- **RPC Endpoint:** `https://rpc.testnet.arc.network`
- **Deployed Contract (`OpenAidEscrow.sol`):** [`0xe38151283e55077F621988679f2Cc524b785d236`](https://testnet.arcscan.app/address/0xe38151283e55077F621988679f2Cc524b785d236)
- **Deployment Transaction:** [`0xd4748a53c1eedce5bc86293d3d5a570764fae0996d0eb2b906c0ea13d54e7b21`](https://testnet.arcscan.app/tx/0xd4748a53c1eedce5bc86293d3d5a570764fae0996d0eb2b906c0ea13d54e7b21) (Block #70917303)
- **Official Bound USDC Token:** [`0x3600000000000000000000000000000000000000`](https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000) (6 decimals)
- **Flattened Contract Source:** [`deployments/OpenAidEscrow_Flattened.sol`](../deployments/OpenAidEscrow_Flattened.sol)
- **Deployment Artifact:** [`deployments/arcTestnet-5042002.json`](../deployments/arcTestnet-5042002.json)
- **Independent Security Audit Report:** [`docs/ARC_SECURITY_AUDIT.md`](./ARC_SECURITY_AUDIT.md)

### 2.2. Stablecoin Financial Mechanics
- **Direct Escrow Vault:** Donors fund campaigns directly into the immutable escrow contract using Arc USDC. The NGO never takes custody of funds.
- **Checks-Effects-Interactions (CEI):** Internal balances and states update prior to `safeTransfer` invocations.
- **Deterministic Refund Flow:** If an auction or delivery times out, donors withdraw 100% of their contributions proportionally via pull-based withdrawals.

### 2.3. How to Run Arc Tests
```bash
# Run Arc Testnet wallet, escrow accounting, and funding verification tests
npm run test:arc

# Run full smart contract test suite
npm run test:contracts
```

---

## 3. Chainlink Runtime Environment (CRE) Verification

> **Track Focus:** Chainlink Technology Partner Track ($5,000 Prize Pool)  
> **Target Subfolder:** Evaluators should inspect **[`/chainlink-cre/`](../chainlink-cre/)**

Chainlink CRE acts as a decentralized evidence verification oracle that analyzes freight carrier APIs, validates IPFS multihash encodings, and performs Haversine spatial geofencing before human validators vote.

### 3.1. Technical Architecture & Artifacts
- **Module Documentation:** [`chainlink-cre/README.md`](../chainlink-cre/README.md) and [`docs/CHAINLINK_CRE_INTEGRATION_GUIDE.md`](./CHAINLINK_CRE_INTEGRATION_GUIDE.md)
- **Official CRE SDK Workflow:** [`chainlink-cre/workflow.ts`](../chainlink-cre/workflow.ts) and [`chainlink-cre/workflow.yaml`](../chainlink-cre/workflow.yaml)
- **Multi-Node DON Consensus Simulator:** [`chainlink-cre/simulate.ts`](../chainlink-cre/simulate.ts) (4 nodes, 2/3 BFT threshold, Byzantine fault detection)
- **Local Runner:** [`chainlink-cre/runner.ts`](../chainlink-cre/runner.ts)
- **Frontend Advisory Integration:** [`src/lib/cre/`](../src/lib/cre/)

### 3.2. How to Run Chainlink CRE Tests
```bash
# Run CRE unit and edge-case verification tests
npm run test:cre
```

---

## 4. World ID Verification

> **Track Focus:** World Sponsor Bounties ($12,500 Prize Pool)

OpenAid integrates World IDKit to ensure Sybil-resistant, unique human reviewer attestation for validator council members before signing delivery verdicts.

### 4.1. Technical Architecture & Artifacts
- **Integration Guide:** [`docs/WORLD_ID_INTEGRATION_GUIDE.md`](./WORLD_ID_INTEGRATION_GUIDE.md)
- **Verification Engine & Types:** [`src/lib/worldid/verifier.ts`](../src/lib/worldid/verifier.ts), [`src/lib/worldid/types.ts`](../src/lib/worldid/types.ts)
- **Nullifier Tracking:** Prevents double-voting attacks while preserving zero-knowledge reviewer privacy.

### 4.2. How to Run World ID Tests
```bash
# Run World IDKit ZK proof verification tests
npm run test:worldid
```

---

## 5. Master Protocol Test Command

To verify the entire protocol suite across all partner integrations in a single execution:

```bash
npm run test:all
```
