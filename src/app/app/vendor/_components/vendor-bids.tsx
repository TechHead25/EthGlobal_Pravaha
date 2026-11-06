"use client";

import * as React from "react";
import { Copy, Eye, Gavel, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { CampaignView } from "@/lib/escrow/types";
import { formatDateTime, formatTokenAmount } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { CampaignStatusBadge, Panel } from "@/components/dashboard/common";
import { BidLadder } from "@/components/dashboard/bid-ladder";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/input";
import { EmptyState, Notice } from "@/components/ui/primitives";
import { bidKey, loadBid, useVendorActions, useVendorPortfolio, type SavedBid } from "./vendor-shared";

function RevealCard({ c, saved, expected, onReveal }: { c: CampaignView; saved: SavedBid | null; expected: string | undefined; onReveal: (c: CampaignView, a: string, s: string, e: string | undefined) => Promise<void> }) {
  const [amount, setAmount] = React.useState(saved?.amount ?? "");
  const [salt, setSalt] = React.useState(saved?.salt ?? "");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="surface space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{c.metadata?.title || `Campaign #${c.id}`}</p>
        <span className="text-xs text-muted-foreground">Reveal before {formatDateTime(c.revealDeadline)}</span>
      </div>
      {saved ? <Notice tone="success">Your bid secret was found in this browser.</Notice> : <Notice tone="warning">No saved secret in this browser — enter your amount and salt.</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`ra-${c.id}`} label="Bid amount (USDC)"><Input value={amount} onChange={(e) => setAmount(e.target.value)} /></FormField>
        <FormField id={`rs-${c.id}`} label="Salt">
          <Input type={show ? "text" : "password"} value={salt} onChange={(e) => setSalt(e.target.value)} className="font-mono" autoComplete="off" spellCheck={false} />
        </FormField>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShow((s) => !s)}><Eye aria-hidden /> {show ? "Hide" : "Show"} salt</Button>
        <Button variant="ghost" size="sm" disabled={!salt} onClick={() => navigator.clipboard.writeText(salt).then(() => toast.success("Salt copied"))}><Copy aria-hidden /> Copy salt</Button>
        <Button
          size="sm"
          className="ml-auto"
          loading={busy}
          disabled={!amount || !salt}
          onClick={async () => {
            setBusy(true);
            try {
              await onReveal(c, amount, salt, expected);
            } finally {
              setBusy(false);
            }
          }}
        >
          Reveal bid
        </Button>
      </div>
    </div>
  );
}

export function VendorBids() {
  const w = useWallet();
  const v = useVendorPortfolio();
  const actions = useVendorActions(v.reload);
  const [focus, setFocus] = React.useState<number | null>(null);
  const ladderFor = v.myBids.find((c) => c.id === focus) ?? v.myBids.find((c) => c.state >= 3);

  return (
    <div className="space-y-6">
      <RoleHeader eyebrow="Vendor dashboard" title="My bids" description="Reveal during the reveal window, track each commitment, and see how the contract ranked revealed bids." />
      <WalletPanel purpose="Commitments are bound to this wallet." />
      <TxStatus />
      {!w.address ? (
        <EmptyState icon={Wallet} title="Connect the wallet you bid from" action={<Button onClick={w.connect} loading={w.connecting}>Connect wallet</Button>} />
      ) : (
        <>
          <Panel title="Awaiting your reveal" description="Unrevealed bids forfeit their 5% bond when the auction is finalized.">
            {v.toReveal.length === 0 ? (
              <p className="text-sm text-muted-foreground">No commitments are in their reveal window.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {v.toReveal.map((c) => (
                  <RevealCard key={c.id} c={c} saved={loadBid(bidKey(w.escrowAddress, c.id, w.address!))} expected={v.commitments?.[c.id]?.commitHash} onReveal={actions.reveal} />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Bid history">
            {!v.ready ? (
              <div className="h-20 animate-pulse-soft rounded-lg bg-muted" />
            ) : v.myBids.length === 0 ? (
              <EmptyState icon={Gavel} title="No commitments from this wallet" />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr><th className="px-3 py-2">Campaign</th><th className="px-3 py-2">Phase</th><th className="px-3 py-2">Your bid</th><th className="px-3 py-2">Bond</th><th className="px-3 py-2">Result</th><th className="px-3 py-2" /></tr>
                  </thead>
                  <tbody>
                    {v.myBids.map((c) => {
                      const m = v.commitments![c.id];
                      const saved = loadBid(bidKey(w.escrowAddress, c.id, w.address!));
                      const won = c.winningVendor.toLowerCase() === w.address!.toLowerCase();
                      return (
                        <tr key={c.id} className="border-t">
                          <td className="px-3 py-2.5 font-medium">#{c.id} {c.metadata?.title ?? ""}</td>
                          <td className="px-3 py-2.5"><CampaignStatusBadge state={c.state} /></td>
                          <td className="px-3 py-2.5">{m.revealed ? `${formatTokenAmount(m.revealedAmount)} USDC (revealed)` : saved ? `${saved.amount} USDC (sealed)` : "Sealed"}</td>
                          <td className="px-3 py-2.5">{formatTokenAmount(m.bondAmount)} USDC {m.bondAmount === 0n && c.state >= 4 ? "· returned or slashed" : "· locked"}</td>
                          <td className="px-3 py-2.5">{won ? "Won" : c.state >= 4 && c.state !== 4 ? (m.revealed ? "Not selected" : "Not revealed") : c.state === 4 ? "Auction failed" : "Pending"}</td>
                          <td className="px-3 py-2.5 text-right">{c.state >= 3 ? <Button size="sm" variant="ghost" onClick={() => setFocus(c.id)}>Ranking</Button> : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {ladderFor ? (
            <Panel title={`Ranking · campaign #${ladderFor.id}`} description="Only revealed bids are visible; competitors' sealed bids stay hidden.">
              <BidLadder campaign={ladderFor} highlight={w.address} />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
