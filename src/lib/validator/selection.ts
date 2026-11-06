/**
 * @file selection.ts
 * @notice Dynamic Validator Panel Selection for OpenAid Protocol.
 * Implements Efraimidis-Spirakis weighted random sampling without replacement (Algorithm A-Res),
 * conflict-of-interest filtering against NGOs and bidding vendors, and deterministic timelocked
 * alternate replacement preserving key order.
 */

import { solidityPackedKeccak256, zeroPadValue } from "ethers";

export interface RegisteredValidator {
  id: string;
  address: string;
  name: string;
  score: number; // Reputation score [1, 100]
  isWorldIdVerified: boolean;
  affiliations: string[]; // Addresses of affiliated NGOs or vendors
  isActive: boolean;
}

export interface SelectedValidator extends RegisteredValidator {
  weight: number;        // w_i = min(score_i, 80)
  u_i: number;           // Uniform random variable derived from hash / 2^256
  key: number;           // key_i = u_i ^ (1 / w_i)
  selectionRank: number; // 1-based rank by key
}

export interface PanelSelectionOptions {
  campaignId: number | string | bigint;
  subVaultId: number | string | bigint;
  prevrandao?: string | bigint;
  ngoAddress?: string;
  biddingVendors?: string[];
  pool?: RegisteredValidator[];
  epoch?: number;
}

export interface PanelSelectionResult {
  campaignId: string;
  subVaultId: string;
  seed: string;
  panel: SelectedValidator[];          // Top 5 by key
  alternates: SelectedValidator[];     // Next 3 by key
  conflicted: RegisteredValidator[];   // Excluded due to NGO/vendor affiliation
  unverifiedOrInactive: RegisteredValidator[]; // Excluded due to verification/status
  eligiblePool: RegisteredValidator[]; // Clean pool submitted to sampling
  allSampled: SelectedValidator[];     // All sampled candidates sorted by key descending
  epoch: number;
}

export interface ReplaceValidatorResult {
  previousValidator: SelectedValidator;
  newValidator: SelectedValidator;
  updatedPanel: SelectedValidator[];
  remainingAlternates: SelectedValidator[];
  epoch: number;
  reason: "TIMEOUT" | "WITHDRAWAL";
}

/**
 * Standard pool of 14 registered, World ID-verified disaster response validators.
 * Contains realistic reputation scores and pre-existing affiliations for conflict checking.
 */
