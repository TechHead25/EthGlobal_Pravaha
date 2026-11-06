"use client";

import * as React from "react";
import { Gavel, Inbox } from "lucide-react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel, UnsupportedFeature } from "@/components/dashboard/common";
import { BidLadder } from "@/components/dashboard/bid-ladder";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, Timeline } from "@/components/ui/primitives";
import { formatDateTime, formatTokenAmount, shortAddress } from "@/lib/utils";
import { ZERO_ADDRESS } from "@/lib/escrow/types";
import { CampaignSelect } from "./campaign-select";
import { ConnectCreatorWallet, DAY, useMyCampaigns, useNgoActions } from "./shared";

export function NgoProcurement({ timingMode }: { timingMode: "DEMO" | "PRODUCTION" }) {
  const w = useWallet();
  const mine = useMyCampaigns();
  const act = useNgoActions();
  const procurement = mine.filter((c) => c.state >= 2 && c.state !== 1);
  const [id, setId] = React.useState<number | undefined>(undefined);
  const c = procurement.find((x) => x.id === id) ?? procurement[0];
  const now = Math.floor(Date.now() / 1000);
  const durations = timingMode === "DEMO" ? { commit: 15 * 60, reveal: 15 * 60 } : { commit: 3 * DAY, reveal: 2 * DAY };

  return (
    <div className="space-y-6">
      <RoleHeader eyebrow="NGO dashboard" title="Procurement" description="Publish requirements, run the sealed-bid auction, and watch the contract rank bids. You define the need — you cannot pick the winner." />
      <WalletPanel purpose="Phase calls are signed by your wallet." />
      <TxStatus />
      {!w.address ? (
        <ConnectCreatorWallet />
      ) : procurement.length === 0 ? (
        <EmptyState icon={Inbox} title="No campaigns have reached procurement" description="A campaign enters procurement once it is fully funded." />
      ) : c ? (
        <>
          <CampaignSelect campaigns={procurement} value={c.id} onChange={setId} />
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <Panel title="Bid ranking" description="Read live from the contract. Sealed amounts stay hidden until each vendor reveals.">
              <BidLadder campaign={c} />
            </Panel>
            <div className="space-y-6">
              <Panel title="Auction timeline">
                <Timeline
                  items={[
                    { id: "funded", title: "Fully funded", status: "done", meta: `${formatTokenAmount(BigInt(c.totalDeposited))} USDC` },
                    { id: "open", title: "Auction opened", status: c.commitDeadline ? "done" : "current" },
                    { id: "commit", title: "Commit window", status: c.commitDeadline === 0 ? "upcoming" : c.state === 2 ? "current" : "done", meta: c.commitDeadline ? `until ${formatDateTime(c.commitDeadline)}` : undefined },
                    { id: "reveal", title: "Reveal window", status: c.state < 3 ? "upcoming" : c.state === 3 ? "current" : c.state === 4 ? "failed" : "done", meta: c.revealDeadline ? `until ${formatDateTime(c.revealDeadline)}` : undefined },
                    { id: "award", title: "Vendor awarded", status: c.winningVendor !== ZERO_ADDRESS ? "done" : c.state === 4 ? "failed" : "upcoming", meta: c.winningVendor !== ZERO_ADDRESS ? shortAddress(c.winningVendor) : undefined },
                  ]}
                />
                <div className="mt-4 grid gap-2">
                  {c.state === 2 && c.commitDeadline === 0 ? (
                    <ConfirmDialog
                      trigger={<Button className="w-full"><Gavel aria-hidden /> Open procurement</Button>}
                      title={`Open the auction for #${c.id}?`}
                      description={`Commit ${durations.commit / 60} min · reveal ${durations.reveal / 60} min (${timingMode} timing).`}
                      confirmLabel="Open in wallet"
                      onConfirm={async () => void (await act(`Open auction #${c.id}`, c.id, (x) => x.openAuction(c.id, durations.commit, durations.reveal)))}
                    />
                  ) : null}
                  {c.state === 2 && c.commitDeadline > 0 && now > c.commitDeadline ? (
                    <Button variant="outline" onClick={() => act(`Advance to reveal #${c.id}`, c.id, (x) => x.advanceToReveal(c.id))}>Advance to reveal phase</Button>
                  ) : null}
                  {c.state === 3 && now > c.revealDeadline ? (
                    <Button onClick={() => act(`Finalize auction #${c.id}`, c.id, (x) => x.finalizeAuction(c.id))}>Finalize auction (contract picks winner)</Button>
                  ) : null}
                </div>
              </Panel>
              <Panel title="Published specification">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{c.metadata?.description || "No description in campaign metadata."}</p>
                <p className="mt-2 text-xs text-muted-foreground">Budget ceiling {formatTokenAmount(BigInt(c.budgetCeiling))} USDC · delivery by {formatDateTime(c.deliveryDeadline)}</p>
              </Panel>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <UnsupportedFeature title="Vendor shortlist">Restricting bidding to an NGO-defined eligible pool is specified for V2. In V1 any wallet may bid.</UnsupportedFeature>
            <UnsupportedFeature title="Combined price/trust/delivery score">V1 ranks on price only (lowest valid reveal). Multi-factor scoring is V2.</UnsupportedFeature>
            <UnsupportedFeature title="Validator award approval">V1 awards automatically on finalizeAuction; a validator motion on the award is V2.</UnsupportedFeature>
          </div>
        </>
      ) : null}
    </div>
  );
}
