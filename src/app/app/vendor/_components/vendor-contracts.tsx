"use client";

import * as React from "react";
import { FileUp, Inbox, PackageCheck, Truck, Wallet } from "lucide-react";
import type { CampaignView } from "@/lib/escrow/types";
import { formatDateTime, formatTokenAmount } from "@/lib/utils";
import { computeFundFlow } from "@/lib/escrow/fund-flow";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { CampaignStatusBadge, Panel, UnsupportedFeature, useCampaignTitle } from "@/components/dashboard/common";
import { FundFlowDiagram } from "@/components/dashboard/fund-flow";
import { EvidenceViewer } from "@/components/dashboard/evidence-viewer";
import { toTxRows, TransactionTable } from "@/components/dashboard/transaction-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/input";
import { EmptyState, StatCard } from "@/components/ui/primitives";
import { useVendorActions, useVendorPortfolio } from "./vendor-shared";

function ContractCard({ c, actions, bond }: { c: CampaignView; actions: ReturnType<typeof useVendorActions>; bond: bigint | null }) {
  const live = useEscrowLive();
  const [cid, setCid] = React.useState("");
  const flow = computeFundFlow(c, live.events);
  const now = Math.floor(Date.now() / 1000);
  return (
    <article className="surface space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl tracking-tight">{c.metadata?.title || `Campaign #${c.id}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">Contract value {formatTokenAmount(flow.awarded)} USDC · delivery deadline {formatDateTime(c.deliveryDeadline)}</p>
        </div>
        <CampaignStatusBadge state={c.state} />
      </div>
      {c.metadata?.description ? (
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-medium">Delivery requirements (NGO specification)</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.metadata.description}</p>
        </div>
      ) : null}
      <FundFlowDiagram values={flow} />
      <p className="text-xs text-muted-foreground">Performance bond: {bond === null ? "…" : `${formatTokenAmount(bond)} USDC ${bond > 0n ? "held until final settlement" : "released or slashed"}`}</p>

      {c.state === 5 ? (
        <div className="rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-medium"><FileUp className="h-4 w-4" aria-hidden /> Submit proof of delivery</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Bundle your GST invoice, delivery challan, e-way bill, geotagged and timestamped photos, and beneficiary acknowledgements into one manifest, pin it to IPFS, and submit its CID. It is anchored on-chain and cannot be changed afterwards.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <FormField id={`ev-${c.id}`} label="Manifest IPFS CID" className="flex-1">
              <Input value={cid} onChange={(e) => setCid(e.target.value)} className="font-mono" autoComplete="off" />
            </FormField>
            <ConfirmDialog
              trigger={<Button disabled={!cid}><PackageCheck aria-hidden /> Submit evidence</Button>}
              title="Submit delivery evidence?"
              description="The manifest CID is written on-chain and moves the campaign to validator review."
              confirmLabel="Open wallet"
              onConfirm={() => actions.submitEvidence(c, cid)}
            />
          </div>
        </div>
      ) : c.evidenceIpfsCid ? (
        <EvidenceViewer campaign={c} />
      ) : null}

      {c.state === 9 && now > c.challengeExpiry && !c.isDisputed ? (
        <Button variant="verified" onClick={() => void actions.finalize(c)}><Truck aria-hidden /> Finalize settlement (30% + bond)</Button>
      ) : c.state === 9 ? (
        <p className="text-xs text-muted-foreground">Final payment becomes claimable after {formatDateTime(c.challengeExpiry)} if no dispute is upheld. Anyone can trigger it — the contract pays only you.</p>
      ) : null}
    </article>
  );
}

export function VendorContracts() {
  const w = useWallet();
  const v = useVendorPortfolio();
  const actions = useVendorActions(v.reload);
  const titleFor = useCampaignTitle();
  const payRows = toTxRows(v.payments, titleFor, () => "Paid to your wallet");
  return (
    <div className="space-y-6">
      <RoleHeader eyebrow="Vendor dashboard" title="Contracts & payments" description="Awarded contracts, delivery evidence, and milestone payments. Releases are triggered by validator quorum and the challenge window — never by you." />
      <WalletPanel purpose="Awards are bound to the winning wallet." />
      <TxStatus />
      {!w.address ? (
        <EmptyState icon={Wallet} title="Connect the wallet you bid from" action={<Button onClick={w.connect} loading={w.connecting}>Connect wallet</Button>} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total contract value" value={formatTokenAmount(v.flows.reduce((s, f) => s + f.flow.awarded, 0n))} hint="USDC across awarded contracts" />
            <StatCard label="Received" value={formatTokenAmount(v.received)} hint="Stage 1 + Stage 2 payouts" />
            <StatCard label="Held in escrow for you" value={formatTokenAmount(v.pendingPayments)} hint="Pending milestones" />
          </div>
          {v.awarded.length === 0 ? (
            <EmptyState icon={Inbox} title="No awarded contracts yet" description="Win an auction to see delivery requirements, milestones and payments here." />
          ) : (
            <div className="space-y-4">
              {v.awarded.map((c) => <ContractCard key={c.id} c={c} actions={actions} bond={v.commitments?.[c.id]?.bondAmount ?? null} />)}
            </div>
          )}
          <Panel title="Payment transactions">
            <TransactionTable rows={payRows} emptyMessage="No payouts to this wallet yet." />
          </Panel>
          <UnsupportedFeature title="Structured document uploads & milestone schedule">
            Per-document uploads (GST invoices, challans, e-way bills, photos) and custom milestone schedules are not recorded by the V1 contract. V1 uses a fixed 70/30 schedule with one manifest CID.
          </UnsupportedFeature>
        </>
      )}
    </div>
  );
}
