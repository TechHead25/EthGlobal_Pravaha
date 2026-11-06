"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, Inbox, MapPin, Search, ShieldCheck, Siren } from "lucide-react";
import type { CampaignView } from "@/lib/escrow/types";
import { presentState } from "@/lib/protocol";
import { cn, formatDate, formatTokenAmount, percent, shortAddress } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, Progress } from "@/components/ui/primitives";

const STATUS_GROUPS: Record<string, { label: string; states: number[] }> = {
  all: { label: "All statuses", states: [] },
  funding: { label: "Funding", states: [0] },
  procurement: { label: "Procurement", states: [2, 3] },
  delivery: { label: "Delivery & review", states: [5, 7] },
  settlement: { label: "Settlement", states: [9, 10, 11] },
  refunds: { label: "Refund paths", states: [1, 4, 6, 8, 12] },
};

const URGENCY_TONE: Record<string, "failed" | "pending" | "info" | "neutral"> = { critical: "failed", high: "failed", medium: "pending", low: "info" };

function uniq(values: (string | undefined)[]) {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort();
}

/**
 * Campaign discovery with search and filters over real campaign data. Category, urgency,
 * region and organization are NGO-declared IPFS metadata; filters appear only when values exist.
 */
export function CampaignExplorer({
  campaigns,
  action,
  initialStatus = "all",
  hrefFor = (c) => `/campaigns/${c.id}`,
}: {
  campaigns: CampaignView[];
  action?: (c: CampaignView) => React.ReactNode;
  initialStatus?: string;
  hrefFor?: (c: CampaignView) => string;
}) {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState(STATUS_GROUPS[initialStatus] ? initialStatus : "all");
  const [category, setCategory] = React.useState("");
  const [urgency, setUrgency] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [org, setOrg] = React.useState("");

  const categories = uniq(campaigns.map((c) => c.metadata?.category));
  const urgencies = uniq(campaigns.map((c) => c.metadata?.urgency?.toLowerCase()));
  const regions = uniq(campaigns.map((c) => c.metadata?.region));
  const orgs = uniq(campaigns.map((c) => c.metadata?.organization ?? c.creator));

  const filtered = campaigns.filter((c) => {
    const m = c.metadata;
    const hay = `${m?.title ?? ""} ${m?.description ?? ""} ${m?.organization ?? ""} ${m?.region ?? ""} #${c.id} ${c.creator}`.toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (status !== "all" && !STATUS_GROUPS[status].states.includes(c.state)) return false;
    if (category && m?.category !== category) return false;
    if (urgency && m?.urgency?.toLowerCase() !== urgency) return false;
    if (region && m?.region !== region) return false;
    if (org && (m?.organization ?? c.creator) !== org) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="surface grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(5,1fr)]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns, NGOs, regions" aria-label="Search campaigns" className="pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          {Object.entries(STATUS_GROUPS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" disabled={!categories.length}>
          <option value="">{categories.length ? "All categories" : "No categories"}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select value={urgency} onChange={(e) => setUrgency(e.target.value)} aria-label="Filter by urgency" disabled={!urgencies.length}>
          <option value="">{urgencies.length ? "Any urgency" : "No urgency set"}</option>
          {urgencies.map((u) => <option key={u} value={u} className="capitalize">{u}</option>)}
        </Select>
        <Select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Filter by location" disabled={!regions.length}>
          <option value="">{regions.length ? "All locations" : "No locations"}</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Select value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Filter by NGO" disabled={!orgs.length}>
          <option value="">All NGOs</option>
          {orgs.map((o) => <option key={o} value={o}>{o.startsWith("0x") ? shortAddress(o) : o}</option>)}
        </Select>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length} of {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} · category, urgency, location and organization are self-declared by the NGO in campaign metadata.
      </p>

      {campaigns.length === 0 ? (
        <EmptyState icon={Inbox} title="No campaigns have been created on this deployment yet" description="Campaigns appear here as soon as an NGO creates one on-chain." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No campaigns match these filters" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const s = presentState(c.state);
            const budget = BigInt(c.budgetCeiling);
            const raised = BigInt(c.totalDeposited);
            const pct = percent(raised, budget);
            const m = c.metadata;
            return (
              <article key={c.id} className="surface group flex flex-col p-5 transition-shadow hover:shadow-[0_12px_32px_-16px_hsl(222_40%_12%/0.25)]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={s.tone} dot>{s.label}</Badge>
                  {m?.category ? <Badge>{m.category}</Badge> : null}
                  {m?.urgency ? (
                    <Badge tone={URGENCY_TONE[m.urgency.toLowerCase()] ?? "neutral"} className="capitalize"><Siren aria-hidden /> {m.urgency}</Badge>
                  ) : null}
                </div>
                <Link href={hrefFor(c)} className="mt-4 inline-flex items-start gap-1 font-display text-xl leading-snug tracking-tight hover:underline">
                  {m?.title || `Campaign #${c.id}`}
                  <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" aria-hidden />
                </Link>
                {m?.description ? <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{m.description}</p> : null}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" aria-hidden />
                    {m?.organization ? <>{m.organization} <span className="opacity-70">(self-declared)</span></> : <span className="font-mono">{shortAddress(c.creator)}</span>}
                  </span>
                  {m?.region ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{m.region}</span> : null}
                </div>
                <div className="mt-auto pt-5">
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span><strong>{formatTokenAmount(raised)}</strong> <span className="text-muted-foreground">/ {formatTokenAmount(budget)} USDC</span></span>
                    <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                  <Progress value={pct} label={`Funding progress for campaign ${c.id}`} />
                  <div className={cn("mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground")}>
                    <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-verified" aria-hidden /> Escrowed on-chain</span>
                    <span>{c.state === 0 ? `Closes ${formatDate(c.fundingDeadline)}` : `Campaign #${c.id}`}</span>
                  </div>
                  {action ? <div className="mt-4">{action(c)}</div> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
