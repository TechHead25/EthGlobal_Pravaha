"use client";

import * as React from "react";
import Link from "next/link";
import { Gavel, Inbox, MapPin, Pencil, Siren, Timer } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { CampaignStatusBadge, UnsupportedFeature } from "@/components/dashboard/common";
import { FundFlowDiagram } from "@/components/dashboard/fund-flow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, Progress, Timeline } from "@/components/ui/primitives";
import { computeFundFlow } from "@/lib/escrow/fund-flow";
import { LIFECYCLE, lifecycleStatus } from "@/lib/protocol";
import { formatDateTime, formatTokenAmount, percent } from "@/lib/utils";
import { ConnectCreatorWallet, DAY, useMyCampaigns, useNgoActions } from "./shared";

export function NgoCampaigns({ timingMode }: { timingMode: "DEMO" | "PRODUCTION" }) {
  const w = useWallet();
  const live = useEscrowLive();
  const mine = useMyCampaigns();
  const act = useNgoActions();
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const now = Math.floor(Date.now() / 1000);
  const durations = timingMode === "DEMO" ? { commit: 15 * 60, reveal: 15 * 60 } : { commit: 3 * DAY, reveal: 2 * DAY };

  return (
    <div className="space-y-6">
      <RoleHeader
        eyebrow="NGO dashboard"
        title="Campaign management"
        description="Every campaign you created from this wallet, with its lifecycle, funding, and the actions the contract allows right now."
        actions={<Button asChild><Link href="/app/ngo/campaigns/new">New campaign</Link></Button>}
      />
      <WalletPanel purpose="Campaigns are matched to the creator wallet." />
      <TxStatus />
      {!w.address ? (
        <ConnectCreatorWallet />
      ) : mine.length === 0 ? (
        <EmptyState icon={Inbox} title="No campaigns created by this wallet" action={<Button asChild><Link href="/app/ngo/campaigns/new">Create your first campaign</Link></Button>} />
      ) : (
        <div className="space-y-4">
          {mine.map((c) => {
            const raised = BigInt(c.totalDeposited);
            const budget = BigInt(c.budgetCeiling);
            const m = c.metadata;
            const flow = computeFundFlow(c, live.events);
            const open = expanded === c.id;
            const actions: React.ReactNode[] = [];
            if (c.state === 0 && now > c.fundingDeadline)
              actions.push(<Button key="ft" size="sm" variant="outline" onClick={() => act(`Close funding #${c.id}`, c.id, (x) => x.triggerFundingTimeout(c.id))}><Timer aria-hidden /> Close expired funding</Button>);
            if (c.state === 2 && c.commitDeadline === 0)
              actions.push(
                <ConfirmDialog
                  key="oa"
                  trigger={<Button size="sm"><Gavel aria-hidden /> Open procurement</Button>}
                  title={`Open the sealed-bid auction for #${c.id}?`}
                  description={`Commit window ${durations.commit / 60} min, reveal window ${durations.reveal / 60} min (${timingMode} timing). Cannot be changed after opening.`}
                  confirmLabel="Open in wallet"
                  onConfirm={async () => void (await act(`Open auction #${c.id}`, c.id, (x) => x.openAuction(c.id, durations.commit, durations.reveal)))}
                />
              );
            if (c.state === 5 && now > c.deliveryDeadline)
              actions.push(<Button key="dt" size="sm" variant="outline" onClick={() => act(`Mark delivery missed #${c.id}`, c.id, (x) => x.triggerDeliveryTimeout(c.id))}>Mark delivery missed</Button>);
            return (
              <article key={c.id} className="surface overflow-hidden">
                <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CampaignStatusBadge state={c.state} />
                      {m?.category ? <Badge>{m.category}</Badge> : null}
                      {m?.urgency ? <Badge tone="pending" className="capitalize"><Siren aria-hidden /> {m.urgency}</Badge> : null}
                      {m?.region ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" aria-hidden />{m.region}</span> : null}
                    </div>
                    <Link href={`/campaigns/${c.id}`} className="mt-2 block font-display text-xl tracking-tight hover:underline">{m?.title || `Campaign #${c.id}`}</Link>
                    {!m ? <p className="text-xs text-muted-foreground">Metadata not retrievable from IPFS — title, category and urgency unavailable.</p> : null}
                  </div>
                  <div className="w-full max-w-sm">
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span>{formatTokenAmount(raised)} / {formatTokenAmount(budget)} USDC</span>
                      <span className="text-muted-foreground">{percent(raised, budget).toFixed(1)}%</span>
                    </div>
                    <Progress value={percent(raised, budget)} label="Funding progress" />
                    <p className="mt-1.5 text-xs text-muted-foreground">Funding closes {formatDateTime(c.fundingDeadline)} · delivery by {formatDateTime(c.deliveryDeadline)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-5 py-3">
                  {actions}
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : c.id)} aria-expanded={open}>
                    {open ? "Hide details" : "Lifecycle & fund flow"}
                  </Button>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"><Pencil className="h-3.5 w-3.5" aria-hidden /> Budget and deadlines are immutable on-chain</span>
                </div>
                {open ? (
                  <div className="grid gap-6 border-t p-5 lg:grid-cols-[220px_1fr]">
                    <Timeline items={LIFECYCLE.map((l) => ({ id: l.key, title: l.title, status: lifecycleStatus(c.state, l.key) }))} />
                    <FundFlowDiagram values={flow} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <UnsupportedFeature title="Editing a live campaign">V1 campaigns are immutable once created: budget ceiling, deadlines and metadata CID cannot be changed.</UnsupportedFeature>
        <UnsupportedFeature title="Sub-campaign vaults & allocation">Splitting a campaign into item-level vaults with their own ceilings and specifications is specified for OpenAidEscrowV2.</UnsupportedFeature>
      </div>
      <p className="text-xs text-muted-foreground">Deadline and phase-advance calls are permissionless in the contract — anyone may trigger them once a deadline passes.</p>
    </div>
  );
}
