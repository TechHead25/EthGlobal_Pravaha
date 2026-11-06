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
    body: "Donor USDC is held by a non-upgradeable contract with no owner withdrawal path. Funds leave only to the winning vendor or back to donors.",
    status: "live",
    detail: "OpenAidEscrow V1 deployed on Arc Testnet.",
  },
  {
    key: "procurement",
    title: "Sealed-bid procurement",
    body: "Vendors post a 5% bond and commit a hash bound to their address, then reveal. Lowest valid reveal wins; ties go to the earliest reveal.",
    status: "live",
    detail: "Commit–reveal implemented in the V1 contract.",
  },
  {
    key: "validation",
    title: "Independent validation & disputes",
    body: "Five registered validators; three approvals release Stage 1, three rejections refund donors. A challenge window guards the final 30%.",
    status: "live",
    detail: "Quorum, double-vote prevention, and disputes are enforced on-chain.",
  },
  {
    key: "evidence",
    title: "Delivery evidence & provenance",
    body: "The delivery manifest CID is anchored on-chain. Procurement and evidence records are mirrored to Arkiv as expiring, queryable provenance.",
    status: "partial",
    detail: "On-chain CID is live; Arkiv records are off-chain provenance, not settlement truth.",
  },
  {
    key: "cre",
    title: "Automated evidence checks",
    body: "A Chainlink CRE workflow cross-checks manifests, carrier confirmation, and geofences before human review.",
    status: "simulated",
    detail: "Runs as a local DON simulation; not yet deployed to a live CRE network.",
  },
  {
    key: "worldid",
    title: "Human-unique validators",
    body: "Validators bind a World ID proof to their account so one person cannot operate several reviewer identities.",
    status: "live",
    detail: "Server-side proof verification; requires a configured World ID app.",
  },
  {
    key: "subvaults",
    title: "Sub-vaults & backup awards",
    body: "Per-item budget sub-vaults, ranked backup vendors, and validator epochs with timeouts.",
    status: "planned",
    detail: "Specified for OpenAidEscrowV2; not deployed.",
  },
];

export const CAPABILITY_STATUS_COPY: Record<CapabilityStatus, { label: string; tone: "verified" | "info" | "pending" | "neutral" }> = {
  live: { label: "Live on testnet", tone: "verified" },
  partial: { label: "Partially live", tone: "info" },
  simulated: { label: "Simulated", tone: "pending" },
  planned: { label: "Planned · V2", tone: "neutral" },
};
