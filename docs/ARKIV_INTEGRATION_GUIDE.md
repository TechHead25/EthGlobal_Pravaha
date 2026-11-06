# OpenAid Protocol — Arkiv Network Integration Guide

> **Architecture & Operational Reference:** Production-quality integration between OpenAid Protocol and Arkiv Network (Rabdi Testnet) for decentralized, queryable, time-scoped procurement metadata.

---

## 1. System Overview & Architectural Role

In OpenAid Protocol, financial custody and delivery settlement are strictly governed on **Arc Testnet** by `OpenAidEscrow.sol`. However, storing high-volume procurement metadata—such as RFQ line items, sealed bid hashes, shipping manifest CIDs, carrier waybill tracking numbers, and validator review logs—directly on-chain would incur prohibitive gas overhead and perpetual storage bloat.

**Arkiv Network** provides a decentralized, queryable database layer with native wallet ownership and time-to-live (TTL) expiration:

```
+-----------------------------------------------------------------------------------+
|                              OpenAid Protocol Stack                                |
+-----------------------------------------------------------------------------------+
|  1. Settlement Layer (Arc Testnet, Chain ID 5042002)                              |
|     - OpenAidEscrow.sol (Zero-custody, CEI, 3-of-5 validator quorum, staged USDC) |
+-----------------------------------------------------------------------------------+
|  2. Decentralized Database Layer (Arkiv Rabdi Testnet, Chain ID 7794095)          |
|     - openaid.v1.requests: NGO humanitarian procurement tenders                   |
|     - openaid.v1.bids: Vendor sealed commitments & revealed bids                  |
|     - openaid.v1.evidence: Carrier waybills, IPFS manifest CIDs                   |
|     - openaid.v1.reviews: World ID verified validator attestations                |
+-----------------------------------------------------------------------------------+
|  3. Oracles & Verification                                                        |
|     - Chainlink CRE (Decentralized delivery evidence analysis)                    |
|     - World IDKit (Sybil-resistant unique human reviewer proofs)                  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Network Configuration

OpenAid targets the official **Arkiv Rabdi Testnet**:

| Parameter | Value | Description |
| :--- | :--- | :--- |
| **Network Identifier** | `rabdi` | Official Arkiv Testnet name |
| **Chain ID** | `7794095` | Arkiv Rabdi EVM chain ID |
| **RPC Endpoint** | `https://rpc.rabdi.db-chain.testnet.arkiv.network` | Public JSON-RPC endpoint |
| **Block Explorer** | `https://rabdi.explorer.arkiv.network` | Visual entity and transaction inspector |
| **Access Key Support** | Optional | Acceleration key obtained via [Arkiv Hub](https://hub.arkiv.network/access-keys) |

### Environment Variables

Configure these variables in `.env` or in deployment environments (e.g., Vercel):

```bash
# Network parameters
ARKIV_NETWORK="rabdi"
ARKIV_CHAIN_ID="7794095"
ARKIV_RPC_URL="https://rpc.rabdi.db-chain.testnet.arkiv.network"
NEXT_PUBLIC_ARKIV_RPC_URL="https://rpc.rabdi.db-chain.testnet.arkiv.network"

# Explorer URL
NEXT_PUBLIC_ARKIV_EXPLORER="https://rabdi.explorer.arkiv.network"

# Optional Access Key for rate-limit acceleration
ARKIV_ACCESS_KEY=""
NEXT_PUBLIC_ARKIV_ACCESS_KEY=""

# Optional Server Signer (Hex) for server-assisted workflows
ARKIV_SERVER_SIGNER_KEY=""

# Testing & Execution modes
ARKIV_MOCK_MODE="false"
RUN_ARKIV_NETWORK_TESTS="false"
```

---

## 3. Versioned Schemas (`openaid.v1.*`)

To prevent namespace collisions with other applications on the shared testnet, all schemas are defined under the versioned prefix `openaid.v1.*`. Only attributes required for sorting and filtering are marked as `.indexed()`.

### 1. Procurement Requests (`openaid.v1.requests`)
Created by NGO Campaign Coordinators to describe relief supply tenders:
- `campaignId` (`u64`, **indexed**): On-chain Arc campaign ID.
- `status` (`str`, **indexed**): Tender status (`Funding`, `OpenForBids`, `UnderReview`, `Settled`).
- `targetRegion` (`str`, **indexed**): Disaster relief operational area.
- `title` (`str`): Human-readable campaign tender title.
- `itemCategory` (`str`): Category of aid supplies (e.g., "Medical", "Shelter", "Rations").
- `itemCount` (`u64`): Total quantity required.
- `itemUnit` (`str`): Unit of measurement ("blankets", "kits", "liters").
- `budgetCeilingUSDC` (`u64`): Maximum allocated USDC budget.
- `metadataCid` (`str`): IPFS CID containing comprehensive requirements specifications.

### 2. Procurement Bids (`openaid.v1.bids`)
Created by participating vendors in the sealed-bid auction:
- `campaignId` (`u64`, **indexed**): Matching Arc campaign ID.
- `vendorAddress` (`addr`, **indexed**): Ethereum wallet address of the bidding supplier.
- `status` (`str`, **indexed**): Bid phase (`Committed`, `Revealed`, `Won`, `Lost`).
- `commitHash` (`str`): Keccak256 commitment hash bound to `(bidAmount, salt, vendorAddress)`.
- `revealedBidUSDC` (`u64`, optional): Revealed amount in USDC after auction reveal.

### 3. Delivery Evidence (`openaid.v1.evidence`)
Created by the winning vendor referencing proof of physical delivery:
- `campaignId` (`u64`, **indexed**): Associated Arc campaign ID.
- `vendorAddress` (`addr`, **indexed**): Supplier wallet address.
- `carrierName` (`str`, **indexed**): Logistics freight partner.
- `waybillNumber` (`str`): Freight tracking identifier.
- `manifestCid` (`str`): IPFS CID linking to signed delivery manifest and photos.
- `packageCount` (`u64`): Total freight containers or boxes.
- `verifiedItemCount` (`u64`): Checked unit count upon delivery.

### 4. Validator Reviews (`openaid.v1.reviews`)
Created by council members recording physical evidence audit decisions:
- `campaignId` (`u64`, **indexed**): Associated Arc campaign ID.
- `validatorAddress` (`addr`, **indexed**): Validator council member wallet.
- `decision` (`str`, **indexed**): Strict attestation decision (`APPROVE` or `REJECT`).
- `humanVerified` (`bool`): World IDKit zero-knowledge proof verification flag.
- `notes` (`str`): Auditor review commentary.

---

## 4. TTL Expiration Policies

Arkiv entities are time-scoped by design to eliminate long-term state bloat:

```typescript
export const ARKIV_EXPIRATION_POLICIES = {
  ProcurementRequest: ExpirationTime.fromDays(14), // 14-day auction tender window
  ProcurementBid: ExpirationTime.fromDays(7),       // 7-day bidding window
  DeliveryEvidence: ExpirationTime.fromDays(30),   // 30-day delivery audit retention
  ValidatorReview: ExpirationTime.fromDays(30),    // 30-day validator record
} as const;
```

### Expiration Strategy & Retention:
- During active operations, entities remain accessible via `publicClient.select().from(schema).where(...)`.
- The adapter supports `activeOnly: true` to automatically filter out expired records.
- For long-term audits beyond 30 days, critical state transitions and IPFS root CIDs remain permanently anchored on-chain in `OpenAidEscrow.sol` event logs.
- When an entity requires lifetime extension, `extendEntityWithWallet` can be called before expiration.

---

## 5. Wallet Ownership & Security Model

OpenAid adheres to strict zero-trust operational security guidelines:

1. **No Frontend Private Keys:**
   - Private keys are never placed in browser JavaScript, `NEXT_PUBLIC_*` variables, or client bundles.
2. **Cryptographic Signatures Required:**
   - Entities are created and mutated by transactions signed by the user's Web3 wallet (`createWalletClient` with MetaMask provider).
   - An unsigned `callerAddress` in an HTTP header or request body is **never** accepted as proof of identity.
3. **Privacy Violation Defense (`validatePublicSuitability`):**
   - All payloads are inspected prior to submission.
   - Payloads containing sensitive keywords (`password`, `privatekey`, `seed`, `ssn`, `passport`, `mnemonic`, etc.) are rejected immediately with `PrivacyViolation`.
4. **Ownership Verification:**
   - `verifyOwnership` enforces that only the entity creator can patch or extend an entity record.

---

## 6. Frontend & API Integration

### API Routes (`src/app/api/arkiv/route.ts`)
- `GET /api/arkiv`: Queries Rabdi testnet with optional filters (`type`, `campaignId`, `status`, `owner`, `activeOnly`, `limit`, `offset`).
- `POST /api/arkiv`: Server-assisted creation (strictly gated by `ARKIV_SERVER_SIGNER_KEY`).
- `PATCH /api/arkiv`: Server-assisted update verifying cryptographic or configured ownership.

### UI Experience (`src/app/page.tsx`)
- **Direct Explorer Links:** Every entity's `$key` links directly to `https://rabdi.explorer.arkiv.network/entity/0x...`.
- **Honest Empty State:** When zero records match, displays:
  > *"No Arkiv records found on Rabdi testnet for `openaid.v1.*` schemas. As campaigns, bids, and evidence are registered, their expiring metadata will be queryable here."*
- **Polymorphic Entity Card Renderer:** Adapts display dynamically based on whether the entity is a Request, Bid, Delivery Manifest, or Validator Review.
- **Refresh Control:** Allows on-demand refresh of query states directly from Rabdi testnet.

---

## 7. Verification & Testing

### Running the Arkiv Test Suite
```bash
# Run isolated unit, schema, invariant, and privacy tests (21 tests)
npm run test:arkiv

# Run with Hardhat runner
npx hardhat test test/arkiv.test.ts

# Optional: Run live Rabdi testnet roundtrip query against live schemas
RUN_ARKIV_NETWORK_TESTS=true npm run test:arkiv

# Run full protocol verification suite (77 tests)
npm run test:all
```
