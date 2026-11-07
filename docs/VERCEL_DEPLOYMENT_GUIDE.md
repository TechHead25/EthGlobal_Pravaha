# OpenAid Protocol — Vercel Configuration & Arc Testnet Verification Guide

## 1. Overview

This document provides instructions for configuring **OpenAid Protocol** on **Vercel** (Production and Preview deployments) to communicate with the **Arc Testnet** and verify on-chain contracts.

### Live Production Deployment
- **Live URL:** [https://pravahaprotocol.vercel.app](https://pravahaprotocol.vercel.app/)
- **Deployment Status:** Active & Connected to Arc Testnet (Chain ID `5042002`)

---

## 2. Vercel Environment Variables Configuration

In your Vercel Project Dashboard (**Settings > Environment Variables**), ensure the following variables are set for **Production**, **Preview**, and **Development** environments:

| Variable Name | Required Value | Scope | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | `0xe38151283e55077F621988679f2Cc524b785d236` | Production, Preview | Verified `OpenAidEscrow.sol` deployment address on Arc Testnet |
| `NEXT_PUBLIC_USDC_ADDRESS` | `0x3600000000000000000000000000000000000000` | Production, Preview | Official Arc Testnet USDC ERC-20 contract (6 decimals) |
| `NEXT_PUBLIC_CHAIN_ID` | `5042002` | Production, Preview | Arc Testnet Chain ID (0x4cef52) |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | `5042002` | Production, Preview | Arc Testnet Chain ID fallback |
| `NEXT_PUBLIC_RPC_URL` | `https://rpc.testnet.arc.network` | Production, Preview | Public Arc Testnet RPC endpoint |
| `NEXT_PUBLIC_ARC_RPC_URL` | `https://rpc.testnet.arc.network` | Production, Preview | Public Arc Testnet RPC endpoint fallback |
| `NEXT_PUBLIC_BLOCK_EXPLORER` | `https://testnet.arcscan.app` | Production, Preview | ArcScan block explorer URL |

> [!IMPORTANT]
> **Zero Privileged Keys in Frontend:**  
> Never add `DEPLOYER_PRIVATE_KEY` or any wallet private key to Vercel environment variables. The web client interacts exclusively via user-approved browser wallets (MetaMask) using `BrowserProvider`.

---

## 3. Verifying the Deployed Contract on Arc Testnet

### Live On-Chain Query
To verify the contract state, council registration, and token configuration directly from your terminal:

```bash
npx hardhat run scripts/verify-live-contract.ts --network arcTestnet
```

**Expected Result:**
- OpenAidEscrow Address: `0xe38151283e55077F621988679f2Cc524b785d236`
- USDC Token Address: `0x3600000000000000000000000000000000000000` (Verified ERC-20, 6 Decimals)
- Chain ID: `5042002`
- Quorum Threshold: `3` of `5` registered validators
- Escrow Token Balance: `0.0 USDC` (Zero unallocated balance)

### ArcScan Block Explorer Verification
You can view the deployed bytecode and transactions on the official explorer:
- **Contract:** [https://testnet.arcscan.app/address/0xe38151283e55077F621988679f2Cc524b785d236](https://testnet.arcscan.app/address/0xe38151283e55077F621988679f2Cc524b785d236)
- **Deployment Transaction:** [https://testnet.arcscan.app/tx/0xd4748a53c1eedce5bc86293d3d5a570764fae0996d0eb2b906c0ea13d54e7b21](https://testnet.arcscan.app/tx/0xd4748a53c1eedce5bc86293d3d5a570764fae0996d0eb2b906c0ea13d54e7b21)
- **Flattened Source for Web Verification:** [`deployments/OpenAidEscrow_Flattened.sol`](file:///c:/Projects/EthGLobal/deployments/OpenAidEscrow_Flattened.sol)

---

## 4. Initializing Campaign #1 (Organizer Instructions)

When first deployed, `campaignCount` is `0`. The frontend displays an honest empty state until an authorized campaign organizer invokes `createCampaign` on `OpenAidEscrow.sol`.

### Function Signature:
```solidity
function createCampaign(
    uint256 budgetCeiling,
    uint64 fundingDurationSeconds,
    uint64 deliveryDurationSeconds,
    string calldata metadataCid
) external returns (uint256 campaignId);
```

### Flood Relief Blanket Procurement Parameters (Scenario 1):
- `budgetCeiling`: `10000000000` (10,000 USDC at 6 decimals)
- `fundingDurationSeconds`: `1209600` (14 days)
- `deliveryDurationSeconds`: `604800` (7 days)
- `metadataCid`: `"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"`

Once registered, `campaignCount` becomes `1`, and the donor funding portal automatically opens for contributions.

---

## 5. Automated Build & Test Verification

Before redeploying or triggering Vercel preview builds, run:

```bash
npm run lint         # Check ESLint compliance
npx tsc --noEmit     # TypeScript type-check
npm run test:all     # Execute all 6 test suites (61 passing tests)
npm run build        # Verify Next.js production build output
```
