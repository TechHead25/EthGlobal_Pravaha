# OpenAid Protocol — Dashboard Architecture & Module Integration Specification

> **Notice:** This document establishes the definitive frontend integration contracts and state machine model for OpenAid Protocol. It coordinates the boundary between **Arc Testnet** (on-chain financial truth), **Arkiv Network** (time-scoped public database), **World ID** (human uniqueness proof), and **Chainlink CRE** (off-chain delivery evidence oracle).

---

## 1. Architectural Architecture & Core Role

As Integration Lead, our mandate is to guarantee that the OpenAid dashboard operates as an uncompromised mirror of real cryptographic state. We eliminate single points of ambiguity and ensure that four distinct modules interact seamlessly without overlapping Git conflicts:

```
+---------------------------------------------------------------------------------------------------+
|                                     OpenAid Protocol Dashboard                                    |
|                                         (Unified UI Layer)                                        |
+---------------------------------------------------------------------------------------------------+
                                                  |
         +--------------------+-------------------+--------------------+--------------------+
         |                    |                                        |                    |
         v                    v                                        v                    v
  [ Tier 1: Truth ]    [ Tier 2: State ]                       [ Tier 3: Oracles ]   [ Tier 4: Tools ]
    Arc Testnet          Arkiv Network                            Chainlink CRE       Sealed Bid
    Purpose Escrow       Rabdi Database                           & World ID           Calculator
    (Chain ID: 5042002)  (Chain ID: 7794095)                      (DON & ZK-SNARK)     (Local Keccak256)
  - Zero-custody escrow  - openaid.v1.requests                    - Waybill checks    - Deterministic
  - Staged USDC payouts  - openaid.v1.bids                        - GPS geofencing      bid hash
  - 3-of-5 quorum votes  - openaid.v1.evidence                    - Unique human      - No on-chain
  - Pull donor refunds   - openaid.v1.reviews                       nullifiers          mutation
```

---

## 2. 3-Tier Truth Taxonomy

To prevent misleading donors or validators, the dashboard strictly categorizes all displayed data into three immutable tiers:

### Tier 1: Irrevocable On-Chain Settlement (`ON_CHAIN_SETTLEMENT`)
- **Authority:** `OpenAidEscrow.sol` and official Arc USDC ERC-20 (`0x3600...0000`) on Arc Testnet.
- **Rule:** Never rendered optimistically. A donation is only recorded as confirmed when an on-chain transaction receipt returns `status === 1`.
- **Key Fields:** `campaignCount`, `userUsdcBalance`, `userAllowance`, `donorDeposits`, `totalDeposited`, `stage1Paid`, `stage2Paid`, and contract bytecode presence.

### Tier 2: Queryable Expiring Database State (`QUERYABLE_EXPIRING_STATE`)
- **Authority:** Arkiv Rabdi Testnet (Chain ID `7794095`) via `@arkiv-network/sdk`.
- **Rule:** Stores high-volume procurement manifests, sealed bid hashes, carrier waybills, and auditor logs with automated TTL expiration (7 to 30 days), offloading gas costs from Arc.
- **Key Fields:** Versioned schemas (`openaid.v1.*`), `$key`, `$owner`, TTL expiration timestamps, and Rabdi Explorer links.

### Tier 3: Off-Chain Verifiable Oracle Proofs (`ORACLE_OFF_CHAIN_PROOF`)
- **Authority:** Chainlink Runtime Environment (CRE) automated evidence consensus and World IDKit zero-knowledge proofs.
- **Rule:** Verifies physical reality (carrier waybills, GPS perimeter) and human uniqueness (anti-Sybil nullifiers). Results are cryptographic attestations presented to validators *before* they sign on-chain votes.

### Tier 4: Client-Side Interactive Demonstrator (`DEMO_SIMULATION`)
- **Authority:** Browser local tools (e.g. sealed bid hash calculator, organizer guide).
- **Rule:** Must be explicitly badged with `[DEMO SIMULATOR]` or `[LOCAL TOOL]` so users never mistake a local calculation for an on-chain transaction.

---

## 3. Dashboard State Machine Model

The dashboard derives its high-level UI view mode through a pure function:

```typescript
export type DashboardStateMode =
  | "loading"                 // Fetching initial contract accounting from RPC
  | "empty"                   // Wallet disconnected OR 0 on-chain campaigns exist
  | "connected"               // Wallet connected on Arc Testnet with active campaign
  | "wrong_network"           // Wallet connected to a non-Arc network (e.g., Ethereum Mainnet)
  | "error"                   // Network, contract, or provider failure
  | "transaction_pending"     // User has signed approval or deposit; awaiting block inclusion
  | "transaction_confirmed";  // Transaction confirmed with receipt status == 1; state refreshed
```

### State Transition Diagram

```
                 +-------------------+
                 |    App Launch     |
                 +-------------------+
                           |
                           v
                     +-----------+
                     |  loading  |<-------------------------+
                     +-----------+                          |
                           |                                |
              +------------+------------+                   |
              |                         |                   |
              v                         v                   |
      +---------------+         +---------------+           |
      |     empty     |         | wrong_network |           |
      | (No Wallet /  |         | (Chain !=     |           |
      |  Campaign=0)  |         |  5042002)     |           |
      +---------------+         +---------------+           |
              |                         |                   |
        Connect Wallet            Switch Network            |
              |                         |                   |
              +------------+------------+                   |
                           |                                |
                           v                                |
                    +-------------+                         |
                    |  connected  |                         |
                    +-------------+                         |
                           |                                |
                     Submit Deposit                         |
                           |                                |
                           v                                |
               +-----------------------+                    |
               |  transaction_pending  |                    |
               | (Waiting for Receipt) |                    |
               +-----------------------+                    |
                     /           \                          |
                Error             Success (Status == 1)     |
                 /                 \                        |
                v                   v                       |
           +---------+     +-------------------------+      |
           |  error  |     |  transaction_confirmed  |------+
           +---------+     +-------------------------+
```

