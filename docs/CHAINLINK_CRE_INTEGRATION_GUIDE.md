# OpenAid Protocol — Chainlink CRE Integration Guide

> **Architecture, Security Invariants & Operational Runbook:** Production-grade verifiable delivery evidence processing, logistics tracking verification, and spatial geofencing via the Chainlink Runtime Environment (CRE).

---

## 1. System Overview & Architectural Role

In OpenAid Protocol, financial custody and delivery settlement are strictly governed on **Arc Testnet** by `OpenAidEscrow.sol`. However, determining whether a vendor has fulfilled physical delivery requirements (e.g. delivering 500 winter blankets to a disaster-stricken flood zone) requires cross-referencing off-chain data sources:
1. Public content-addressed evidence manifests stored on **IPFS** (`bafy...`).
2. Live shipment tracking from logistics carriers (e.g. DHL, FedEx, Regional Humanitarian Freight).
3. GPS spatial geofencing relative to designated emergency relief perimeters.
4. Persistent public metadata stored in **Arkiv Network** (Rabdi Testnet).

The **Chainlink Runtime Environment (CRE)** acts as the decentralized orchestration and verification oracle connecting these external data sources to OpenAid Protocol:

```
+-----------------------------------------------------------------------------------+
|                              OpenAid Protocol Stack                                |
+-----------------------------------------------------------------------------------+
|  1. Settlement Layer (Arc Testnet, Chain ID 5042002)                              |
|     - OpenAidEscrow.sol (Zero-custody, CEI, 3-of-5 human validator quorum)         |
+-----------------------------------------------------------------------------------+
|  2. Decentralized Database Layer (Arkiv Rabdi Testnet, Chain ID 7794095)          |
|     - openaid.v1.evidence: Carrier waybills, IPFS manifest CIDs                   |
|     - openaid.v1.reviews: World ID verified validator attestations                |
+-----------------------------------------------------------------------------------+
|  3. Oracles & Verifiable Computation                                              |
|     - Chainlink CRE (Decentralized delivery evidence analysis & DON consensus)    |
|     - World IDKit (Sybil-resistant unique human reviewer proofs)                  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Cardinal Protocol Invariant & Trust Boundaries

> [!IMPORTANT]
> **IMMUTABLE TRUST BOUNDARY:**
> **The Chainlink CRE workflow output is strictly BOUNDED ADVISORY. It CANNOT unilaterally trigger smart contract settlement, disburse escrowed USDC, or bypass the 3-of-5 human validator quorum.**

### Scope of Authority
- **What CRE Does (and Proves):**
  - **Manifest Integrity:** Verifies IPFS CIDv0/CIDv1 format, multihash structure, and reachability.
  - **Carrier Tracking Gateway:** Connects to freight carrier APIs to confirm official `DELIVERED` status and recipient sign-off.
  - **Spatial Geofencing:** Computes Haversine great-circle distance and boundary containment to ensure delivery coordinates lie within the NGO's target perimeter (e.g., Flood Zone 4, District Delta).
  - **Quantity Cross-Reference:** Verifies claimed quantities satisfy the campaign RFP specifications.
  - **DON Supermajority Consensus:** Executes multi-node verification across independent Decentralized Oracle Network (DON) nodes using Byzantine Fault Tolerance ($> 2/3$ agreement).
  - **Cryptographic Attestation:** Emits a deterministic attestation digest (`cre_attest_<campaignId>_<cidPrefix>_<timestamp>`).
- **What CRE CANNOT Do:**
  - **Cannot bypass human validators:** No oracle can magically guarantee physical ground reality without on-the-ground human inspection. CRE validates *verifiable digital records*, which human validators review alongside photographic evidence before casting on-chain votes.
  - **Cannot trigger `executeStage1Settlement()` directly:** On-chain fund movement requires 3 distinct cryptographic signatures from registered validators in `OpenAidEscrow.sol`.

---

## 3. Four-Tier Execution Architecture

To prevent misrepresenting local simulations as live network executions, OpenAid Protocol enforces four distinct execution tiers:

| Tier | Name | Environment | Description |
| :--- | :--- | :--- | :--- |
| **Tier 1** | Unit & Adversarial Tests | Local (`npm run test:cre`) | 21 comprehensive Mocha/Chai tests covering schema validation, edge cases, failure states, and determinism. |
| **Tier 2** | Multi-Node DON Simulation | Local CLI (`npx tsx chainlink-cre/simulate.ts`) | Simulates 4 independent DON nodes executing off-chain checks with BFT consensus aggregation and Byzantine node injection. |
| **Tier 3** | Official CRE SDK Workflow | Local CRE CLI (`cre workflow simulate`) | Authentic `@chainlink/cre-sdk` workflow compiled to WebAssembly (`wasm-v1`) and executed via the CRE CLI runtime. |
| **Tier 4** | Live Chainlink DON Deployment | Testnet (`cre workflow deploy`) | Deployed to the public Chainlink Workflow Registry once native Arc Testnet CRE Forwarders are released. |

---

## 4. Trigger Model & Workflow Lifecycle

### Trigger Specification
- **Primary Trigger:** HTTP Webhook Trigger (`POST /verify-delivery`). Invoked by the web client or server API (`/api/cre-verify`) when a vendor submits delivery evidence.
- **Alternative Trigger:** EVM Log Trigger (`logTrigger`). In on-chain production environments, the workflow listens for `EvidenceSubmitted(uint256 indexed campaignId, string manifestCid)` emitted by `OpenAidEscrow.sol`.

### Capabilities Invoked
- `HTTPClient`: Performs authenticated or public HTTP requests to carrier logistics gateways.
- `SpatialGeofencing`: Evaluates coordinates against predefined disaster zones (`Flood Zone 4`, `District Delta`, `Disaster Sector A`).
- `ManifestValidator`: Validates multihash encoding and links to Arkiv Network database entities.
- `DONConsensusEngine`: BFT consensus aggregator requiring $\lceil N \times 2/3 \rceil$ node agreement.

---

## 5. Input & Output Schemas

### Input Payload (`CreWorkflowInput`)
```typescript
interface CreWorkflowInput {
  campaignId: number;              // Positive integer > 0
  vendorAddress: string;           // 42-char hexadecimal Ethereum address
  manifestCid: string;             // Canonical IPFS CID (bafy... or Qm...)
  carrierName: string;             // Shipping carrier name (1-120 chars)
  waybillNumber: string;           // Waybill tracking reference (>= 4 chars)
  claimedItemCount: number;        // Quantity delivered (integer > 0)
  targetRegion: string;            // Designated disaster zone name
  coordinates: {
    latitude: number;              // Float between -90 and 90
    longitude: number;             // Float between -180 and 180
  };
  requiredItemCount?: number;      // Optional RFP requirement (default 500)
  arkivEvidenceId?: string;        // Optional Arkiv entity ID
  carrierEndpointUrl?: string;     // Optional custom carrier API gateway
}
```

### Output Report (`CreVerificationResult`)
```typescript
interface CreVerificationResult {
  campaignId: number;
  manifestCid: string;
  isVerified: boolean;             // True only if ALL capabilities pass + DON consensus reached
  confidenceScore: number;         // 0 - 100 median confidence score
  checks: {
    manifestIntegrity: boolean;
    carrierDeliveryConfirmed: boolean;
    itemCountSatisfied: boolean;
    geoCoordinatesInZone: boolean;
    donConsensusReached: boolean;
  };
  attestationDigest: string;       // cre_attest_<campaignId>_<cidPrefix>_<timestamp>
  timestamp: number;
  recommendation: "APPROVE_FOR_HUMAN_REVIEW" | "REJECT_ANOMALOUS_EVIDENCE";
  reason: string;
  executionMode: CreExecutionMode;
  carrierDetails?: CarrierTrackingResponse;
  geofenceDetails?: {
    matchedZone?: string;
    distanceKmFromCenter?: number;
  };
  donConsensus?: DonConsensusResult;
}
```

---

## 6. Official Chainlink CRE CLI Commands & Runbook

For environments with the Chainlink CRE CLI installed:

### Step 1: Install CRE SDK & Tooling
```bash
# Verify CRE CLI installation
cre version

