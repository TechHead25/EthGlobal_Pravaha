# OpenAid Protocol — Arc Testnet Deployment & Verification Guide

## 1. Overview & Architectural Requirements

This guide provides the operational, network-aware procedure for deploying **OpenAid Protocol** to the **Arc Testnet** (Circle's Layer 1 blockchain optimized for programmable stablecoin finance) and local development networks.

### The Cardinal Deployment Invariant
- **Local Networks (Hardhat / Localhost):** May deploy `MockUSDC.sol` for isolated unit and integration testing.
- **Remote Networks (Arc Testnet):** **STRICTLY PROHIBITED** from deploying `MockUSDC`. Deployment requires an externally deployed, verified USDC ERC-20 contract address and 5 distinct, validated validator addresses.

---

## 2. Official Arc Testnet Specifications

All network parameters are sourced directly from the official Arc documentation ([https://docs.arc.network/](https://docs.arc.network/)):

| Parameter | Official Specification |
| :--- | :--- |
| **Network Name** | Arc Testnet |
| **Chain ID** | `5042002` (Hex: `0x4cef52`) |
| **Public RPC URL** | `https://rpc.testnet.arc.network` |
| **Native Gas Token** | USDC (6 decimals interface, 18 decimals EVM gas layer) |
| **Block Explorer** | [https://testnet.arcscan.app](https://testnet.arcscan.app) |
| **USDC ERC-20 Interface Address** | `0x3600000000000000000000000000000000000000` |
| **Faucet Access** | Circle Testnet Faucet / Arc Testnet Faucet |

---

## 3. Pre-Deployment Configuration & Security Hardening

### 3.1. Environment Variables Setup
Create an uncommitted `.env` file (or set variables in your secure execution environment) based on `.env.example`:

```bash
# Target RPC & Chain ID
ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.network"
ARC_TESTNET_CHAIN_ID="5042002"

# Deployer Private Key (Must have testnet USDC/gas balance)
DEPLOYER_PRIVATE_KEY="0xYOUR_32_BYTE_HEX_PRIVATE_KEY"

# External Verified USDC Token Address on Arc Testnet
ARC_USDC_TOKEN_ADDRESS="0x3600000000000000000000000000000000000000"

# 5 Explicit, Distinct Validator Council Addresses
VALIDATOR_1="0x1111111111111111111111111111111111111111"
VALIDATOR_2="0x2222222222222222222222222222222222222222"
VALIDATOR_3="0x3333333333333333333333333333333333333333"
VALIDATOR_4="0x4444444444444444444444444444444444444444"
VALIDATOR_5="0x5555555555555555555555555555555555555555"

# Overwrite Guard (default: false)
OVERWRITE_DEPLOYMENT="false"
```

> **SECURITY NOTICE:**  
> Never commit real private keys, mnemonics, or populated `.env` files to Git. Verify that `.gitignore` contains `.env`, `.env.*`, and `*.key`.

---

## 4. Pre-Deployment Verification Checks

Before broadcasting any transaction, run the verification utilities:

### Step 1: Pre-Flight Token Contract Verification
Validate that the configured USDC token address is an authentic ERC-20 contract with 6 decimals:

```bash
npx hardhat run scripts/verify-token.ts --network arcTestnet
```

**Verification Checklist Performed by the Script:**
1. Address format is valid and non-zero.
2. Target address contains contract bytecode (`getCode` $\ne$ `0x`).
3. Contract implements standard ERC-20 methods (`name()`, `symbol()`, `decimals()`, `balanceOf()`).
4. `decimals()` strictly equals **6** (USDC standard).
5. The deployer account can successfully read balances without reverting.

### Step 2: Deployment Safety & Invariant Tests
Execute the automated deployment pipeline test suite:

```bash
npm run test:deployment
```

This verifies:
- Validation of 5 distinct validator addresses.
- Rejection of invalid, zero, or duplicate validator addresses.
- Refusal to deploy `MockUSDC` on remote networks.
- Safe overwrite guards for deployment records.

---

## 5. Deployment Execution

### Local Development Deployment (Dry Run)
```bash
npm run deploy:local
# or
npx hardhat run scripts/deploy.ts --network localhost
```

### Controlled Arc Testnet Deployment (Broadcast)
When prerequisites are verified, execute the deployment:

```bash
npm run deploy:arc
# or
npx hardhat run scripts/deploy.ts --network arcTestnet
```

### Expected Output
```text
==================================================================
             OpenAid Protocol Deployment Orchestration            
==================================================================
Target Network:       arcTestnet
Chain ID:             5042002
Deployer Address:     0xDeployerAddress
Deployment Mode:      REMOTE_TESTNET
Deployer Balance:     1.5 Native Token

[Step 1] Verifying external USDC contract at: 0x3600000000000000000000000000000000000000...
[Success] External token verified: USD Coin (USDC), Decimals: 6

[Step 2] Validating initial 5-member Validator Council:
  Validator #1: 0x...
  Validator #2: 0x...
  Validator #3: 0x...
  Validator #4: 0x...
  Validator #5: 0x...

[Step 3] Deploying OpenAidEscrow contract...
Waiting for deployment transaction confirmation...
==================================================================
                   DEPLOYMENT SUCCESSFUL                          
==================================================================
OpenAidEscrow Address:   0x...
USDC Token Address:      0x3600000000000000000000000000000000000000
Transaction Hash:        0x...
Block Number:            12345
Gas Used:                3059701

Deployment Record Saved: deployments/arcTestnet-5042002.json
==================================================================
```

---

## 6. Deterministic Deployment Records & Post-Deployment Steps

1. **Deployment Records:**  
   Every deployment automatically generates a JSON artifact in `deployments/<network>-<chainId>.json`.  
   This record captures the contract address, USDC token address, deployer account, validator council addresses, and transaction hash.
2. **Preventing Accidental Overwrites:**  
   The script halts if a record file already exists for that network and chain ID, preventing accidental redeployment or clobbering. To intentionally redeploy, set `OVERWRITE_DEPLOYMENT="true"`.
3. **Frontend Configuration:**  
   Copy the emitted `OpenAidEscrow` contract address to `NEXT_PUBLIC_ESCROW_ADDRESS` in `.env.local` to connect the frontend to the deployed testnet contract.

---

## 7. Rollback & Recovery Considerations

- **Transaction Reversion / Out of Gas:** If deployment fails prior to confirmation, no record is written. Inspect gas limits and deployer native balance.
- **Incorrect Validator Council:** If an incorrect validator address was registered at deployment, the contract cannot be patched (OpenAid contracts are immutable to preserve trust). Deploy a fresh instance with the corrected addresses.
- **Contract Verification on ArcScan:** Verify the source code on [testnet.arcscan.app](https://testnet.arcscan.app) using standard Hardhat verify:
  ```bash
  npx hardhat verify --network arcTestnet <DEPLOYED_ESCROW_ADDRESS> <USDC_ADDRESS> "[<VAL_1>,<VAL_2>,<VAL_3>,<VAL_4>,<VAL_5>]"
  ```
