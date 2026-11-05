# OpenAid Protocol — Data Schemas, Events & Storage Architecture

## 1. On-Chain Data Architecture & Storage Layout

To minimize gas costs on EVM networks while ensuring auditability, state variables are optimized for storage slot packing (32-byte words).

### 1.1. Campaign Data Structure
```solidity
struct CampaignStorage {
    // Slot 0: 20 bytes (creator) + 1 byte (state) + 8 bytes (fundingDeadline) = 29 bytes
    address creator;              // Address of the initiating NGO coordinator
    uint8 state;                  // Current CampaignState enum
    uint64 fundingDeadline;       // Unix epoch timestamp
    
    // Slot 1: 32 bytes
    uint256 budgetCeiling;        // Budget ceiling in token base units (e.g. 10,000 * 10^6)
    
    // Slot 2: 20 bytes (vendor) + 8 bytes (deliveryDeadline) = 28 bytes
    address winningVendor;        // Selected vendor after reveal
    uint64 deliveryDeadline;      // Unix epoch timestamp for physical delivery
    
    // Slot 3: 32 bytes
    uint256 winningBidAmount;     // Final lowest revealed bid amount
    
    // Slot 4: 32 bytes (Dynamic string pointer)
    string metadataCid;           // IPFS CID of campaign tender specifications
}
```

### 1.2. Escrow Accounting Storage
```solidity
struct EscrowStorage {
    uint256 totalDeposited;       // Cumulative donor deposits
    uint256 stage1Disbursed;      // Amount transferred in Stage 1 (70%)
    uint256 stage2Disbursed;      // Amount transferred in Stage 2 (30%)
    uint64 challengeExpiry;       // Unix epoch timestamp for end of challenge window
    bool isDisputed;              // Flag indicating active dispute
}

// Separate mapping slots for O(1) balance lookups
mapping(uint256 => mapping(address => uint256)) public donorContributions;
```

---

## 2. On-Chain Event Definitions & Indexing

Events are indexed (`indexed` keyword) on critical lookup keys (`campaignId`, `donor`, `vendor`, `validator`) to support reactive frontend state updates and decentralized subgraph indexers (e.g., The Graph or Goldsky).

```solidity
// Campaign Management
event CampaignCreated(
    uint256 indexed campaignId,
    address indexed creator,
    uint256 budgetCeiling,
    uint256 fundingDeadline,
    uint256 deliveryDeadline,
    string metadataCid
);
event CampaignStateChanged(uint256 indexed campaignId, uint8 previousState, uint8 newState);

// Escrow & Settlement
event FundsDeposited(uint256 indexed campaignId, address indexed donor, uint256 amount);
event CampaignFunded(uint256 indexed campaignId, uint256 totalEscrowed);
event Stage1Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount);
event Stage2Settled(uint256 indexed campaignId, address indexed vendor, uint256 payoutAmount);
event RefundClaimed(uint256 indexed campaignId, address indexed donor, uint256 refundAmount);

// Auction & Bidding
event BidCommitted(uint256 indexed campaignId, address indexed vendor, bytes32 commitHash, uint256 bond);
event BidRevealed(uint256 indexed campaignId, address indexed vendor, uint256 bidAmount);
event AuctionFinalized(uint256 indexed campaignId, address indexed winningVendor, uint256 winningBid);

// Verification & Quorum
event EvidenceSubmitted(uint256 indexed campaignId, address indexed vendor, string ipfsCid, uint256 timestamp);
event VoteCast(uint256 indexed campaignId, address indexed validator, bool approved);
event QuorumReached(uint256 indexed campaignId, uint256 affirmativeVotes);
event DisputeRaised(uint256 indexed campaignId, address indexed challenger, string counterEvidenceCid);
event DisputeResolved(uint256 indexed campaignId, bool disputeUpheld);
```

---

## 3. Off-Chain IPFS Delivery Evidence Manifest Schema

When a vendor fulfills relief supplies, they compile and sign a structured JSON manifest pinned to IPFS.

