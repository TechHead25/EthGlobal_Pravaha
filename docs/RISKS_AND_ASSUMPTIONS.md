# OpenAid Protocol — Technical Risks, Trust Boundaries & Core Assumptions

## 1. The Physical-World Truth Problem & Evidence Limitations

### The Oracle / Ground Truth Boundary
> **Fundamental Reality:**  
> Smart contracts, cryptographic hashes, and IPFS CIDs **cannot independently verify physical reality**. A hash on-chain guarantees only that the data referenced off-chain has not been altered since the hash was generated. It does **not** prove that 10,000 blankets physically reached a warehouse, that food supplies were not expired, or that a photo was taken at the stated coordinate today rather than three years ago.

OpenAid Protocol explicitly acknowledges this trust boundary. Physical-world assurance is achieved through a multi-layered economic and social consensus model:
1. **Multi-Angle Evidence Manifests:** Combining shipping carrier manifests, GPS geostamps, on-site photographs, and receiving administrator signatures into an immutable IPFS bundle.
2. **Decentralized Multi-Validator Quorum (3 of 5):** Independent humanitarian auditors inspecting evidence manifests and verifying authenticity before releasing capital.
3. **Economic Retention Buffer (30%):** Retaining 30% of the vendor's payment for a 72-hour challenge period during which whistleblowers or community auditors may flag fraud.
4. **Collateral Slashing:** Slashing the vendor's performance bond if delivery is fraudulent or unfulfilled.

---

## 2. Technical & Operational Risk Matrix

| Risk ID | Risk Category | Description | Severity | Likelihood | Protocol Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`RISK-01`** | **Collusion** | A corrupt vendor bribes 3 out of 5 validators to approve fraudulent delivery manifests. | High | Low | Staged 70/30 split retains 30% payout and performance bond; 72-hour challenge period allows external observers to raise disputes; future roadmap transitions to dynamic EigenLayer/PoS staked validators with slashing. |
| **`RISK-02`** | **Storage Outage** | IPFS public gateways or pinning services (e.g. Pinata) experience downtime or latency during live demo or verification. | Medium | Medium | Smart contracts store the cryptographic CID string directly and do not depend on gateway uptime; frontend client implements local caching and gateway fallback rotation (Pinata, Cloudflare, ipfs.io) so demo never stalls. |
| **`RISK-03`** | **Vendor Ghosting** | Winning vendor fails to fulfill supplies or ceases communication after winning the auction. | Medium | Low | Strict `deliveryDeadline` on-chain; if deadline lapses with no evidence CID submitted, vendor bond is slashed and 100% of donor escrow becomes claimable via pull-refunds. |
| **`RISK-04`** | **Validator Dropout** | Validators become unresponsive or offline, failing to reach 3-of-5 quorum within review window. | Medium | Low | Verification window has an explicit timeout (`verificationDeadline`); if quorum is not reached by the deadline, delivery transitions to `VerificationFailed`, triggering 100% donor refund protection. |
| **`RISK-05`** | **Mempool Front-Running** | MEV bots or rival vendors attempt to snipe bids during commit or reveal phases. | High | Medium | Sealed commit–reveal auction binds `msg.sender` directly into `keccak256(amount, salt, msg.sender)`, making stolen commitments invalid upon reveal; mandatory bid bond penalizes unrevealed bids. |
| **`RISK-06`** | **Timing Attack / Reorg** | Short testnet block times or minor chain reorganizations affect tight demo timers. | Low | Low | Protocol uses coarse timestamp checks (`block.timestamp`) with explicit timing modes (`PRODUCTION` vs `DEMO`), avoiding block-number dependencies. |

---

## 3. Justification & Configuration of Protocol Parameters

### 3.1. The 70 / 30 Staged Settlement Split
- **Why 70% in Stage 1?**  
  Humanitarian procurement requires vendors to purchase physical inventory, charter freight, pay border tariffs, and hire local transport. If the initial payout is too low (e.g., 30%), reputable suppliers cannot participate due to prohibitive working capital requirements. At 70%, vendors cover their direct wholesale costs upon 3-of-5 validator consensus.
- **Why 30% in Stage 2?**  
  The remaining 30% represents the vendor's net profit margin and operational overhead. Withholding 30% alongside their 5% performance bond ensures the vendor remains exposed to significant economic loss if supplies are defective, diverted, or contested during the challenge window.
- **Configurability:** Parameterized in contract deployment or campaign creation, allowing specialized campaigns (e.g. digital vouchers vs physical shipping) to tune the split (e.g. 80/20 or 60/40).

### 3.2. The 3-of-5 Validator Quorum
- **Why 3 of 5?**  
  A 3-of-5 threshold represents a classical Byzantine fault-tolerant majority ($> 50\%$). It tolerates up to 2 offline or compromised validators without halting the protocol, while requiring at least 3 distinct entities to collude to approve a fraudulent claim.
- **Independence Requirements:** Validators must be distinct organizations (e.g. UN agency affiliate, local Red Cross chapter, independent drone/satellite inspector, certified NGO auditor).

### 3.3. Timing Modes: Production vs. Demo Mode
To ensure live hackathon demonstrations are engaging and verifiable within a 4-minute presentation window, the protocol defines two explicit timing profiles:

| Protocol Parameter | Production Mode | Hackathon Demo Mode | Rationale for Demo Acceleration |
| :--- | :--- | :--- | :--- |
| **Funding Window** | 14 – 30 Days | 60 Seconds / Instant | Demonstrates campaign fill and escrow balance update immediately. |
| **Auction Commit Window** | 72 Hours | 30 Seconds | Allows presenters to show bid submission without stalls. |
| **Auction Reveal Window** | 48 Hours | 30 Seconds | Rapid reveal and deterministic winner selection. |
| **Delivery Fulfillment Window**| 14 – 45 Days | 120 Seconds | Simulates shipping and evidence upload in real-time. |
| **Validator Voting Window** | 7 Days | 60 Seconds | Immediate quorum casting by 3 test accounts. |
| **Challenge Period** | 72 Hours | 60 – 120 Seconds | Live visual countdown timer showing Stage 2 unlock. |

---

## 4. Unresolved Architectural Questions & MVP Recommendations

### Decision 1: Vendor Qualification Model
- **Question:** Should vendor participation in procurement auctions be strictly permissioned (KYC whitelist) or permissionless?
- **Options:**
  - *Option A:* Only pre-approved addresses can submit bids.
  - *Option B:* Any address can bid, provided they deposit a 5% `bidBond`.
- **Recommended MVP Choice:** **Option B (Permissionless + Bid Bond).**
- **Rationale:** Permissionless bidding avoids centralized admin whitelisting bottlenecks during hackathon demos while the 5% bond prevents spam and Sybil bidding.
- **Security Implications:** Vendors must risk real capital to bid; non-revealed bids are slashed.

### Decision 2: Challenge Dispute Arbiter
- **Question:** When a challenge is raised during the 72h window, who decides whether the challenge is upheld?
- **Options:**
  - *Option A:* Centralized NGO administrator.
  - *Option B:* Third-party arbitration protocol (Kleros).
  - *Option C:* Secondary vote by the 5-validator council on dispute evidence.
- **Recommended MVP Choice:** **Option C (Secondary Validator Review).**
- **Rationale:** Option A violates zero-custody principles; Option B introduces external protocol dependency risks during a short hackathon; Option C keeps dispute resolution fully self-contained, transparent, and multi-actor.
- **Security Implications:** Requires 3 of 5 validators to confirm fraud to uphold a dispute and slash the vendor.
