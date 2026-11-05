# Arkiv Developer Experience & Integration Friction Points

## 1. Executive Summary & Context

This document captures truthful, engineering-grade feedback from integrating **Arkiv** into the OpenAid Protocol during the ETHGlobal hackathon. It outlines what worked seamlessly, specific friction points encountered during implementation, and concrete recommendations for the Arkiv developer tooling team.

---

## 2. What Worked Well

1. **Intuitive Entity Model (`owner` + `expiresAt`):**
   - The concept of wallet-owned, expiring shared entities mapped directly to our humanitarian procurement requirements.
   - Being able to define an `expiresAt` timestamp allowed us to implement automatic tender expiration without building complex cron backends or paying recurring gas fees for state pruning.
2. **Elimination of Web2 Database Infrastructure:**
   - For a multi-stakeholder protocol, avoiding the need to host a separate PostgreSQL or Redis instance dramatically streamlined the architecture and preserved decentralization.
3. **Natural Boundary with Smart Contracts:**
   - Keeping the high-stakes financial invariants (purpose-bound escrow, 3-of-5 quorum, staged settlement) on-chain while keeping rich textual tender specifications (500 blankets, item dimensions, carrier waybills) in Arkiv produced a clean, modular architecture.

---

## 3. Real Friction Points Encountered

### Friction 1: Local Development & Offline Mocking Support
- **Issue:** In hackathon environments with spotty convention Wi-Fi or when running automated CI pipelines (like GitHub Actions), connecting to live decentralized database testnets can cause intermittent test timeouts.
- **Workaround Implemented:** We authored an in-memory TypeScript adapter layer (`src/lib/arkiv/adapter.ts`) that emulates Arkiv's ownership, expiry, and querying rules for local tests and deterministic frontend presentations.
- **Recommendation for Arkiv:** Ship an official `@arkiv/mock` or `@arkiv/in-memory` package that implements the full client interface for headless unit testing and local offline development.

### Friction 2: TypeScript Generics & Schema Strictness
- **Issue:** While flexible JSON attribute storage is great for prototyping, complex production applications require compile-time type safety across entity schemas (e.g., verifying that a `ProcurementBid` includes `commitHash` and `revealedBidUSDC`).
- **Workaround Implemented:** We defined explicit TypeScript interfaces (`ProcurementRequestEntity`, `ProcurementBidEntity`) and cast entities within our adapter methods.
- **Recommendation for Arkiv:** Provide generic entity definitions in the SDK (e.g. `client.query<ProcurementRequestEntity>(...)`) to eliminate manual type casting.

### Friction 3: Hybrid Sync with Smart Contract Events
- **Issue:** Developers need to bridge the gap between an on-chain event (e.g. `AuctionFinalized` in Solidity) and the corresponding Arkiv entity status update (`status = "Won"`). If the user closes their browser between the contract transaction confirmation and the database entity update, states can briefly desynchronize.
- **Recommendation for Arkiv:** Introduce an automated relayer or DON hook (similar to Chainlink CRE or Webhooks) that can listen to EVM contract events and automatically update entity status fields on Arkiv.

### Friction 4: Public vs. Private Data Safeguards
- **Issue:** Because Arkiv is a public database, inexperienced developers might accidentally write private user data (such as refugee names, personal phone numbers, or private keys) into entity attributes.
- **Workaround Implemented:** We wrote an explicit validation interceptor (`validatePublicSuitability`) that screens payloads for sensitive keywords and rejects them before persistence.
- **Recommendation for Arkiv:** Include built-in client-side linter warnings in the SDK when field keys resemble common PII or credential identifiers.
