# OpenAid Protocol — Project Brief

## 1. Executive Summary

**OpenAid Protocol** is an open, decentralized charitable procurement and staged settlement protocol engineered for EVM networks. It replaces opaque, high-leakage humanitarian aid pipelines with an immutable, multi-party smart contract coordination system. 

By separating the responsibilities of **capital custody (Donors)**, **procurement demand (NGOs)**, **physical fulfillment (Vendors)**, and **delivery validation (Independent Validators)**, OpenAid eliminates single points of failure, guarantees fair supplier price discovery, and programmatically protects donor capital through purpose-bound escrow and staged settlement.

---

## 2. Problem Statement

Global humanitarian aid exceeds \$30 billion annually, yet catastrophic inefficiencies, corruption, and systemic opacity plague relief supply chains:

1. **Custodial Monopolization & Misdirection:**  
   Donors transfer funds directly to NGO bank accounts or centralized cryptocurrency addresses. Once deposited, donors lose all oversight. Mismanagement, high administrative overhead, currency conversion friction, or bad actors frequently divert capital away from intended disaster relief zones.
2. **Opaque & Favored Vendor Procurement:**  
   Procurement of emergency supplies (water filtration units, medical kits, temporary shelters) is conducted through private, closed-door negotiations. Without competitive open bidding, aid organizations overpay preferred middlemen, depleting available relief funds.
3. **"Ghost Deliveries" & Fabricated Receipts:**  
   In conflict or disaster regions, proof of delivery often consists of easily forged paper manifests, blurry photos, or self-reported NGO claims. Donors have no mechanism to audit whether 10,000 blankets were genuinely distributed or merely billed.
4. **Lack of Recourse or Refund Mechanisms:**  
   If an aid initiative stalls, an NGO collapses, or supplies fail to arrive, donor funds are permanently lost. Traditional charitable infrastructure provides zero automated refund paths for unfulfilled pledges.

---

## 3. The OpenAid Solution & Core Value Proposition

OpenAid resolves these structural flaws through on-chain separation of powers, sealed-bid procurement, and quorum-attested staged escrow settlement:

```
+-----------------------------------------------------------------------------------+
|                              OPENAID PROTOCOL                                     |
|                                                                                   |
|   +---------------+      +-------------------+      +-------------------------+   |
|   |    DONORS     | ---> |   PURPOSE-BOUND   | ---> |     WINNING VENDOR      |   |
|   |  Direct Funds |      |   ESCROW VAULT    |      |  (Sealed-Bid Selected)  |   |
|   +---------------+      +-------------------+      +-------------------------+   |
|                                    ^                             |                |
|                                    | (Conditional Release)       |                |
|                             +---------------+                    v                |
|                             | VALIDATORS    | <--- [ Evidence Manifest (IPFS) ]   |
|                             | (3/5 Quorum)  |                                     |
|                             +---------------+                                     |
+-----------------------------------------------------------------------------------+
```

### Key Value Propositions
- **Zero-Custody for NGOs:** NGOs coordinate operations, specify item specifications, and define delivery logistics, but **never touch donor capital**.
- **Sealed Commit–Reveal Procurement:** Vendors submit cryptographic bid hashes during a commitment window, followed by a public reveal phase. This guarantees competitive pricing and prevents front-running or bid manipulation.
- **Content-Addressed Evidence Anchoring:** Physical delivery documentation (multi-angle photo series, GPS coordinates, shipping bills of lading, receiving party signatures) is serialized into an immutable IPFS manifest, anchored on-chain by its cryptographic CID hash.
- **Independent Quorum Attestation:** A decentralized validator set (initially 3-of-5 threshold) must independently review physical evidence manifests and submit affirmative on-chain votes before funds can be released.
- **Staged Settlement (70 / 30) & Dispute Window:**
  - **70% Initial Payout:** Released immediately upon 3-of-5 validator consensus to reimburse vendor fulfillment costs.
  - **30% Final Retention:** Held in escrow for a designated challenge window (e.g. 72 hours). If no challenge or fraud claim is verified, the vendor receives the remaining 30%.
- **Guaranteed Donor Refund Pathways:** If a campaign fails to reach its funding target, if no vendor submits a valid reveal, if the vendor fails to deliver before the timeout, or if a challenge proves fraud, 100% of remaining escrowed funds are unlocked for original donors via pull-based refunds.

---

## 4. Target Stakeholders & User Personas

| Stakeholder Persona | Objectives & Needs | Protocol Touchpoints |
| :--- | :--- | :--- |
| **The Impact Donor**<br>*(Individual donors, Philanthropic DAOs, Institutional grants)* | Demands absolute transparency, verifiable proof of impact, guarantee that funds cannot be redirected, and automated refunds if campaigns fail. | Deposits ERC-20 into escrow; monitors live campaign milestones; claims pull-based refunds if delivery times out. |
| **The Relief Coordinator / NGO**<br>*(On-ground humanitarian teams, emergency responders)* | Needs rapid capital deployment and reputable supplier fulfillment without the regulatory and security liability of holding millions in private custody. | Creates campaigns and Requests for Proposals (RFPs); defines supply specifications, budget caps, and delivery deadlines. |
| **The Verified Vendor / Supplier**<br>*(Logistics companies, medical distributors, local manufacturers)* | Seeks fair, transparent public tender opportunities; guaranteed, automated payment without 90-day bureaucratic payment delays. | Submits commit–reveal bids; fulfills shipments; publishes IPFS delivery manifests; claims 70% and 30% escrow payouts. |
| **The Independent Delivery Validator**<br>*(Local humanitarian auditors, satellite imagery analysts, community liaisons)* | Evaluates physical shipment evidence; stakes reputation/collateral; earns protocol attestation fees for honest evaluations. | Inspects IPFS manifests off-chain; verifies shipping manifests and timestamps; casts on-chain attestation or challenge votes. |

---

## 5. Architectural & Philosophical Design Principles

### Principle 1: Absolute Custodial Neutrality
The smart contract escrow is strictly purpose-bound. It contains no admin sweeping functions, no owner withdrawal backdoors, and no discretionary overrides. Capital flows only to the winning vendor upon verified completion or back to donors upon failure.

### Principle 2: Truth Boundaries & Real-World Limitations
Smart contracts, cryptographic hashes, and IPFS CIDs **do not prove physical-world reality**; they only prove data integrity and provenance. OpenAid makes no false claims of "automated physical proof." Real-world delivery verification relies on social and economic consensus via decentralized validator sets with explicit challenge mechanisms.

### Principle 3: Deterministic Failure Modes & Timeouts
Every state in the protocol lifecycle possesses a finite, immutable expiration deadline. If any participant (NGO, vendor, or validator) becomes unresponsive, the protocol transitions deterministically into an abort or refund state, preventing permanent capital lockup.

### Principle 4: Data Minimization & Privacy Protection
While aid delivery metrics (item counts, general delivery zone, photos of supplies) must be transparent, the identities of vulnerable disaster victims or recipient families must be protected. Personally Identifiable Information (PII) is strictly excluded from public manifests, using zero-knowledge or blinded cryptographic signatures where recipient confirmation is required.
