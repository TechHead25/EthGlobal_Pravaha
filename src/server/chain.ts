import "server-only";
import { ethers } from "ethers";
import { unstable_cache } from "next/cache";
import { ARC_TESTNET_CONFIG, getEscrowAddress } from "@/lib/arc/config";
import { OPENAID_ESCROW_FULL_ABI } from "@/lib/arc/abis";
import { attachTimestamps, parseEscrowLogs, readCampaignCore } from "@/lib/escrow/reader";
import type { CampaignMetadata, CampaignView, ChainRead, EscrowEvent } from "@/lib/escrow/types";

/**
 * Server-side, read-only Arc Testnet access. Every value returned here is read directly
 * from the deployed OpenAidEscrow contract (Tier 1: on-chain). Nothing is fabricated; on
 * RPC failure the caller receives `{ status: "unavailable" }`.
 */

export type { CampaignMetadata, CampaignView, ChainRead, EscrowEvent };

export const DEPLOYMENT_BLOCK = 70917303;

function provider(index = 0) {
  return new ethers.JsonRpcProvider(
    ARC_TESTNET_CONFIG.rpcUrls[index],
    { chainId: ARC_TESTNET_CONFIG.chainId, name: "arcTestnet" },
    { staticNetwork: true }
  );
}

async function withFallback<T>(fn: (p: ethers.JsonRpcProvider) => Promise<T>): Promise<T> {
  try {
    return await fn(provider(0));
  } catch (first) {
    if (ARC_TESTNET_CONFIG.rpcUrls.length < 2) throw first;
    return await fn(provider(1));
  }
}

const IPFS_GATEWAY = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/").replace(/\/?$/, "/");

async function fetchMetadata(cid: string): Promise<CampaignMetadata | null> {
  if (!/^[a-zA-Z0-9]{10,120}$/.test(cid)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`${IPFS_GATEWAY}${cid}`, { signal: ctrl.signal, next: { revalidate: 3600 } });
    clearTimeout(t);
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
    return {
      title: str(raw.title ?? raw.name, 140),
      description: str(raw.description, 2000),
      category: str(raw.category, 60),
      urgency: str(raw.urgency, 30),
      organization: str(raw.organization ?? raw.ngo, 120),
      region: str(raw.region ?? raw.targetRegion, 120),
    };
  } catch {
    return null;
  }
}

async function readCampaign(escrow: ethers.Contract, id: number): Promise<CampaignView | null> {
  const core = await readCampaignCore(escrow, id);
  if (!core) return null;
  return { ...core, metadata: await fetchMetadata(core.metadataCid) };
}

const MAX_CAMPAIGNS = 60;

export interface CampaignsSnapshot {
  campaigns: CampaignView[];
  campaignCount: number;
  escrowBalance: string;
  escrowAddress: string;
  blockNumber: number;
}

async function loadCampaigns(): Promise<ChainRead<CampaignsSnapshot>> {
  const readAt = new Date().toISOString();
  const escrowAddress = getEscrowAddress();
  try {
    return await withFallback(async (p) => {
      const code = await p.getCode(escrowAddress);
      if (!code || code === "0x") {
        return { status: "unavailable" as const, reason: "No contract bytecode at the configured escrow address.", readAt };
      }
      const escrow = new ethers.Contract(escrowAddress, OPENAID_ESCROW_FULL_ABI, p);
      const [countRaw, usdcAddr, blockNumber] = await Promise.all([escrow.campaignCount(), escrow.usdcToken(), p.getBlockNumber()]);
      const count = Number(countRaw);
      const usdc = new ethers.Contract(usdcAddr, ["function balanceOf(address) view returns (uint256)"], p);
      const balance: bigint = await usdc.balanceOf(escrowAddress);
      const ids = Array.from({ length: Math.min(count, MAX_CAMPAIGNS) }, (_, i) => count - i);
      const campaigns = (await Promise.all(ids.map((id) => readCampaign(escrow, id)))).filter(Boolean) as CampaignView[];
      return { status: "ok" as const, readAt, data: { campaigns, campaignCount: count, escrowBalance: balance.toString(), escrowAddress, blockNumber } };
    });
  } catch {
    return { status: "unavailable", reason: "Arc Testnet RPC is unreachable.", readAt };
  }
}

/** Cached for 30s across requests; public data only. */
export const getCampaigns = unstable_cache(loadCampaigns, ["arc-campaigns-v2"], { revalidate: 30 });

export async function getCampaign(id: number): Promise<ChainRead<CampaignView | null>> {
  const all = await getCampaigns();
  if (all.status !== "ok") return all;
  const hit = all.data.campaigns.find((c) => c.id === id);
  if (hit) return { status: "ok", data: hit, readAt: all.readAt };
  if (id < 1 || id > all.data.campaignCount) return { status: "ok", data: null, readAt: all.readAt };
  try {
    const data = await withFallback((p) => readCampaign(new ethers.Contract(getEscrowAddress(), OPENAID_ESCROW_FULL_ABI, p), id));
    return { status: "ok", data, readAt: new Date().toISOString() };
  } catch {
    return { status: "unavailable", reason: "Arc Testnet RPC is unreachable.", readAt: new Date().toISOString() };
  }
}

const EVENT_CHUNK = 10_000;
const EVENT_MAX_CHUNKS = 30;

export interface EventsSnapshot {
  events: EscrowEvent[];
  fromBlock: number;
  toBlock: number;
  truncated: boolean;
}

async function loadEvents(campaignId: number | null): Promise<ChainRead<EventsSnapshot>> {
  const readAt = new Date().toISOString();
  try {
    return await withFallback(async (p) => {
      const latest = await p.getBlockNumber();
      const earliest = Math.max(DEPLOYMENT_BLOCK, latest - EVENT_CHUNK * EVENT_MAX_CHUNKS);
      const truncated = earliest > DEPLOYMENT_BLOCK;
      const topics: (string | null)[] = [null];
      if (campaignId !== null) topics.push(ethers.zeroPadValue(ethers.toBeHex(campaignId), 32));
      const logs: ethers.Log[] = [];
      for (let to = latest; to >= earliest; to -= EVENT_CHUNK) {
        const from = Math.max(earliest, to - EVENT_CHUNK + 1);
        logs.push(...(await p.getLogs({ address: getEscrowAddress(), fromBlock: from, toBlock: to, topics })));
      }
      const parsed = parseEscrowLogs(logs).sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
      const events = await attachTimestamps(p, parsed);
      return { status: "ok" as const, readAt, data: { events, fromBlock: earliest, toBlock: latest, truncated } };
    });
  } catch {
    return { status: "unavailable", reason: "Event logs could not be read from Arc Testnet.", readAt };
  }
}

export const getEscrowEvents = unstable_cache(loadEvents, ["arc-escrow-events-v2"], { revalidate: 60 });