### Canonical Delivery Manifest JSON Schema (`openaid-delivery-v1.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "OpenAidDeliveryManifest",
  "type": "object",
  "required": [
    "manifestVersion",
    "campaignId",
    "vendorAddress",
    "timestamp",
    "deliveryLocation",
    "suppliesSummary",
    "evidenceMedia",
    "logisticsVerification",
    "manifestSignature"
  ],
  "properties": {
    "manifestVersion": { "type": "string", "const": "1.0.0" },
    "campaignId": { "type": "integer", "minimum": 1 },
    "vendorAddress": { "type": "string", "pattern": "^0x[a-fA-F0-9]{40}$" },
    "timestamp": { "type": "integer", "description": "Unix timestamp of packaging" },
    "deliveryLocation": {
      "type": "object",
      "required": ["latitude", "longitude", "regionName"],
      "properties": {
        "latitude": { "type": "number", "minimum": -90, "maximum": 90 },
        "longitude": { "type": "number", "minimum": -180, "maximum": 180 },
        "regionName": { "type": "string" },
        "recipientCenter": { "type": "string" }
      }
    },
    "suppliesSummary": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["itemCode", "itemName", "quantity", "unit"],
        "properties": {
          "itemCode": { "type": "string" },
          "itemName": { "type": "string" },
          "quantity": { "type": "integer", "minimum": 1 },
          "unit": { "type": "string" }
        }
      }
    },
    "evidenceMedia": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["cid", "mimeType", "caption", "mediaType", "captureTimestamp"],
        "properties": {
          "cid": { "type": "string" },
          "mimeType": { "type": "string", "enum": ["image/jpeg", "image/png", "application/pdf"] },
          "caption": { "type": "string" },
          "mediaType": { "type": "string", "enum": ["loading_dock", "transport_in_transit", "on_site_unloading", "inspector_handover"] },
          "captureTimestamp": { "type": "integer" }
        }
      }
    },
    "logisticsVerification": {
      "type": "object",
      "required": ["waybillNumber", "carrierName", "billOfLadingCid"],
      "properties": {
        "waybillNumber": { "type": "string" },
        "carrierName": { "type": "string" },
        "billOfLadingCid": { "type": "string" }
      }
    },
    "manifestSignature": {
      "type": "string",
      "description": "EIP-712 or ECDSA signature of the manifest digest signed by vendorAddress"
    }
  }
}
```

---

## 4. Privacy, Safety & Ethical Considerations

Aid distribution occurs in sensitive, often hazardous geopolitical contexts involving vulnerable populations. OpenAid enforces strict privacy rules:

1. **Strict Exclusion of Recipient PII:**
   - Public IPFS manifests must **never** include names, government identity numbers, phone numbers, or clear facial photographs of disaster victims or minors.
   - Handover documentation relies on institutional signatures (e.g. clinic administrator, camp manager) rather than individual beneficiary identification.
2. **Geographical Precision Blinding:**
   - In conflict regions, exact real-time GPS coordinates of warehouses can expose relief stockpiles to military attacks or theft.
   - For sensitive relief categories, coordinates may be coarse-grained (e.g., district or sector level rather than exact latitude/longitude building coordinates).
3. **Immutable Public Data:**
   - All data committed to IPFS and the blockchain is permanently public and cannot be erased. Contributors and vendors must be warned in the UI before committing data.

---

## 5. Subgraph & Indexer Entity Model

For high-performance frontend queries, the subgraphs will track the following GraphQL schema:

```graphql
type Campaign @entity {
  id: ID! # campaignId
  creator: Bytes!
  budgetCeiling: BigInt!
  totalDeposited: BigInt!
  fundingDeadline: BigInt!
  deliveryDeadline: BigInt!
  state: String!
  winningVendor: Bytes
  winningBidAmount: BigInt
  evidenceIpfsCid: String
  stage1Disbursed: BigInt!
  stage2Disbursed: BigInt!
  challengeExpiry: BigInt
  isDisputed: Boolean!
  bids: [BidCommitment!]! @derivedFrom(field: "campaign")
  votes: [ValidatorVote!]! @derivedFrom(field: "campaign")
  donations: [Donation!]! @derivedFrom(field: "campaign")
}

type Donation @entity {
  id: ID! # campaignId - donorAddress
  campaign: Campaign!
  donor: Bytes!
  amount: BigInt!
  refunded: Boolean!
}

type BidCommitment @entity {
  id: ID! # campaignId - vendorAddress
  campaign: Campaign!
  vendor: Bytes!
  commitHash: Bytes!
  revealedBid: BigInt
  bondAmount: BigInt!
  isWinner: Boolean!
}

type ValidatorVote @entity {
  id: ID! # campaignId - validatorAddress
  campaign: Campaign!
  validator: Bytes!
  approved: Boolean!
  timestamp: BigInt!
}
```
