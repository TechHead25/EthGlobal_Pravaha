"use client";

import * as React from "react";
import { ethers } from "ethers";
import { OPENAID_ESCROW_FULL_ABI } from "@/lib/arc/abis";
import { attachTimestamps, mergeEvents, parseEscrowLogs, readCampaignCore } from "@/lib/escrow/reader";
import type { CampaignMetadata, CampaignView, EscrowEvent } from "@/lib/escrow/types";
import { useWallet } from "@/components/wallet/wallet-provider";

async function resolveClientMetadata(cid: string): Promise<CampaignMetadata | null> {
  if (!cid || typeof window === "undefined") return null;
  // 1. Check local storage cache first
  try {
    const cached = localStorage.getItem(`openaid_meta_${cid}`);
    if (cached) return JSON.parse(cached);
  } catch {}
  // 2. Fetch from public IPFS gateways with timeout
  const gateways = [
    (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/").replace(/\/?$/, "/"),
    "https://ipfs.io/ipfs/",
    "https://dweb.link/ipfs/",
  ];
  for (const gw of gateways) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${gw}${cid}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const raw = (await res.json()) as Record<string, unknown>;
      const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
      const meta: CampaignMetadata = {
        title: str(raw.title ?? raw.name, 140),
        description: str(raw.description, 2000),
        category: str(raw.category, 60),
        urgency: str(raw.urgency, 30),
        organization: str(raw.organization ?? raw.ngo, 120),
        region: str(raw.region ?? raw.targetRegion, 120),
      };
      try {
        localStorage.setItem(`openaid_meta_${cid}`, JSON.stringify(meta));
      } catch {}
      return meta;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Shared live escrow state for every dashboard in a role section.
 *
 * - Seeded with the server snapshot (campaigns + events).
 * - Polls Arc Testnet for NEW escrow logs only (from the last seen block), so each event is
 *   fetched once; events are de-duplicated by `${txHash}:${logIndex}`.
 * - Re-reads only the campaigns touched by new events, preserving their IPFS metadata.
 * - Only mined logs are ever shown — pending transactions are surfaced separately by the
 *   wallet layer and never appear here as confirmed.
 * - Pauses while the tab is hidden and reconciles from the last block on return.
 */

export type LiveStatus = "live" | "syncing" | "offline" | "unavailable";

interface EscrowLiveValue {
  campaigns: CampaignView[];
  events: EscrowEvent[];
  /** Keys of events that arrived after the initial render (for "new" highlighting). */
  freshKeys: ReadonlySet<string>;
  status: LiveStatus;
  lastSyncedAt: number | null;
  lastBlock: number | null;
  /** True when the server could not read the chain at all. */
  unavailableReason: string | null;
  eventsAvailable: boolean;
  refresh: (campaignIds?: number[]) => Promise<void>;
  getCampaign: (id: number) => CampaignView | undefined;
}

const EscrowLiveContext = React.createContext<EscrowLiveValue | null>(null);

const POLL_MS = 15_000;
const MAX_RANGE = 10_000;

export function EscrowLiveProvider({
  initialCampaigns,
  initialEvents,
  initialBlock,
  unavailableReason,
  eventsAvailable,
  children,
}: {
  initialCampaigns: CampaignView[];
  initialEvents: EscrowEvent[];
  initialBlock: number | null;
  unavailableReason: string | null;
  eventsAvailable: boolean;
  children: React.ReactNode;
}) {
  const { readProvider, escrowAddress } = useWallet();
  const [campaigns, setCampaigns] = React.useState(initialCampaigns);
  const [events, setEvents] = React.useState(initialEvents);
  const [freshKeys, setFreshKeys] = React.useState<Set<string>>(new Set());
  const [status, setStatus] = React.useState<LiveStatus>(unavailableReason ? "unavailable" : "live");
  const [lastSyncedAt, setLastSyncedAt] = React.useState<number | null>(unavailableReason ? null : Date.now());
  const lastBlockRef = React.useRef<number | null>(initialBlock);
  const campaignsRef = React.useRef(campaigns);
  campaignsRef.current = campaigns;
  const busy = React.useRef(false);

  const escrow = React.useMemo(() => new ethers.Contract(escrowAddress, OPENAID_ESCROW_FULL_ABI, readProvider), [escrowAddress, readProvider]);

  const rereadCampaigns = React.useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      const updated = await Promise.all(
        ids.map(async (id) => {
          const core = await readCampaignCore(escrow, id);
          if (!core) return [id, null, null] as const;
          const prevMeta = campaignsRef.current.find((c) => c.id === id)?.metadata;
          const meta = prevMeta ?? (await resolveClientMetadata(core.metadataCid));
          return [id, core, meta] as const;
        })
      );
      setCampaigns((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        for (const [id, core, meta] of updated) {
          if (!core) continue;
          byId.set(id, { ...core, metadata: meta ?? byId.get(id)?.metadata ?? null });
        }
        return [...byId.values()].sort((a, b) => b.id - a.id);
      });
    },
    [escrow]
  );

  const tick = React.useCallback(
    async (forceIds: number[] = []) => {
      if (busy.current || unavailableReason) return;
      busy.current = true;
      setStatus("syncing");
      try {
        const latest = await readProvider.getBlockNumber();
        const from = (lastBlockRef.current ?? latest - 1) + 1;
        const touched = new Set<number>(forceIds);
        if (latest >= from) {
          const to = Math.min(latest, from + MAX_RANGE - 1);
          const logs = await readProvider.getLogs({ address: escrowAddress, fromBlock: from, toBlock: to });
          const parsed = await attachTimestamps(readProvider, parseEscrowLogs(logs));
          if (parsed.length) {
            setEvents((prev) => mergeEvents(prev, parsed));
            setFreshKeys((prev) => new Set([...prev, ...parsed.map((e) => e.key)]));
            for (const e of parsed) if (e.campaignId > 0) touched.add(e.campaignId);
          }
          lastBlockRef.current = to;
        }
        await rereadCampaigns([...touched]);
        setLastSyncedAt(Date.now());
        setStatus("live");
      } catch {
        setStatus("offline");
      } finally {
        busy.current = false;
      }
    },
    [readProvider, escrowAddress, rereadCampaigns, unavailableReason]
  );

  React.useEffect(() => {
    if (unavailableReason) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void tick(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void tick();
        start();
      } else stop();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tick, unavailableReason]);

  const value = React.useMemo<EscrowLiveValue>(
    () => ({
      campaigns,
      events,
      freshKeys,
      status,
      lastSyncedAt,
      lastBlock: lastBlockRef.current,
      unavailableReason,
      eventsAvailable,
      refresh: (ids) => tick(ids ?? []),
      getCampaign: (id) => campaignsRef.current.find((c) => c.id === id),
    }),
    [campaigns, events, freshKeys, status, lastSyncedAt, unavailableReason, eventsAvailable, tick]
  );

  return <EscrowLiveContext.Provider value={value}>{children}</EscrowLiveContext.Provider>;
}

export function useEscrowLive(): EscrowLiveValue {
  const ctx = React.useContext(EscrowLiveContext);
  if (!ctx) throw new Error("useEscrowLive must be used inside <EscrowLiveProvider>");
  return ctx;
}
