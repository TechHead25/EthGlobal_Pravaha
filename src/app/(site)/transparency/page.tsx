import type { Metadata } from "next";
import { Database, ExternalLink, ScrollText, ShieldCheck, WifiOff } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { PageHero } from "@/components/site/page-hero";
import { EventList } from "@/components/campaigns/event-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/primitives";
import { getCampaigns, getEscrowEvents } from "@/server/chain";
import { ARC_TESTNET_CONFIG, getExplorerAddressUrl } from "@/lib/arc/config";
import { ARKIV_CONFIG } from "@/lib/arkiv/config";
import { formatDateTime, formatTokenAmount } from "@/lib/utils";

export const metadata: Metadata = { title: "Transparency" };
export const revalidate = 60;

const TIERS = [
  { tone: "verified" as const, label: "On-chain", body: "Read from OpenAidEscrow on Arc Testnet. Authoritative for funds and state." },
  { tone: "info" as const, label: "Off-chain provenance", body: "Arkiv records (procurement, evidence, reviews). Expiring and wallet-owned — not settlement truth." },
  { tone: "pending" as const, label: "Oracle / simulated", body: "Chainlink CRE checks currently run as a local simulation. Advisory only." },
  { tone: "neutral" as const, label: "Self-declared", body: "IPFS metadata such as titles and organization names, supplied by the campaign creator." },
];

export default async function TransparencyPage() {
  const [chain, events] = await Promise.all([getCampaigns(), getEscrowEvents(null)]);
  return (
    <main id="main">
      <SiteHeader tone="light" />
      <PageHero
        eyebrow="Public ledger"
        title="Verify it yourself."
        description="Everything that moves money in OpenAid is a contract event. This page reads them straight from the chain and links each one to the block explorer."
      />
      <div className="container space-y-10 py-12">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-verified" aria-hidden /> Escrow contract</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {chain.status === "ok" ? (
                <>
                  <a href={getExplorerAddressUrl(chain.data.escrowAddress)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all font-mono text-xs text-verified hover:underline">
                    {chain.data.escrowAddress} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  </a>
                  <p className="text-muted-foreground">{ARC_TESTNET_CONFIG.chainName} · chain {ARC_TESTNET_CONFIG.chainId}</p>
                </>
              ) : (
                <p className="text-muted-foreground">{chain.reason}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Held in escrow</CardTitle></CardHeader>
            <CardContent>
              <p className="font-display text-3xl">{chain.status === "ok" ? formatTokenAmount(BigInt(chain.data.escrowBalance)) : "—"} <span className="text-base text-muted-foreground">USDC</span></p>
              <p className="mt-1 text-xs text-muted-foreground">Includes donor deposits and vendor bonds. {chain.status === "ok" ? `Read ${formatDateTime(chain.readAt)}` : ""}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" aria-hidden /> Provenance records</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <a href={ARKIV_CONFIG.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-verified hover:underline">
                Arkiv {ARKIV_CONFIG.network} explorer <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
              <p className="text-muted-foreground">Off-chain, time-scoped records. Never treated as on-chain events.</p>
            </CardContent>
          </Card>
        </div>

        <section aria-labelledby="tiers">
          <h2 id="tiers" className="mb-3 text-base font-semibold">How to read this data</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((t) => (
              <div key={t.label} className="surface p-4">
                <Badge tone={t.tone}>{t.label}</Badge>
                <p className="mt-2 text-sm text-muted-foreground">{t.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="events">
          <h2 id="events" className="mb-3 flex items-center gap-2 text-base font-semibold"><ScrollText className="h-4 w-4" aria-hidden /> Escrow events</h2>
          {events.status !== "ok" ? (
            <EmptyState icon={WifiOff} title="Event log unavailable" description={events.reason} />
          ) : events.data.events.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No escrow events in the scanned range"
              description={`Blocks ${events.data.fromBlock.toLocaleString()}–${events.data.toBlock.toLocaleString()}. Activity appears here as soon as campaigns are created and funded.`}
            />
          ) : (
            <>
              <EventList events={events.data.events.slice(0, 100)} showCampaign />
              <p className="mt-2 text-xs text-muted-foreground">
                Blocks {events.data.fromBlock.toLocaleString()}–{events.data.toBlock.toLocaleString()} · read {formatDateTime(events.readAt)}
                {events.data.truncated ? " · older history available on the explorer" : ""}
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
