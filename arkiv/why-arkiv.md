# Why Arkiv for OpenAid Protocol

## 1. The Core Architectural Dilemma

When designing a decentralized humanitarian procurement protocol like **OpenAid**, engineers encounter a fundamental architectural trade-off between **blockchain gas costs** and **centralized database vulnerability**:

1. **On-Chain EVM Storage Is Prohibitive:** Storing itemized bills of quantities, multi-page relief specifications (e.g. 500 blankets with thermal ratings, packing specifications, delivery coordinates), and full vendor bid profiles directly in Solidity storage slots costs hundreds of dollars in L1 gas and tens of thousands of gas units even on L2s.
2. **Traditional Web2 Databases Re-Introduce Single Points of Failure:** Hosting procurement requests on AWS RDS, Firebase, or MongoDB gives the server administrator or NGO IT department unilateral control. A compromised server can silently alter item requirements, delete competing bids, or falsify tender status, defeating the core purpose of a decentralized protocol.
3. **Raw IPFS Lacks Queryability:** While IPFS provides content-addressed immutability, raw CIDs cannot be filtered, indexed, or queried without standing up specialized subgraphs or centralized indexers. Furthermore, raw IPFS pins persist indefinitely without native time-based expiration.

---

## 2. The Solution: Arkiv Decentralized Database

**Arkiv** solves this trilemma by providing a decentralized, queryable, wallet-owned Web3 database powered by the Ethereum and Golem Network ecosystem.

```
+---------------------------------------------------------------------------------------+
|                                    OPENAID PROTOCOL                                   |
|                                                                                       |
|   +------------------------------------+     +------------------------------------+   |
|   |         ON-CHAIN (Arc / EVM)       |     |          ARKIV DB NETWORK          |   |
|   |------------------------------------|     |------------------------------------|   |
|   | - Purpose-bound USDC escrow        |     | - Wallet-owned procurement tenders |   |
|   | - Commit-reveal bid hashes         | <-> | - Itemized specs (500 blankets)    |   |
|   | - 3-of-5 validator quorum state    |     | - Queryable public vendor bids     |   |
|   | - Staged 70/30 fund settlements    |     | - Time-scoped expiring shared state|   |
|   +------------------------------------+     +------------------------------------+   |
+---------------------------------------------------------------------------------------+
```

### Key Advantages for OpenAid:

1. **Wallet-Owned Entities:** Every procurement request is cryptographically bound to the NGO coordinator's wallet address. Every bid is bound to the vendor's wallet address. Non-owners cannot mutate or overwrite entities.
2. **Native Time-Scoped Expiration (`expiresAt`):** Emergency disaster relief requests are time-sensitive. If an aid campaign expires or is canceled, Arkiv's time-scoped storage ensures stale requests automatically prune from active index queries, preventing UI clutter and state bloat.
3. **Rich Query Filtering:** The frontend can filter tenders by category (`itemCategory == "Disaster Shelter & Warmth"`), status (`status == "OpenForBids"`), and active timeframe without requiring a centralized backend API.
4. **Tamper-Evident Coordination:** Donors, vendors, and auditors can independently verify that procurement parameters published in Arkiv match the cryptographic hash committed to the on-chain escrow contract.
