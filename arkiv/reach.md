# Arkiv Reach & Ecosystem Utility Analysis

## 1. Target Audience & Developer Reach

Arkiv addresses a critical infrastructure gap across several distinct Web3 sectors:

1. **Decentralized Physical Infrastructure Networks (DePIN) & Supply Chain:**
   - Real-world logistics applications require high-throughput entity updates (e.g., shipment waypoint check-ins, package handovers) that cannot afford L1/L2 gas for every micro-update.
   - Arkiv provides the missing shared-state layer where suppliers, carriers, and validators update logistics state with cryptographic ownership.
2. **Humanitarian & Public Goods DAOs:**
   - Charities, disaster relief DAOs, and grants councils (e.g. Gitcoin, UNICEF CryptoFund) need verifiable, queryable RFP registries.
   - Using Arkiv, anyone in the world can build specialized dashboards to track open relief tenders across any disaster region without asking for permission from a centralized API provider.
3. **Autonomous AI Agents & Multi-Party Coordination:**
   - As AI procurement agents negotiate prices and place bids, they need a tamper-evident, expiring memory store. Arkiv's entity model serves as decentralized agent memory.

---

## 2. Value Comparison vs. Existing Paradigms

| Feature | Raw IPFS / Filecoin | Traditional Web2 DB (Postgres/Supabase) | The Graph / Subgraphs | Arkiv Network |
| :--- | :--- | :--- | :--- | :--- |
| **Queryability** | No native queries; requires external indexer. | High SQL query flexibility, but centralized. | High GraphQL queries, but index-only (read-only reflections of on-chain events). | **Native JSON/attribute queries over decentralized entities.** |
| **Ownership** | Anyone can re-pin or reference a CID; no wallet write-guards. | API keys / server sessions (custodial). | Smart contract permissions only. | **Native wallet-signed ownership per entity.** |
| **State Expiration (TTL)** | Pinned forever until unpinned; garbage collection is manual. | Manual cron jobs or database triggers. | Permanent blockchain history. | **Native `expiresAt` pruning for time-scoped shared state.** |
| **Cost Profile** | Storage fees / pin provider subscription. | Ongoing cloud server rental. | Indexing fees / GRT query fees. | **Low compute/storage cost powered by Golem Network.** |

---

## 3. Honest Hackathon Scope & Observed Reach

During this initial MVP implementation:
- **Demonstrated Reach:** OpenAid integrates Arkiv directly into the Next.js frontend, demonstrating that updating an Arkiv entity (e.g. changing bid status from `Committed` to `Revealed`) dynamically alters the procurement UI and validator screens without re-deploying or executing high-cost on-chain storage writes.
- **Future Growth:** Connecting local Arkiv adapters to the live Golem Network testnet nodes for cross-organization multi-client replication.