---

## 4. Frontend-Facing Module Contracts

All four modules communicate with the dashboard via typed contracts defined in [`src/lib/dashboard/types.ts`](file:///c:/Projects/EthGLobal/src/lib/dashboard/types.ts). Dashboard components never import private internals of the underlying adapters.

### A. Arc Module Contract (`ArcDashboardContract`)
```typescript
export interface ArcDashboardContract {
  provenance: "ON_CHAIN_SETTLEMENT";
  chainId: number;
  isCorrectNetwork: boolean;
  escrowAddress: string;
  usdcAddress: string;
  tokenDecimals: number;
  tokenSymbol: string;
  hasBytecode: boolean;
  campaignCount: number;
  escrowBalance: bigint;
  userAddress: string | null;
  userBalance: bigint;
  userAllowance: bigint;
  userDonorDeposit: bigint;
  activeCampaign: ArcCampaignSummary | null;
  fundingStep: string;
  isTransactionPending: boolean;
  lastConfirmedTxHash?: string;
  error: string | null;
}
```

### B. Arkiv Module Contract (`ArkivDashboardContract`)
```typescript
export interface ArkivDashboardContract {
  provenance: "QUERYABLE_EXPIRING_STATE";
  network: "rabdi" | string;
  chainId: number;
  explorerUrl: string;
  entities: ArkivEntitySummary[];
  isLoading: boolean;
  activeFilter: string;
  totalCount: number;
  error: string | null;
}
```

### C. World ID Module Contract (`WorldIdDashboardContract`)
```typescript
export interface WorldIdDashboardContract {
  provenance: "ORACLE_OFF_CHAIN_PROOF";
  appId: string;
  action: string;
  isVerified: boolean;
  isLoading: boolean;
  executionMode: "live_developer_portal" | "sandbox_staging";
  nullifierHash: string | null;
  error: string | null;
}
```

### D. Chainlink CRE Module Contract (`CreDashboardContract`)
```typescript
export interface CreDashboardContract {
  provenance: "ORACLE_OFF_CHAIN_PROOF";
  isLoading: boolean;
  executionMode: "local_runtime_simulator" | "remote_don";
  result: CreDashboardResult | null;
  lastExecutedAt: number | null;
  error: string | null;
}
```

---

## 5. Audit of Simulated Behaviors in `src/app/page.tsx` & Remediation

| Code Region | Current Implementation | Risk / Ambiguity | Integration Remediation |
| :--- | :--- | :--- | :--- |
| **Vendor Sealed Bid Calculator** (line 1142) | Generates `mockHash = "0x" + Math.random()...` | Non-cryptographic pseudo-random string presented as a commitment. | Replace with genuine deterministic `keccak256(abi.encodePacked(bidAmount, salt, vendorAddress))` calculator using `ethers.solidityPackedKeccak256`. |
| **On-Chain Campaign Title** (line 801) | Hardcoded `<h2 ...>Emergency Thermal Blankets...</h2>` | Title does not update if on-chain campaign has a different manifest CID. | Display dynamic title with CID link: `"Campaign #" + onChainCampaign.id + " (" + onChainCampaign.metadataCid.slice(0, 12) + "...)"`. |
| **Validator Matrix Buttons** (lines 1240–1256) | Updates React state `setValidatorVoted` locally on button click. | Simulates an attestation without an on-chain transaction or active evidence CID. | Clearly badge as `[DEMO SIMULATOR]` and disable when no on-chain campaign is in `VerificationPending` state. |
| **World ID Button** (line 440) | Sends simulated mock nullifier hash to `/api/verify-worldid`. | Bypasses the IDKit user interface pop-up. | Display `[OFFLINE ZK SANDBOX]` badge and clearly state live World ID production keys require verified Orb staging. |
| **Network Switch Listener** (line 224) | `chainChanged` does not trigger `refreshOnChainData`. | UX bug: wallet switches network but UI balances remain uninitialized. | Add immediate `refreshOnChainData(accounts[0])` trigger when switching to Arc Testnet. |
| **Rapid Double-Click Window** (line 373) | Button disables on `fundingStatus.step`, but async gap precedes it. | Rapid double-click (<50ms) can dispatch duplicate sign prompts. | Add synchronous `isSubmittingRef.current = true` guard. |

---

## 6. PR Review & Coordination Checklist

Every incoming PR must be evaluated against this checklist prior to merge:

- [ ] **Security:** Does the PR introduce any owner withdraw backdoor (`emergencyWithdraw`)? (Must be strictly NO).
- [ ] **Decoupling:** Does the PR modify shared types or another module's files without prior RFC?
- [ ] **Truthfulness:** Does any UI component present a simulated or optimistic balance as an on-chain fact?
- [ ] **Clean Tests:** Do all unit tests pass with zero network dependencies?
- [ ] **Build:** Does `npm run build` succeed with zero TypeScript or ESLint errors?
