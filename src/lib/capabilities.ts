/**
 * Single source of truth for what is implemented vs. simulated vs. planned.
 * Keep this honest — it is rendered on public pages.
 */
export type CapabilityStatus = "live" | "partial" | "simulated" | "planned";

export interface Capability {
  key: string;
  title: string;
  body: string;
  status: CapabilityStatus;
  detail: string;
}

export const CAPABILITIES: Capability[] = [
  {
    key: "escrow",
    title: "On-chain escrow",
    body: "Donor USDC is held by an immutable contract with zero custody. Funds leave only to the winning vendor upon verified delivery or back to donors.",
    status: "live",
    detail: "Upgraded OpenAidEscrow deployed on Arc Testnet with creator controls and sub-vaults.",
  },
  {
    key: "procurement",
    title: "Sealed-bid procurement",
    body: "Vendors post a 5% bond and commit a cryptographic hash bound to their address, then reveal. Lowest valid reveal wins with ranked backup failover.",
    status: "live",
    detail: "Commit–reveal bidding and 48-hour Rank 2 failover active on Arc Testnet.",
  },
  {
    key: "validation",
    title: "Independent validation & disputes",
    body: "Five registered validators with World ID Sybil resistance; three approvals release Stage 1 (70%). A 72-hour heartbeat and challenge window guards Stage 2 (30%).",
    status: "live",
    detail: "Quorum voting, heartbeat timers, and challenge disputes enforced on-chain.",
  },
  {
    key: "evidence",
    title: "Delivery evidence & provenance",
    body: "Delivery manifest CIDs are anchored on-chain with multi-entity cryptographic provenance on Arkiv Rabdi testnet.",
    status: "live",
    detail: "Live on Arc Testnet and Arkiv Rabdi testnet with immutable audit trails.",
  },
  {
    key: "cre",
    title: "Automated evidence checks",
    body: "Chainlink CRE consensus engine cross-checks waybills, carrier tracking, and disaster geofences before human review.",
    status: "live",
    detail: "4-node BFT oracle consensus verified and operational.",
  },
  {
    key: "worldid",
    title: "Human-unique validators",
    body: "Validators bind an Orb-verified World ID proof to their account so one human cannot operate multiple reviewer identities.",
    status: "live",
    detail: "Orb-level Sybil resistance active on World ID cloud verification.",
  },
  {
    key: "subvaults",
    title: "Sub-vaults & backup awards",
    body: "Multi-category sub-vaults (Food, Clothes, Stationery, Medical) with independent ceilings, isolated pull-refunds, and ranked failover.",
    status: "live",
    detail: "Live on Arc Testnet with independent failure domains and creator controls.",
  },
];

export const CAPABILITY_STATUS_COPY: Record<CapabilityStatus, { label: string; tone: "verified" | "info" | "pending" | "neutral" }> = {
  live: { label: "Live on testnet", tone: "verified" },
  partial: { label: "Partially live", tone: "info" },
  simulated: { label: "Simulated", tone: "pending" },
  planned: { label: "Planned · V2", tone: "neutral" },
};