export const DEFAULT_VALIDATOR_POOL: RegisteredValidator[] = [
  {
    id: "val-01",
    address: "0x1111111111111111111111111111111111111111",
    name: "Dr. Sarah Chen (Disaster Relief Logistics)",
    score: 95,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-02",
    address: "0x2222222222222222222222222222222222222222",
    name: "Marcus Vance (Supply Chain Auditor)",
    score: 88,
    isWorldIdVerified: true,
    affiliations: ["0xNGO1111111111111111111111111111111111111"], // Conflicted with NGO 1
    isActive: true,
  },
  {
    id: "val-03",
    address: "0x3333333333333333333333333333333333333333",
    name: "Amina Al-Mansoor (UN OCHA Field Specialist)",
    score: 92,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-04",
    address: "0x4444444444444444444444444444444444444444",
    name: "Kenji Sato (Red Cross Japan Operations)",
    score: 82,
    isWorldIdVerified: true,
    affiliations: ["0xVENDOR2222222222222222222222222222222222"], // Conflicted with Vendor 2
    isActive: true,
  },
  {
    id: "val-05",
    address: "0x5555555555555555555555555555555555555555",
    name: "Elena Rostova (Medical Goods Quality Inspector)",
    score: 78,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-06",
    address: "0x6666666666666666666666666666666666666666",
    name: "David Mwangi (East Africa Relief Coordinator)",
    score: 85,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-07",
    address: "0x7777777777777777777777777777777777777777",
    name: "Priya Sharma (Emergency Telecommunications)",
    score: 74,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-08",
    address: "0x8888888888888888888888888888888888888888",
    name: "Carlos Gomez (Latin America Humanitarian Hub)",
    score: 90,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-09",
    address: "0x9999999999999999999999999999999999999999",
    name: "Fatima Zahra (Displaced Persons Welfare)",
    score: 80,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-10",
    address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    name: "Lucas Meyer (European Civil Protection)",
    score: 72,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-11",
    address: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    name: "Sunita Patel (Water & Sanitation Hygiene)",
    score: 86,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-12",
    address: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    name: "Tariq Aziz (Food Security Assessment)",
    score: 68,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-13",
    address: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
    name: "Hanna Lindqvist (Nordic Crisis Response)",
    score: 84,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
  {
    id: "val-14",
    address: "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE",
    name: "Liam O'Connor (Disaster Shelter Infrastructure)",
    score: 76,
    isWorldIdVerified: true,
    affiliations: [],
    isActive: true,
  },
];

/**
 * Computes deterministic randomness seed from block.prevrandao, campaignId, and subVaultId.
 * seed = keccak256(block.prevrandao, campaignId, subVaultId)
 */
export function computeSelectionSeed(
  prevrandao: string | bigint = "0x5042002000000000000000000000000000000000000000000000000000000042",
  campaignId: number | string | bigint = 1,
  subVaultId: number | string | bigint = 1
): string {
  let randaoHex = typeof prevrandao === "string" ? prevrandao.trim() : "0x" + prevrandao.toString(16);
  if (!randaoHex.startsWith("0x") && !randaoHex.startsWith("0X")) {
    randaoHex = "0x" + randaoHex;
  }
  let hexOnly = randaoHex.slice(2);
  if (hexOnly.length % 2 !== 0) {
    hexOnly = "0" + hexOnly;
  }
  const paddedRandao = zeroPadValue("0x" + hexOnly, 32);

  return solidityPackedKeccak256(
    ["bytes32", "uint256", "uint256"],
    [paddedRandao, BigInt(campaignId), BigInt(subVaultId)]
  );
}

/**
 * Checks if a validator has an active conflict of interest.
 * Conflicts arise when a validator is:
 * 1. The campaign creator / NGO address.
 * 2. One of the bidding vendors.
 * 3. Affiliated with the campaign creator / NGO.
 * 4. Affiliated with any bidding vendor.
 */
export function isValidatorConflicted(
  validator: RegisteredValidator,
  ngoAddress?: string,
  biddingVendors: string[] = []
): boolean {
  const normVal = validator.address.toLowerCase();
  const normNgo = ngoAddress?.trim().toLowerCase();
  const normVendors = biddingVendors.map((v) => v.trim().toLowerCase()).filter(Boolean);
  const normAffiliations = validator.affiliations.map((a) => a.trim().toLowerCase());

  // Direct address identity check
  if (normNgo && normVal === normNgo) return true;
  if (normVendors.includes(normVal)) return true;

  // Affiliation check
  if (normNgo && normAffiliations.includes(normNgo)) return true;
  for (const vendor of normVendors) {
    if (normAffiliations.includes(vendor)) return true;
  }

  return false;
}

/**
 * Executes Efraimidis-Spirakis weighted random sampling without replacement (Algorithm A-Res).
 * Mathematical Formula:
 *   seed = keccak256(block.prevrandao, campaignId, subVaultId)
 *   w_i = min(score_i, 80)
 *   u_i = hash(seed, subVaultId, validatorId) / 2^256
 *   key_i = u_i ^ (1 / w_i)
 *   panel = top 5 by key (alternates = next 3 by key)
 */
export function selectValidatorPanel(options: PanelSelectionOptions): PanelSelectionResult {
  const campaignId = String(options.campaignId);
  const subVaultId = String(options.subVaultId);
  const pool = options.pool ?? DEFAULT_VALIDATOR_POOL;
  const epoch = options.epoch ?? 1;

  const seed = computeSelectionSeed(options.prevrandao, options.campaignId, options.subVaultId);

  // 1. Segregate pool by eligibility and conflict status
  const conflicted: RegisteredValidator[] = [];
  const unverifiedOrInactive: RegisteredValidator[] = [];
  const eligiblePool: RegisteredValidator[] = [];

  for (const val of pool) {
    if (!val.isWorldIdVerified || !val.isActive) {
      unverifiedOrInactive.push(val);
      continue;
    }
    if (isValidatorConflicted(val, options.ngoAddress, options.biddingVendors)) {
      conflicted.push(val);
      continue;
    }
    eligiblePool.push(val);
  }

  if (eligiblePool.length < 5) {
    throw new Error(
      `Insufficient eligible validators: Required at least 5 unconflicted World ID-verified validators, but found only ${eligiblePool.length} (total pool: ${pool.length}, conflicted: ${conflicted.length}).`
    );
  }

  // 2. Compute Efraimidis-Spirakis Keys
  const sampledList: SelectedValidator[] = eligiblePool.map((validator) => {
    // w_i = min(score_i, 80) clamped to minimum 1 to prevent division by zero
    const weight = Math.max(1, Math.min(validator.score, 80));

    // u_i = hash(seed, subVaultId, validatorId) / 2^256
    const hashHex = solidityPackedKeccak256(
      ["bytes32", "uint256", "string"],
      [seed, BigInt(subVaultId), validator.id]
    );

    // Map 256-bit hash into (0, 1] using top 53 bits for standard IEEE 754 precision
    const hashBigInt = BigInt(hashHex);
    const u_i = Number((hashBigInt >> 203n) + 1n) / (2 ** 53);

    // key_i = u_i ^ (1 / w_i)
    const key = Math.pow(u_i, 1 / weight);

    return {
      ...validator,
      weight,
      u_i,
      key,
      selectionRank: 0,
    };
  });

  // 3. Sort candidates in descending order of key_i
  sampledList.sort((a, b) => b.key - a.key);

  // Assign selection ranks
  sampledList.forEach((item, index) => {
    item.selectionRank = index + 1;
  });

  // 4. Panel = Top 5 by key; Alternates = Next 3 by key
  const panel = sampledList.slice(0, 5);
  const alternates = sampledList.slice(5, 8);

  return {
    campaignId,
    subVaultId,
    seed,
    panel,
    alternates,
    conflicted,
    unverifiedOrInactive,
    eligiblePool,
    allSampled: sampledList,
    epoch,
  };
}

/**
 * Replaces an inactive, timed-out, or withdrawn validator in the active panel
 * with the highest-ranked alternate in key order.
 *
 * Preserves key order of remaining alternates and increments epoch.
 */
export function replaceValidator(
  currentPanel: SelectedValidator[],
  alternates: SelectedValidator[],
  validatorToReplaceIdOrAddress: string,
  reason: "TIMEOUT" | "WITHDRAWAL" = "TIMEOUT",
  epoch: number = 1
): ReplaceValidatorResult {
  if (alternates.length === 0) {
    throw new Error("No remaining alternates available in backup pool for replacement.");
  }

  const query = validatorToReplaceIdOrAddress.trim().toLowerCase();
  const replaceIndex = currentPanel.findIndex(
    (v) => v.id.toLowerCase() === query || v.address.toLowerCase() === query
  );

  if (replaceIndex === -1) {
    throw new Error(
      `Validator '${validatorToReplaceIdOrAddress}' is not currently present in the active validator panel.`
    );
  }

  const previousValidator = currentPanel[replaceIndex];
  // Next alternate in key order is always at index 0 (pre-sorted descending by key)
  const newValidator = {
    ...alternates[0],
    selectionRank: previousValidator.selectionRank,
  };
  const remainingAlternates = alternates.slice(1);

  const updatedPanel = [...currentPanel];
  updatedPanel[replaceIndex] = newValidator;

  return {
    previousValidator,
    newValidator,
    updatedPanel,
    remainingAlternates,
    epoch: epoch + 1,
    reason,
  };
}
