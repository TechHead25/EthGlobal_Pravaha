"use client";

import * as React from "react";
import Link from "next/link";
import { CircleDashed, FileSearch, Gavel, ThumbsDown, ThumbsUp } from "lucide-react";
import type { CampaignView } from "@/lib/escrow/types";
import { computeFundFlow } from "@/lib/escrow/fund-flow";
import { formatDateTime, formatTokenAmount, shortAddress, cn } from "@/lib/utils";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { CampaignStatusBadge, Panel, UnsupportedFeature } from "@/components/dashboard/common";
import { EvidenceViewer } from "@/components/dashboard/evidence-viewer";
import { FundFlowDiagram } from "@/components/dashboard/fund-flow";
import { BidLadder } from "@/components/dashboard/bid-ladder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, Notice, Progress } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ValidatorContext } from "@/server/validator-context";
import { EligibilityCard, useValidatorDesk } from "./validator-shared";

const MOTION_TYPES = [
  { key: "release", title: "Fund release approval", supported: true, note: "castVote on delivery evidence" },
  { key: "dispute", title: "Dispute resolution", supported: true, note: "resolveDispute during a challenge" },
  { key: "campaign", title: "Campaign approval", supported: false, note: "V2" },
  { key: "award", title: "Vendor award approval", supported: false, note: "V2" },
  { key: "fallback", title: "Fallback confirmation", supported: false, note: "V2" },
  { key: "audit", title: "Volunteer audit", supported: false, note: "V2" },
];

