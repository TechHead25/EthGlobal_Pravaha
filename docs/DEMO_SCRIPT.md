# OpenAid Protocol — Hackathon Demo Script

## 1. Demo Narrative & Time Budget

| Section | Target Duration | Objective | Key Talking Point |
| :--- | :--- | :--- | :--- |
| **1. Hook & Problem** | 0:00 – 0:45 | Present humanitarian aid leakage and the flaw of NGO fund custody. | *"Billions in aid are diverted or lost because donors must trust NGOs with complete financial custody. OpenAid separates custody, procurement, and verification."* |
| **2. Campaign Creation & Donor Escrow** | 0:45 – 1:30 | NGO creates campaign; Donor deposits USDC. | Show that NGO wallet balance stays 0. Funds are programmatically locked in escrow. |
| **3. Sealed Procurement Auction** | 1:30 – 2:15 | Vendors commit and reveal sealed bids. | Prevents supplier collusion and front-running. Lowest valid bid wins ($8,500 vs $9,200). |
| **4. Delivery & IPFS Evidence** | 2:15 – 2:45 | Vendor submits real delivery manifest to IPFS. | Multi-angle photo manifest anchored by cryptographic CID on-chain. |
| **5. Quorum & Staged Settlement** | 2:45 – 3:30 | 3 of 5 validators attest; 70% immediate payout, 30% timelocked. | 70% pays fulfillment; 30% held during challenge window. |
| **6. Failure Defense & Conclusion** | 3:30 – 4:00 | Attempt unauthorized NGO withdrawal (reverts) and show donor refund mechanism. | Proves zero-custody invariant and complete protection. |

---

## 2. Pre-Demo Environment Setup

