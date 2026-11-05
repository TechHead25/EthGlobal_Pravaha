# Chainlink Runtime Environment (CRE) Workflow — OpenAid Delivery Verification

## 1. Overview & Purpose

The **Chainlink Runtime Environment (CRE)** orchestration layer connects off-chain logistics verification, carrier tracking systems, and satellite/geofence checks to the OpenAid Protocol.

This workflow takes an off-chain delivery evidence reference (IPFS CID), calls external verification checks across multiple Decentralized Oracle Network (DON) nodes, validates the evidence structure, and outputs a bounded cryptographic decision.

---

## 2. Bounded Authority & Safety Boundaries

> **CRITICAL SECURITY REQUIREMENT:**  
> **The CRE workflow output CANNOT unilaterally disburse funds, bypass the 3-of-5 validator quorum, override the contract's state machine, or extinguish dispute rights.**

### Authority Scope:
- **What CRE Does:**
  1. Validates that the submitted IPFS CID conforms to canonical delivery schemas (`bafy...`).
  2. Confirms shipment delivery status with logistics carrier tracking APIs.
  3. Validates that the delivered quantity satisfies the campaign RFP (e.g. 500 blankets).
  4. Verifies GPS geofence coordinates against the designated disaster perimeter.
  5. Computes a confidence score and produces an advisory attestation digest.
- **What CRE CANNOT Do:**
  - Cannot trigger `executeStage1Settlement` directly.
  - Cannot bypass human validators.
  - The attestation serves as a verified input signal presented in the Validator Portal to assist human reviewers in casting their on-chain votes.

---

## 3. Network Compatibility & Arc Integration Status

### Current Status: Isolated TypeScript CRE Simulation
- **Network Limitation:** Arc is an emerging stablecoin Layer 1 blockchain currently supported primarily via Arc Studio and custom RPC endpoints. Official Chainlink DON feeds and native CRE forwarder contracts on Arc testnets have not yet been released or verified for direct on-chain callback dispatch.
- **Implementation Strategy:** In accordance with protocol guidelines, the CRE workflow is isolated and executed in TypeScript via the CRE runtime interface ([`workflow.ts`](./workflow.ts)).
- **Simulation Runner:** Developers and judges can simulate the workflow directly using:
  ```bash
  npm run test:cre
  # or
  npx tsx chainlink-cre/runner.ts
  ```

---

## 4. Verification & Testing

The automated test suite in [`test/cre.test.ts`](file:///c:/Projects/EthGLobal/test/cre.test.ts) verifies:
1. **Happy Path:** Valid carrier waybill + 500 blankets + Flood Zone 4 coordinates -> 100/100 score (`APPROVE_FOR_HUMAN_REVIEW`).
2. **Under-Delivery Failure:** 450 blankets submitted (< 500 required) -> Rejected.
3. **Out-of-Bounds GPS Failure:** Delivery coordinates outside disaster zone -> Rejected.
4. **Invalid Manifest CID:** Malformed CID string -> Rejected.
