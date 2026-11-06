# Chainlink Runtime Environment (CRE) — OpenAid Delivery Verification Module

> **Decentralized Humanitarian Aid Evidence Verification & Cross-Referencing Oracle**
> Built for ETHGlobal Mumbai. Operates in conjunction with **Arc Testnet** (`OpenAidEscrow.sol`), **Arkiv Network** (Decentralized Database), and **World ID** (Sybil-resistant Human Validator Quorum).

---

## 1. Executive Summary & Purpose

The **Chainlink Runtime Environment (CRE)** orchestration layer provides decentralized, verifiable data-processing and evidence cross-referencing for the OpenAid Protocol.

When a winning vendor submits a delivery claim for a funded humanitarian aid campaign (e.g., 500 emergency blankets to Flood Zone 4), the protocol must verify external logistical records—carrier tracking status, destination GPS coordinates, IPFS manifest integrity, and item quantities—before human validators cast their on-chain votes.

CRE solves this by executing multi-node off-chain verification across a **Decentralized Oracle Network (DON)**, aggregating findings through Byzantine Fault Tolerant (BFT) consensus, and generating an advisory cryptographic attestation digest.

---

## 2. The Prime Protocol Invariant & Trust Boundaries

> [!IMPORTANT]
> **CARDINAL PROTOCOL INVARIANT & BOUNDED AUTHORITY:**
> **The Chainlink CRE workflow output CANNOT unilaterally disburse funds, trigger smart contract state transitions, bypass the 3-of-5 human validator quorum, or extinguish donor dispute rights.**

### What CRE Does (and Proves)
1. **IPFS Manifest Integrity:** Verifies that the submitted delivery manifest CID (`bafy...` or `Qm...`) conforms to canonical multihash encoding and links to valid public evidence metadata.
2. **Carrier Logistics Verification:** Queries external freight carrier tracking APIs (e.g., Regional Humanitarian Logistics, DHL, UN Logistics Cluster) to confirm that the waybill is officially marked `DELIVERED` with recipient sign-off.
3. **Spatial Geofencing:** Verifies that the delivery GPS coordinates (latitude, longitude) fall strictly within the NGO's designated disaster relief perimeter (e.g., Flood Zone 4) using Haversine radial distance and boundary box algorithms.
4. **Item Quantity Cross-Check:** Verifies that the delivered quantity satisfies the campaign RFP budget ceiling (e.g. $\ge 500$ blankets).
5. **Multi-Node DON Consensus:** Multiple independent oracle nodes verify the evidence concurrently and aggregate results via BFT supermajority consensus ($> 2/3$).
6. **Cryptographic Attestation:** Outputs a deterministic attestation digest (`cre_attest_<campaignId>_<cidPrefix>_<timestamp>`).

### What CRE CANNOT Do
- **Cannot directly call `executeStage1Settlement()` on Arc Testnet.**
- **Does NOT claim to verify physical delivery on the ground magically without humans:** Software verifies digital records and sensor telemetry; human on-the-ground validators provide final ground truth.
- **The CRE attestation is strictly BOUNDED ADVISORY:** It is presented in the Validator Portal to give human reviewers high-confidence cryptographic signals when submitting their on-chain signatures to `OpenAidEscrow.sol`.

---

## 3. Four-Tier Execution Architecture

To ensure transparent verification and prevent conflation between simulations and production oracles, this integration clearly distinguishes four execution tiers:

```
+-----------------------------------------------------------------------------------+
|                        Chainlink CRE Execution Tiers                              |
+-----------------------------------------------------------------------------------+
| Tier 1: Unit & Negative Testing (`test/cre.test.ts`)                              |
|   - Isolated mocha/chai unit tests for parsing, geofences, and edge cases.        |
+-----------------------------------------------------------------------------------+
| Tier 2: Multi-Node DON Simulation (`chainlink-cre/simulate.ts`)                   |
|   - Multi-node DON consensus simulation (4 nodes, 2/3 BFT threshold, rogue node). |
+-----------------------------------------------------------------------------------+
| Tier 3: Official CRE SDK Workflow (`chainlink-cre/workflow.ts` + `workflow.yaml`) |
|   - Conforms to `@chainlink/cre-sdk` structure with HTTP trigger & capabilities.   |
|   - Compiles to WASM via `cre workflow build`.                                    |
|   - Local node simulation via `cre workflow simulate`.                            |
+-----------------------------------------------------------------------------------+
| Tier 4: Live Chainlink Workflow DON Deployment (`cre workflow deploy`)            |
|   - Deploys compiled WASM artifact to Chainlink Workflow Registry on-chain.       |
|   - Dispatches authenticated callbacks once Arc Testnet forwarders are live.      |
+-----------------------------------------------------------------------------------+
```

---

## 4. Trigger Model & Workflow Lifecycle

### Trigger Specification
- **Trigger Type:** `HTTP` Webhook Trigger (`POST /verify-delivery`)
- **Invocation:** Triggered by the OpenAid web client (`/api/cre-verify`) when a vendor submits physical delivery evidence.
- **Alternative Trigger:** EVM Log Trigger (`logTrigger` listening for `EvidenceSubmitted(uint256 campaignId, string manifestCid)` emitted by `OpenAidEscrow.sol`).

### Capabilities Invoked
- `HTTPClient`: Fetches carrier tracking telemetry from logistics gateways.
- `SpatialGeofencing`: Evaluates coordinates against predefined disaster zones (`Flood Zone 4`, `District Delta`, `Disaster Sector A`).
- `ManifestValidator`: Validates multihash encoding and links to Arkiv Network database entities.
- `DONConsensusEngine`: BFT consensus aggregator requiring $\lceil N \times 2/3 \rceil$ node agreement.

---

## 5. Input & Output Schemas

### Input Schema (`CreWorkflowInput`)
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

### Output Schema (`CreVerificationResult`)
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
