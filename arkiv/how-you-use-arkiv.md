# How OpenAid Uses Arkiv

## 1. Integration Topology & Entity Schemas

OpenAid uses Arkiv as the decentralized coordination and query layer for all procurement lifecycles, offloading heavy textual data and filterable states from the smart contract while preserving cryptographic integrity.

The integration is encapsulated in [`src/lib/arkiv/adapter.ts`](file:///c:/Projects/EthGLobal/src/lib/arkiv/adapter.ts) and [`src/lib/arkiv/types.ts`](file:///c:/Projects/EthGLobal/src/lib/arkiv/types.ts).

---

## 2. Core Entity Definitions

### 2.1. `ProcurementRequestEntity`
Represents an NGO's call for relief supplies.

```typescript
export interface ProcurementRequestEntity extends ArkivEntityBase {
  type: "ProcurementRequest";
  campaignId: number;
  title: string;              // e.g. "Emergency Thermal Blankets (500 units)"
  itemCategory: string;       // e.g. "Disaster Shelter & Warmth"
  itemCount: number;          // 500
  itemUnit: string;           // "blankets"
  budgetCeilingUSDC: number;  // 10,000
  targetRegion: string;       // "Flood Zone 4, District Delta"
  status: "Funding" | "OpenForBids" | "UnderReview" | "Delivered" | "Settled" | "Expired";
  metadataCid: string;        // IPFS link to full document
  owner: string;              // NGO wallet address
  expiresAt: number;          // Automatic TTL expiration
}
```

### 2.2. `ProcurementBidEntity`
Represents a supplier's bid submission.

```typescript
export interface ProcurementBidEntity extends ArkivEntityBase {
  type: "ProcurementBid";
  campaignId: number;
  vendorAddress: string;
  commitHash: string;         // On-chain sealed bid hash
  revealedBidUSDC?: number;   // Revealed price after reveal window opens
  status: "Committed" | "Revealed" | "Won" | "Lost" | "Expired";
  owner: string;              // Vendor wallet address
}
```

### 2.3. `DeliveryEvidenceEntity`
Records shipping and physical handover references.

```typescript
export interface DeliveryEvidenceEntity extends ArkivEntityBase {
  type: "DeliveryEvidence";
  campaignId: number;
  vendorAddress: string;
  manifestCid: string;        // IPFS CID of photos and waybills
  carrierName: string;        // e.g. "Regional Logistics Express"
  waybillNumber: string;      // Tracking reference
  packageCount: number;       // e.g. 50 pallets
  verifiedItemCount: number;  // 500 blankets
  owner: string;              // Winning vendor wallet
}
```

---

## 3. Querying & Updating Arkiv Entities

### Creating a Procurement Request (NGO)
```typescript
import { arkiv } from "@/lib/arkiv/adapter";

const request = await arkiv.createEntity({
  id: `req_campaign_${campaignId}`,
  type: "ProcurementRequest",
  owner: ngoWalletAddress,
  createdAt: Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + (86400 * 14), // 14 days
  campaignId: 1,
  title: "Emergency Thermal Blankets (500 units) - Flood Relief",
  itemCategory: "Disaster Shelter & Warmth",
  itemCount: 500,
  itemUnit: "blankets",
  budgetCeilingUSDC: 10000,
  targetRegion: "Flood Zone 4, District Delta",
  status: "OpenForBids",
  metadataCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
}, ngoWalletAddress);
```

### Querying Active Relief Tenders in the Frontend
```typescript
// Query all active requests in real-time
const activeTenders = await arkiv.queryEntities({
  type: "ProcurementRequest",
  activeOnly: true,
  status: "OpenForBids"
});
```

### Enforcing Cryptographic Ownership
If an unauthorized account attempts to mutate the tender status:
```typescript
// Throws: "UnauthorizedUpdate: Caller 0xAttacker is not the owner of req_campaign_1"
await arkiv.updateEntity("req_campaign_1", { status: "Settled" }, attackerAddress);
```

---

## 4. Privacy Boundary
Arkiv stores public metadata only. The adapter contains automated safety checks (`validatePublicSuitability`) that block any payload containing private keys, passwords, seed phrases, or sensitive recipient identification (e.g. refugee names or national ID numbers).
