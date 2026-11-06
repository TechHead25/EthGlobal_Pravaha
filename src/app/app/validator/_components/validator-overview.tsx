"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, FileSearch, Gavel, Scale, ScrollText, Users } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel, PendingActions, UnsupportedFeature, type PendingAction } from "@/components/dashboard/common";
import { DonutChart } from "@/components/dashboard/charts";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { useValidatorSet } from "@/components/dashboard/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/primitives";
import { getExplorerAddressUrl } from "@/lib/arc/config";
import { shortAddress } from "@/lib/utils";
import type { ValidatorContext } from "@/server/validator-context";
import { EligibilityCard, useValidatorDesk } from "./validator-shared";

export function ValidatorOverview({ ctx }: { ctx: ValidatorContext }) {
  const w = useWallet();
  const live = useEscrowLive();
  const d = useValidatorDesk(ctx);
  const set = useValidatorSet(ctx.deploymentValidators);

  const actions: PendingAction[] = [
    ...d.pending.map((c) => ({ id: `m-${c.id}`, title: `Fund release motion · campaign #${c.id}`, description: `${c.affirmativeVotes} approve · ${c.negativeVotes} reject so far`, href: `/app/validator/reviews?campaign=${c.id}`, cta: "Review", tone: "pending" as const })),
    ...d.disputes.map((c) => ({ id: `d-${c.id}`, title: `Dispute resolution · campaign #${c.id}`, href: `/app/validator/reviews?campaign=${c.id}`, cta: "Review", tone: "failed" as const })),
  ];

  return (
    <div className="space-y-8">
      <RoleHeader
        eyebrow="Validator dashboard"
        title="Independent verification"
        description="You verify evidence; you never choose vendors or move funds. Your vote is recorded on-chain and the contract enforces the quorum."
        actions={<Button asChild><Link href="/app/validator/reviews"><Scale aria-hidden /> Open motions</Link></Button>}
      />
      <WalletPanel purpose="Use the wallet registered in the on-chain validator set." />
      <TxStatus />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active assignments" icon={FileSearch} value={d.reviews.length + d.disputes.length} hint="Open motions you are eligible to decide" />
        <StatCard label="Awaiting your vote" icon={Gavel} value={w.address ? d.pending.length : "—"} />
        <StatCard label="Decisions recorded" icon={CheckCircle2} value={w.address ? d.myVotes.length : "—"} hint={w.address ? `${d.approvals} approve · ${d.rejections} reject` : "Connect wallet"} />
        <StatCard label="Eligibility" icon={Users} value={d.canVote ? "Eligible" : "Not yet"} hint="World ID + on-chain set + network" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Your eligibility">
          <EligibilityCard ctx={ctx} isValidator={d.isValidator} />
        </Panel>
        <Panel title="Pending motions">
          <PendingActions items={actions} emptyLabel="No motions are open right now." />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Your decisions" description="Approve vs. reject, from your on-chain votes.">
          <DonutChart valueFormatter={(n) => `${n} vote${n === 1 ? "" : "s"}`} emptyLabel="No votes cast from this wallet" data={[{ name: "Approved", value: d.approvals }, { name: "Rejected", value: d.rejections }]} />
          <p className="mt-2 text-xs text-muted-foreground">Honest disagreement with the majority is not misconduct, and it is never displayed as such.</p>
        </Panel>
        <Panel title="Validator panel (V1)" description="V1 uses one fixed five-member set registered when the contract was deployed. Every member may vote on every motion.">
          {ctx.deploymentValidators.length === 0 ? (
            <p className="text-sm text-muted-foreground">Deployment record not available for the configured escrow.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {ctx.deploymentValidators.map((a) => (
                <li key={a} className="flex items-center justify-between gap-2 p-2.5">
                  <a href={getExplorerAddressUrl(a)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs hover:underline">
                    {shortAddress(a, 6)} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                  <span className="flex items-center gap-2">
                    {w.address?.toLowerCase() === a.toLowerCase() ? <Badge tone="info">You</Badge> : null}
                    {set === null ? <Badge>Checking…</Badge> : set[a] ? <Badge tone="verified">Active on-chain</Badge> : <Badge tone="failed">Not registered</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <UnsupportedFeature title="Randomized, stratified jury selection">
          Summons, acceptance deadlines, alternates, expertise/region stratification, conflict-of-interest checks and NGO strikes are specified for V2. V1 has no selection step, so no one, including administrators, can hand-pick a panel.
        </UnsupportedFeature>
        <UnsupportedFeature title="Reputation, tiers, rewards & penalties">
          No reputation score, tier, reward or penalty exists in the V1 contract, so none is displayed.
        </UnsupportedFeature>
      </div>

      <Panel title="Recent validation activity" action={<Link href="/app/validator/history" className="inline-flex items-center gap-1 text-xs text-verified hover:underline"><ScrollText className="h-3.5 w-3.5" aria-hidden /> Full history</Link>}>
        <ActivityFeed
          events={live.events.filter((e) => ["EvidenceSubmitted", "VoteCast", "QuorumReached", "DisputeRaised", "DisputeResolved", "Stage1Settled"].includes(e.name))}
          freshKeys={live.freshKeys}
          emptyTitle="No validation activity yet"
        />
      </Panel>
    </div>
  );
}