# Install SDK dependencies
npm install @chainlink/cre-sdk
```

### Step 2: Validate & Build Workflow WASM Artifact
```bash
# Compile TypeScript workflow to WebAssembly binary target
cre workflow build --manifest chainlink-cre/workflow.yaml
```

### Step 3: Run Local CRE Workflow Simulation
```bash
# Simulate the workflow locally with real or mocked inputs
cre workflow simulate \
  --manifest chainlink-cre/workflow.yaml \
  --input '{"campaignId":1,"vendorAddress":"0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65","manifestCid":"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi","carrierName":"Regional Humanitarian Freight Logistics","waybillNumber":"RELIEF-BLANKETS-2026-0042","claimedItemCount":500,"targetRegion":"Flood Zone 4","coordinates":{"latitude":14.5995,"longitude":120.9842}}'
```

### Step 4: Deploy Workflow to Chainlink DON
```bash
# Deploy to Chainlink Workflow Registry
cre workflow deploy \
  --manifest chainlink-cre/workflow.yaml \
  --network testnet
```

---

## 7. Local Repository Runbook & Testing

You can run and test the complete CRE workflow locally without external network dependencies:

### Execute the CLI Runner
```bash
npx tsx chainlink-cre/runner.ts
```

### Execute Multi-Scenario Simulation (including BFT Fault Tolerance)
```bash
npx tsx chainlink-cre/simulate.ts
```

### Run Automated Mocha / Chai Test Suite
```bash
npm run test:cre
```

---

## 8. Network Limitations & Future Arc Forwarder Integration
- **Arc Testnet Status:** Arc is a high-speed stablecoin L1 with native USDC gas fees. Official Chainlink DON feeds and CRE Forwarder contracts have not yet been deployed natively on Arc Testnet (Chain ID 5042002).
- **Interim Architecture:** Verification occurs off-chain via DON consensus simulation and Next.js server routes. The resulting cryptographic attestation digest is submitted alongside human validator signatures in `OpenAidEscrow.sol`.
- **Future Roadmap:** Once Chainlink announces native Arc Testnet Forwarders or CCIP support, the workflow can directly dispatch consensus attestations to an `OpenAidCREForwarder.sol` contract on-chain.
