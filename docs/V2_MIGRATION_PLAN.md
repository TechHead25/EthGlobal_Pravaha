# OpenAid Protocol V2 — Migration & Deployment Plan

> **Strategy:** New Versioned Contract Deployment (`OpenAidEscrowV2.sol`)  
> **Target Network:** Arc Testnet (Chain ID `5042002`)  
> **Baseline Contract:** `0xe38151283e55077F621988679f2Cc524b785d236` (V1 Escrow)  
> **Date:** November 2026  

---

## 1. Why a New Contract Deployment is Required

The changes introduced in OpenAid Protocol V2 represent substantial modifications to storage layout and protocol accounting:
1. **Storage Layout Changes:**
   - In V1, `campaigns` is a flat struct (`mapping(uint256 => Campaign)`).
   - In V2, each campaign has an isolated nested sub-vault mapping (`mapping(uint256 => mapping(uint8 => SubVault))`).
   - Adding dynamic validator epochs, ranked backup bids, and EIP-712 qualification nonces cannot be achieved via in-place proxy storage upgrades without risking storage collisions.
2. **Deterministic Immutability:**
   - `OpenAidEscrow.sol` V1 was deliberately deployed as a non-upgradeable, zero-custody contract to provide mathematical guarantees to donors.
   - Therefore, V2 must be deployed as a new clean contract (`OpenAidEscrowV2.sol`) without altering or violating V1's existing deployed code.

---

## 2. Migration Architecture & Interface Boundaries

```
+---------------------------------------------------------------------------------+
|                                FRONTEND DASHBOARD                               |
|        (Reads V1 for Legacy Campaigns, Routes New Campaigns to V2)              |
+---------------------------------------------------------------------------------+
                       |                                         |
                       v                                         v
       +-------------------------------+         +-------------------------------+
       |     OpenAidEscrow.sol (V1)    |         |    OpenAidEscrowV2.sol (V2)   |
       |  (Single-Vault Legacy State)  |         | (Isolated Sub-Vaults & Fallback)|
       +-------------------------------+         +-------------------------------+
                       |                                         |
                       +--------------------+--------------------+
                                            |
                                            v
                                 +---------------------+
                                 |  Arc Testnet USDC   |
                                 |  (0x3600...0000)    |
                                 +---------------------+
```

---

## 3. Phased Rollout Sequence

### Step 1: Core Contract Implementation & Local Hardhat Test Suite
- Write `contracts/core/OpenAidEscrowV2.sol`.
- Implement full Hardhat test suite in `test/OpenAidEscrowV2.test.ts` covering:
  - Sub-vault balance isolation
  - Backup vendor 15% spread enforcement & 48h timeout
  - Validator 72h timeout and replacement rounds
  - 3-bid minimum quorum & EIP-712 qualification
  - Action-bound World ID nullifier deduplication

### Step 2: Off-Chain Module Upgrades
- **Arkiv:** Deploy versioned schemas (`openaid.v2.SubCampaign`, `openaid.v2.VendorReplacementLog`).
- **Chainlink CRE:** Update DON verification logic to pass sub-vault category manifest hashes.
- **World ID:** Update `/api/verify-worldid` to check `actionId` generated with `subVaultId`.

### Step 3: Testnet Deployment to Arc
- Run deployment script `scripts/deploy-v2.ts` targeting Arc Testnet (Chain ID `5042002`).
- Verify bytecode, bound USDC address (`0x3600...0000`), and initial validator pool.
- Update `NEXT_PUBLIC_ESCROW_V2_ADDRESS` in `.env.local` without breaking existing V1 reads.

### Step 4: Frontend Routing
- Update `src/lib/arc/` with `OpenAidEscrowV2` ABIs.
- Provide a dual-mode campaign reader: queries V1 for campaign IDs $< 100$ and V2 for new multi-sub-vault campaigns.