Ensure the following accounts are pre-funded with test ETH and Mock USDC (e.g., using `scripts/seedDemo.ts`):
- **Account 0 (Deployer / Admin):** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **Account 1 (NGO Coordinator):** `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- **Account 2 (Donor):** `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` (Balances: 50,000 Mock USDC)
- **Account 3 (Vendor Alpha):** `0x90F79bf6EB2c4f870365E785982E1f101E93b906`
- **Account 4 (Vendor Beta):** `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`
- **Accounts 5, 6, 7 (Validators 1, 2, 3):** Pre-registered in `ValidatorRegistry`.

Protocol Timing Mode: **`DEMO`**
- Commit Window: 30 seconds
- Reveal Window: 30 seconds
- Challenge Window: 60 seconds

---

## 3. Step-by-Step Live Demo Execution

### Act I: Campaign Creation & Direct Escrow Funding
1. **Presenter Action:** Connect wallet as **Account 1 (NGO)**.
2. **UI Action:** Click **"Create Campaign"**.
   - Title: `Emergency Water Filtration Units - Flood Zone 4`
   - Budget Ceiling: `10,000 USDC`
   - Delivery Deadline: `+5 minutes`
3. **On-Chain Event Emitted:**
   ```solidity
   event CampaignCreated(uint256 indexed campaignId, address indexed creator, uint256 budgetCeiling, string metadataCid);
   ```
4. **Presenter Action:** Switch wallet to **Account 2 (Donor)**.
5. **UI Action:** Click **"Contribute to Campaign #1"** -> Enter `10,000 USDC` -> Approve & Deposit.
6. **Key Callout to Judges:**
   > *"Notice the wallet balances: 10,000 USDC left the Donor's wallet and entered the EscrowSettlement contract. The NGO's wallet received exactly zero tokens. The NGO cannot touch this capital."*
7. **On-Chain Event Emitted:**
   ```solidity
   event FundsDeposited(uint256 indexed campaignId, address indexed donor, uint256 amount);
   event CampaignFunded(uint256 indexed campaignId, uint256 totalEscrowed);
   ```

---

### Act II: Sealed Commit–Reveal Procurement Auction
1. **Presenter Action:** Switch wallet to **Account 3 (Vendor Alpha)**.
   - Enter Bid: `9,200 USDC` (Salt: `secretAlpha`).
   - Click **"Submit Sealed Commitment"**.
   - Contract records `keccak256(9200, secretAlpha, VendorAlpha)`.
2. **Presenter Action:** Switch wallet to **Account 4 (Vendor Beta)**.
   - Enter Bid: `8,500 USDC` (Salt: `secretBeta`).
   - Click **"Submit Sealed Commitment"**.
3. **Presenter Action:** Fast-forward block time by 30 seconds (or wait for demo timer).
4. **UI Action:** Both vendors click **"Reveal Bid"**.
5. **Observed Result:**
   - Vendor Beta is selected as winner at **8,500 USDC**.
   - Vendor Alpha's bid bond is unlocked for withdrawal.
   - The remaining 1,500 USDC of the 10,000 budget is reserved for donor refund upon settlement.
6. **On-Chain Event Emitted:**
   ```solidity
   event BidRevealed(uint256 indexed campaignId, address indexed vendor, uint256 amount);
   event AuctionFinalized(uint256 indexed campaignId, address indexed winningVendor, uint256 winningAmount);
   ```

---

### Act III: Delivery Fulfillment & IPFS Evidence Commitment
1. **Presenter Action:** As **Vendor Beta**, open the Vendor Portal.
2. **UI Action:** Drag and drop delivery package (consisting of 3 site photos, GPS delivery coordinates `14.5995° N, 120.9842° E`, and signed handover sheet).
3. **Frontend Action:** Hashes and pins package to IPFS -> yields `bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi`.
4. **UI Action:** Vendor Beta clicks **"Commit Delivery Evidence"**.
5. **On-Chain Event Emitted:**
   ```solidity
   event EvidenceSubmitted(uint256 indexed campaignId, address indexed vendor, string ipfsCid, uint256 timestamp);
   ```

---

### Act IV: Decentralized Quorum Attestation & Stage 1 Settlement
1. **Presenter Action:** Switch to **Validator Portal**.
2. **UI Action:**
   - **Validator 1 (Account 5)** reviews the photos and GPS coordinates on the IPFS preview pane. Clicks **"Approve Delivery"**.
   - **Validator 2 (Account 6)** clicks **"Approve Delivery"**.
   - Progress bar shows: `2 of 3 Required Votes Cast`.
   - **Validator 3 (Account 7)** clicks **"Approve Delivery"**.
3. **Observed Result:**
   - 3-of-5 threshold is met!
   - Contract immediately executes **Stage 1 Settlement (70%)**:
     $$8,500 \times 0.70 = 5,950 \text{ USDC}$$
   - 5,950 USDC is transferred to Vendor Beta.
   - 60-second challenge countdown timer begins in the UI.
4. **On-Chain Events Emitted:**
   ```solidity
   event VoteCast(uint256 indexed campaignId, address indexed validator, bool approved);
   event QuorumReached(uint256 indexed campaignId, uint256 affirmativeVotes);
   event Stage1Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount);
   ```

---

### Act V: Challenge Expiry & Stage 2 Final Settlement
1. **UI Action:** The UI displays live challenge countdown: `00:45 ... 00:00`.
2. **Presenter Action:** Fast-forward block time or allow 60-second window to expire.
3. **UI Action:** Click **"Finalize Settlement"**.
4. **Observed Result:**
   - Remaining 30% ($2,550 USDC) is transferred to Vendor Beta.
   - Vendor Beta's performance collateral is refunded.
   - The unspent 1,500 USDC budget surplus is allocated to Donor refund pool.
5. **On-Chain Event Emitted:**
   ```solidity
   event Stage2Settled(uint256 indexed campaignId, address indexed vendor, uint256 finalPayout);
   event CampaignCompleted(uint256 indexed campaignId);
   ```

---

### Act VI: Security & Failure Resilience Demonstration
1. **Presenter Action:** Switch wallet back to **Account 1 (NGO)**.
2. **UI Action / Console:** Attempt to call `escrow.withdraw(campaignId, myAddress)`.
3. **Observed Result:**
   - The contract does not have such a function.
   - Calling any administrative or settlement function as the NGO reverts on-chain:
     ```
     Transaction reverted with custom error: Unauthorized()
     ```
4. **Presenter Action:** Show Test Scenario 2 in UI or test runner:
   - Vendor commits but never delivers supplies.
   - `deliveryDeadline` passes.
   - Donor clicks **"Claim Refund"** -> Receives 100% of deposited capital.
5. **Concluding Pitch:**
   > *"This is OpenAid: Cryptographic bidding drives down costs, decentralized quorum validates delivery, staged settlement protects against fraud, and donors retain ultimate custody protection."*
