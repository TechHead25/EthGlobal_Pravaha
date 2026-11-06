"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import type { CampaignView } from "@/lib/escrow/types";
import { requiredBidBond } from "@/lib/arc/tx";
import { formatDateTime, formatTokenAmount } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { CampaignExplorer } from "@/components/dashboard/campaign-explorer";
import { Panel, UnsupportedFeature } from "@/components/dashboard/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVendorActions, useVendorPortfolio } from "./vendor-shared";

function CommitBidDialog({ c, onCommit }: { c: CampaignView; onCommit: (c: CampaignView, amount: string, days?: string) => Promise<void> }) {
  const w = useWallet();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [days, setDays] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const bond = requiredBidBond(BigInt(c.budgetCeiling));
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button className="w-full" disabled={!w.address}><Lock aria-hidden /> Submit sealed bid</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sealed bid · {c.metadata?.title || `Campaign #${c.id}`}</DialogTitle>
          <DialogDescription>Only a hash of (amount, random salt, your address) is published. Competitors cannot see your price until you reveal.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Budget ceiling</dt><dd className="font-medium">{formatTokenAmount(BigInt(c.budgetCeiling))} USDC</dd></div>
            <div><dt className="text-xs text-muted-foreground">Bond to lock (5%)</dt><dd className="font-medium">{formatTokenAmount(bond)} USDC</dd></div>
            <div><dt className="text-xs text-muted-foreground">Commit until</dt><dd>{formatDateTime(c.commitDeadline)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Delivery deadline</dt><dd>{formatDateTime(c.deliveryDeadline)}</dd></div>
          </dl>
          <FormField id={`bid-${c.id}`} label="Your price (USDC)">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </FormField>
          <FormField id={`days-${c.id}`} label="Your delivery timeline (days, private note)" hint="Kept in this browser with your secret. The V1 contract ranks on price and does not record timelines.">
            <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </FormField>
          <Notice tone="warning">Your reveal secret is stored in this browser. If you clear storage before the reveal phase, you will need the salt (copy it from My bids).</Notice>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!amount}
            onClick={async () => {
              setBusy(true);
              try {
                await onCommit(c, amount, days || undefined);
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            Lock bond & commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VendorOpportunities() {
  const v = useVendorPortfolio();
  const actions = useVendorActions(v.reload);
  return (
    <div className="space-y-6">
      <RoleHeader eyebrow="Vendor dashboard" title="Bidding opportunities" description="Funded campaigns accepting sealed bids, plus campaigns heading to procurement. Filter by category and location." />
      <WalletPanel purpose="Bids are bound to this wallet." />
      <TxStatus />
      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Accepting bids <Badge className="ml-1">{v.openCommit.length}</Badge></TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming <Badge className="ml-1">{v.upcoming.length}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="open">
          <CampaignExplorer campaigns={v.openCommit} action={(c) => <CommitBidDialog c={c} onCommit={actions.commit} />} hrefFor={(c) => `/campaigns/${c.id}`} />
        </TabsContent>
        <TabsContent value="upcoming">
          <CampaignExplorer
            campaigns={v.upcoming}
            action={(c) => <p className="text-center text-xs text-muted-foreground">{c.state === 0 ? "Still raising funds" : "Funded — waiting for the NGO to open procurement"}</p>}
          />
        </TabsContent>
      </Tabs>
      <Panel title="Eligibility">
        <UnsupportedFeature title="Eligibility filtering by shortlist, category & region">
          The V1 contract lets any wallet bid on any open auction, so every open auction is listed. Showing only campaigns you are shortlisted for requires the V2 shortlist.
        </UnsupportedFeature>
      </Panel>
    </div>
  );
}
