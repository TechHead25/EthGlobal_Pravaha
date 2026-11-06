import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, HandCoins, Layers, ScrollText, WifiOff } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { EventList } from "@/components/campaigns/event-list";
import { FundFlowDiagram } from "@/components/dashboard/fund-flow";
import { computeFundFlow } from "@/lib/escrow/fund-flow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Notice, Progress, Timeline } from "@/components/ui/primitives";
import { getCampaign, getEscrowEvents } from "@/server/chain";
import { LIFECYCLE, lifecycleStatus, presentState } from "@/lib/protocol";
import { getExplorerAddressUrl } from "@/lib/arc/config";
import { formatDateTime, formatTokenAmount, percent, shortAddress } from "@/lib/utils";

const ZERO = "0x0000000000000000000000000000000000000000";
const IPFS = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/").replace(/\/?$/, "/");

function parseId(raw: string): number | null {
  if (!/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  return { title: `Campaign #${parseId(params.id) ?? "?"}` };
}

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (!id) notFound();
  const res = await getCampaign(id);

  if (res.status !== "ok") {
    return (
      <main id="main">
        <SiteHeader tone="light" />
        <div className="container py-16">
          <EmptyState icon={WifiOff} title="Campaign data unavailable" description={res.reason} />
        </div>
      </main>
    );
  }
  const c = res.data;
  if (!c) notFound();

  const events = await getEscrowEvents(id);
  const s = presentState(c.state);
  const budget = BigInt(c.budgetCeiling);
  const raised = BigInt(c.totalDeposited);
  const title = c.metadata?.title || `Campaign #${c.id}`;
  const hasWinner = c.winningVendor !== ZERO;

  const facts: [string, React.ReactNode][] = [
    ["Budget ceiling", `${formatTokenAmount(budget)} USDC`],
    ["Deposited", `${formatTokenAmount(raised)} USDC`],
    ["Funding deadline", formatDateTime(c.fundingDeadline)],
    ["Delivery deadline", formatDateTime(c.deliveryDeadline)],
    ["Commit / reveal deadlines", c.commitDeadline ? `${formatDateTime(c.commitDeadline)} / ${formatDateTime(c.revealDeadline)}` : "Auction not opened"],
    ["Sealed bids", String(c.vendorCount)],
    ["Winning vendor", hasWinner ? <a className="font-mono text-verified hover:underline" href={getExplorerAddressUrl(c.winningVendor)} target="_blank" rel="noreferrer">{shortAddress(c.winningVendor)}</a> : "Not yet awarded"],
    ["Winning bid", hasWinner ? `${formatTokenAmount(BigInt(c.winningBidAmount))} USDC` : "—"],
    ["Stage 1 (70%)", c.stage1Paid ? "Released" : "Not released"],
    ["Stage 2 (30%)", c.stage2Paid ? "Released" : c.challengeExpiry ? `After ${formatDateTime(c.challengeExpiry)}` : "Not released"],
  ];

  return (
    <main id="main">
      <SiteHeader tone="light" />
      <section className="paper-backdrop border-b">
        <div className="container py-10 lg:py-14">
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All campaigns
          </Link>
          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap gap-2">
                <Badge tone={s.tone} dot>{s.label}</Badge>
                {c.metadata?.category ? <Badge>{c.metadata.category}</Badge> : null}
                <Badge tone="neutral">Campaign #{c.id}</Badge>
              </div>
              <h1 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">{title}</h1>
              {c.metadata?.description ? <p className="mt-4 text-muted-foreground">{c.metadata.description}</p> : null}
              <p className="mt-3 text-sm text-muted-foreground">
                Created by{" "}
                <a href={getExplorerAddressUrl(c.creator)} target="_blank" rel="noreferrer" className="font-mono text-foreground hover:underline">
                  {shortAddress(c.creator, 6)}
                </a>
                {c.metadata?.organization ? <> · {c.metadata.organization} <span className="opacity-70">(self-declared)</span></> : null}
              </p>
            </div>
            {c.state === 0 ? (
              <Button asChild size="lg">
                <Link href={`/app/donor/campaigns?campaign=${c.id}`}>
                  <HandCoins aria-hidden /> Fund this campaign
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="mt-8 max-w-xl">
            <div className="mb-2 flex justify-between text-sm">
              <span>
                <strong>{formatTokenAmount(raised)}</strong> <span className="text-muted-foreground">of {formatTokenAmount(budget)} USDC</span>
              </span>
              <span className="text-muted-foreground">{percent(raised, budget).toFixed(1)}%</span>
            </div>
            <Progress value={percent(raised, budget)} label="Funding progress" />
          </div>
        </div>
      </section>

      <div className="container grid gap-6 py-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Escrow facts</CardTitle>
              <p className="text-xs text-muted-foreground">On-chain · read {formatDateTime(res.readAt)}</p>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {facts.map(([k, v]) => (
                  <div key={k} className="border-b pb-3">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-1 text-sm font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4" aria-hidden /> Live fund flow</CardTitle>
              <p className="text-xs text-muted-foreground">Computed from the escrow state and its events. Sub-campaign vaults are a V2 feature; V1 holds one vault per campaign.</p>
            </CardHeader>
            <CardContent>
              <FundFlowDiagram values={computeFundFlow(c, events.status === "ok" ? events.data.events : [])} />
            </CardContent>
          </Card>

          <section aria-labelledby="activity">
            <h2 id="activity" className="mb-3 flex items-center gap-2 text-base font-semibold"><ScrollText className="h-4 w-4" aria-hidden /> On-chain activity</h2>
            {events.status !== "ok" ? (
              <EmptyState icon={WifiOff} title="Event log unavailable" description={events.reason} />
            ) : events.data.events.length === 0 ? (
              <EmptyState icon={ScrollText} title="No events found in the scanned block range" />
            ) : (
              <EventList events={events.data.events} />
            )}
            {events.status === "ok" && events.data.truncated ? (
              <p className="mt-2 text-xs text-muted-foreground">Scanned blocks {events.data.fromBlock.toLocaleString()}–{events.data.toBlock.toLocaleString()}. Older events: use the explorer.</p>
            ) : null}
          </section>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Lifecycle</CardTitle></CardHeader>
            <CardContent>
              <Timeline
                items={LIFECYCLE.map((l) => ({ id: l.key, title: l.title, status: lifecycleStatus(c.state, l.key) }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Validator quorum</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="mb-1.5 flex justify-between"><span>Approvals</span><span>{c.affirmativeVotes} / 3</span></div>
                <Progress value={(c.affirmativeVotes / 3) * 100} label="Approvals toward quorum" />
              </div>
              <div>
                <div className="mb-1.5 flex justify-between"><span>Rejections</span><span>{c.negativeVotes} / 3</span></div>
                <Progress value={(c.negativeVotes / 3) * 100} tone="pending" label="Rejections toward threshold" />
              </div>
              {c.isDisputed ? <Notice tone="error" title="Disputed">A challenge was raised; final payment is locked pending resolution.</Notice> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Evidence</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {c.evidenceIpfsCid ? (
                <>
                  <a href={`${IPFS}${c.evidenceIpfsCid}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 break-all text-verified hover:underline">
                    <FileText className="h-4 w-4 shrink-0" aria-hidden /> {c.evidenceIpfsCid} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  </a>
                  <p className="text-xs text-muted-foreground">Submitted {formatDateTime(c.evidenceSubmittedAt)}. The CID is on-chain; the file content is off-chain and is not itself proof of delivery.</p>
                </>
              ) : (
                <p className="text-muted-foreground">No delivery evidence submitted yet.</p>
              )}
              {c.metadataCid ? (
                <p className="text-xs text-muted-foreground">
                  Campaign metadata:{" "}
                  <a href={`${IPFS}${c.metadataCid}`} target="_blank" rel="noreferrer" className="break-all underline">{c.metadataCid}</a>
                  {c.metadata ? null : " (not retrievable from the gateway)"}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