export function ValidatorReviews({ ctx, focus }: { ctx: ValidatorContext; focus: number | null }) {
  const w = useWallet();
  const live = useEscrowLive();
  const d = useValidatorDesk(ctx);
  const motions = [...d.reviews, ...d.disputes];
  const [id, setId] = React.useState<number | null>(focus);
  const current = motions.find((c) => c.id === id) ?? motions[0];

  async function vote(c: CampaignView, approve: boolean) {
    const rec = await w.runTx(`${approve ? "Approve" : "Reject"} release #${c.id}`, ({ escrow }) => escrow.castVote(c.id, approve, ctx.challengeWindowSeconds));
    if (rec) await Promise.all([live.refresh([c.id]), d.reload()]);
  }
  async function resolve(c: CampaignView, uphold: boolean) {
    const rec = await w.runTx(`${uphold ? "Uphold" : "Dismiss"} dispute #${c.id}`, ({ escrow }) => escrow.resolveDispute(c.id, uphold));
    if (rec) await live.refresh([c.id]);
  }

  return (
    <div className="space-y-6">
      <RoleHeader eyebrow="Validator dashboard" title="Motions & evidence review" description="Review the evidence relevant to each motion, then record your decision on-chain. The contract counts votes and executes the outcome." />
      <WalletPanel purpose="Votes are signed by your registered validator wallet." />
      <TxStatus />

      <Panel title="Motion types" description="What the deployed contract lets validators decide.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MOTION_TYPES.map((m) => (
            <div key={m.key} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm", !m.supported && "border-dashed bg-muted/30")}>
              {m.supported ? <Gavel className="h-4 w-4 text-verified" aria-hidden /> : <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />}
              <span className="flex-1 font-medium">{m.title}</span>
              <Badge tone={m.supported ? "verified" : "neutral"}>{m.supported ? "Live" : "V2"}</Badge>
            </div>
          ))}
        </div>
        <UnsupportedFeature className="mt-3" compact title="Blind commit–reveal voting">
          V1 votes are cast directly and are publicly visible on-chain as soon as they confirm. Hidden commit–reveal voting is specified for V2.
        </UnsupportedFeature>
      </Panel>

      {motions.length === 0 ? (
        <EmptyState icon={FileSearch} title="No open motions" description="Motions open when a vendor submits delivery evidence or someone raises a dispute." />
      ) : current ? (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Open motions">
            {motions.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={current.id === c.id}
                onClick={() => setId(c.id)}
                className={cn("rounded-lg border px-3 py-2 text-left text-sm transition-colors", current.id === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
              >
                <span className="block font-medium">#{c.id} · {c.state === 10 ? "Dispute" : "Fund release"}</span>
                <span className={cn("text-xs", current.id === c.id ? "text-primary-foreground/70" : "text-muted-foreground")}>{c.metadata?.title || "Untitled"}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <Panel
                title={`${current.state === 10 ? "Dispute resolution" : "Fund release approval"} · ${current.metadata?.title || `Campaign #${current.id}`}`}
                description={`Vendor ${shortAddress(current.winningVendor)} · contract ${formatTokenAmount(BigInt(current.winningBidAmount))} USDC`}
                action={<CampaignStatusBadge state={current.state} />}
              >
                <Tabs defaultValue="evidence">
                  <TabsList>
                    <TabsTrigger value="evidence">Evidence</TabsTrigger>
                    <TabsTrigger value="spec">Specification</TabsTrigger>
                    <TabsTrigger value="bids">Bid ranking</TabsTrigger>
                    <TabsTrigger value="funds">Funds</TabsTrigger>
                    <TabsTrigger value="vendor">Vendor history</TabsTrigger>
                  </TabsList>
                  <TabsContent value="evidence">
                    <EvidenceViewer campaign={current} />
                    {current.state === 10 ? (
                      <Notice tone="error" title="Counter-evidence" className="mt-3">
                        <span className="break-all font-mono text-xs">{current.disputeEvidenceCid}</span> · raised by {shortAddress(current.challenger)}
                      </Notice>
                    ) : null}
                  </TabsContent>
                  <TabsContent value="spec">
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{current.metadata?.description || "No specification in campaign metadata."}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs text-muted-foreground">Category</dt><dd>{current.metadata?.category ?? "—"}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Region</dt><dd>{current.metadata?.region ?? "—"}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Delivery deadline</dt><dd>{formatDateTime(current.deliveryDeadline)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Evidence submitted</dt><dd>{formatDateTime(current.evidenceSubmittedAt)}</dd></div>
                    </dl>
                  </TabsContent>
                  <TabsContent value="bids"><BidLadder campaign={current} /></TabsContent>
                  <TabsContent value="funds"><FundFlowDiagram values={computeFundFlow(current, live.events)} /></TabsContent>
                  <TabsContent value="vendor">
                    <VendorHistory vendor={current.winningVendor} exclude={current.id} />
                  </TabsContent>
                </Tabs>
              </Panel>
            </div>

            <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
              <Panel title="Your decision">
                {current.state === 7 ? (
                  <div className="space-y-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span>Approvals</span><span>{current.affirmativeVotes} / 3</span></div>
                      <Progress value={(current.affirmativeVotes / 3) * 100} label="Approvals" />
                      <div className="flex justify-between"><span>Rejections</span><span>{current.negativeVotes} / 3</span></div>
                      <Progress value={(current.negativeVotes / 3) * 100} tone="pending" label="Rejections" />
                    </div>
                    {d.voted[current.id] ? (
                      <Notice tone="success">Your vote on this motion is recorded on-chain.</Notice>
                    ) : (
                      <div className="grid gap-2">
                        <ConfirmDialog
                          disabled={!d.canVote}
                          trigger={<Button variant="verified" disabled={!d.canVote}><ThumbsUp aria-hidden /> Approve release</Button>}
                          title={`Approve delivery for campaign #${current.id}?`}
                          description="Final and public on-chain. If this is the third approval, 70% of the contract value is released to the vendor immediately."
                          confirmLabel="Sign approval"
                          tone="verified"
                          onConfirm={() => vote(current, true)}
                        />
                        <ConfirmDialog
                          disabled={!d.canVote}
                          trigger={<Button variant="outline" disabled={!d.canVote}><ThumbsDown aria-hidden /> Reject evidence</Button>}
                          title={`Reject evidence for campaign #${current.id}?`}
                          description="Final and public on-chain. Three rejections fail verification and open full donor refunds."
                          confirmLabel="Sign rejection"
                          tone="destructive"
                          onConfirm={() => vote(current, false)}
                        />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Voting deadline: none in V1. Motions stay open until a 3-vote threshold is reached.</p>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <ConfirmDialog disabled={!d.canVote} trigger={<Button variant="destructive" disabled={!d.canVote}>Uphold dispute</Button>} title="Uphold this dispute?" description="The vendor's final 30% and bond are withheld; the challenger is rewarded; donors receive the surplus." tone="destructive" confirmLabel="Sign" onConfirm={() => resolve(current, true)} />
                    <ConfirmDialog disabled={!d.canVote} trigger={<Button variant="outline" disabled={!d.canVote}>Dismiss dispute</Button>} title="Dismiss this dispute?" description="The vendor receives the final 30% and bond; the challenger forfeits half the dispute bond." confirmLabel="Sign" onConfirm={() => resolve(current, false)} />
                    <p className="text-xs text-muted-foreground">In V1 a single validator&apos;s call resolves the dispute.</p>
                  </div>
                )}
              </Panel>
              <Panel title="Eligibility">
                <EligibilityCard ctx={ctx} isValidator={d.isValidator} />
              </Panel>
              <p className="text-xs text-muted-foreground">Automated CRE checks and Arkiv records are advisory and off-chain. An AI or oracle summary is not proof of delivery. <Link href="/how-it-works" className="underline">Protocol rules</Link></p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function VendorHistory({ vendor, exclude }: { vendor: string; exclude: number }) {
  const live = useEscrowLive();
  const history = live.campaigns.filter((c) => c.id !== exclude && c.winningVendor.toLowerCase() === vendor.toLowerCase());
  if (history.length === 0) return <p className="text-sm text-muted-foreground">No other contracts awarded to {shortAddress(vendor)} on this escrow.</p>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {history.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-2 p-3">
          <Link href={`/campaigns/${c.id}`} className="hover:underline">#{c.id} {c.metadata?.title ?? ""}</Link>
          <CampaignStatusBadge state={c.state} />
        </li>
      ))}
    </ul>
  );
}
