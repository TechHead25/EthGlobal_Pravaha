# OpenAid Protocol V2 — Threat Model & Attack Scenarios

> **Classification:** Security Engineering Threat Model  
> **Target Scope:** OpenAid Protocol V2 Architecture (Sub-Vaults, Backup Vendors, Validator Selection, Vendor Verification, World ID Feedback)  
> **Date:** November 2026  

---

## 1. System Boundaries & Trust Assumptions

### Trust Assumptions
1. **Underlying Blockchain & Token:** Arc Testnet (or underlying EVM L1) consensus is honest; official USDC contract complies with ERC-20 specifications without arbitrary balance debits.
2. **Cryptographic Primitives:** Keccak-256, secp256k1 ECDSA, and BN254 pairing-friendly elliptic curve operations remain collision- and preimage-resistant.
3. **Validator Independence:** At least 3 of 5 assigned validators act honestly and without collusion with the winning vendor or NGO.
4. **World ID Oracles:** The Worldcoin Semaphore zero-knowledge proof verifies unique humanness. (It does *not* verify physical geography or recipient entitlement).

---

## 2. Threat Analysis by Feature

### Feature 1: Backup Vendor Award & Failover

#### Attack Scenario 1.1: Vendor Collusion & Deficit Siphoning
* **Threat Actor:** Colluding vendor syndicate ($\text{Vendor}_A$ and $\text{Vendor}_B$).
* **Mechanism:** $\text{Vendor}_A$ submits an artificially low bid of \$7,000 for a \$10,000 sub-vault to force a win. $\text{Vendor}_B$ submits a \$9,800 bid. $\text{Vendor}_A$ intentionally defaults. $\text{Vendor}_A$ loses their \$350 bond, but their partner $\text{Vendor}_B$ is auto-awarded at \$9,800, extracting \$2,800 above the winning bid from donors.
* **Mitigation / Defense:**
  - **15% Spread Cap Rule:** If $b_B > 1.15 \times b_A$, $\text{Vendor}_B$ is automatically disqualified from failover. Here $1.15 \times 7000 = \$8,050 < \$9,800$, so the failover rejects $\text{Vendor}_B$ and transitions directly to donor refund.
  - **Bond Deficit Offset:** Any allowable deficit must be covered first by $\text{Vendor}_A$'s slashed bond.

#### Attack Scenario 1.2: Hostage Capital via Stale Backup Bids
* **Threat Actor:** Malicious primary vendor defaults after 30 days. Backup vendor was awarded without their consent while their inventory is sold out.
* **Mitigation / Defense:** 48-Hour Opt-In Handshake (`acceptBackupAssignment`). The backup vendor must explicitly post collateral within 48 hours to activate the contract. If they do not, funds return immediately to donors.

---

### Feature 2: Validator Liveness & Dynamic Replacement

#### Attack Scenario 2.1: Quorum Denial of Service (Griefing)
* **Threat Actor:** Two malicious validators collude with a rogue vendor or go completely offline, preventing the 3-of-5 threshold from ever being met.
* **Mitigation / Defense:**
  - Permissionless 72-Hour Liveness Heartbeat. Any party (donor, vendor, challenger) can trigger `triggerValidatorTimeout()` once 72 hours have elapsed from evidence submission.
  - Inactive validators are replaced by deterministic pseudo-random draws from the verified backup pool.

#### Attack Scenario 2.2: Retrospective Vote Invalidation (Epoch Replay)
* **Threat Actor:** An attacker triggers a timeout to replace honest validators who already cast negative votes.
* **Mitigation / Defense:**
  - Strict Vote Persistence Invariant: Any validator who cast a vote prior to the timeout retains their vote across epoch transitions.
  - Only non-voting validator slots can be substituted.

---

### Feature 3: Isolated Sub-Vaults

#### Attack Scenario 3.1: Cross-Vault Fund Siphoning
* **Threat Actor:** An NGO or vendor in Sub-Vault 1 attempts to claim refunds or payouts exceeding Sub-Vault 1's balance, drawing on Sub-Vault 2's capital.
* **Mitigation / Defense:**
  - Dedicated storage mappings: `mapping(uint256 => mapping(uint8 => SubVault))`.
  - Every external call validates:
    $$\text{payoutAmount} \le \text{subVault.totalDeposited}$$
  - Balances are decremented internally *before* invoking `usdc.safeTransfer()`.

---

### Feature 4: Qualified Vendor Bidding

#### Attack Scenario 4.1: Sybil Bidding Cartel
* **Threat Actor:** A single entity generates 3 distinct Ethereum addresses and submits fake bids to satisfy the 3-bid minimum quorum.
* **Mitigation / Defense:**
  - Off-chain EIP-712 qualification attestations signed by the verified `VendorRegistry`.
  - Each attestation is bound to a registered corporate/legal identity and an on-chain non-reusable nonce.
  - Arkiv anchors the business registration and physical proof-of-operations records.

---

### Feature 5: World ID Feedback & Beneficiary Eligibility

#### Attack Scenario 5.1: Global Remote Sybil Feedback
* **Threat Actor:** A vendor purchases or solicits World ID proofs from individuals across the world to submit artificial 5-star ratings for a local aid delivery.
* **Mitigation / Defense:**
  - Action Parameter Binding: World ID proof must commit to `action = keccak256(campaignId, subVaultId, manifestCid)`.
  - Client GPS Coordinates are cross-checked via Chainlink CRE carrier tracking.
  - **Decoupling Invariant:** World ID feedback updates off-chain vendor reputation scores in Arkiv, but **never** unilaterally unlocks or releases escrowed funds on-chain.
