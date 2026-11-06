"use client";

import { Wallet } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel, UnsupportedFeature, useCampaignTitle } from "@/components/dashboard/common";
import { toTxRows, TransactionTable } from "@/components/dashboard/transaction-table";
import { StatCard, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { presentState } from "@/lib/protocol";
import type { ValidatorContext } from "@/server/validator-context";
import { useValidatorDesk } from "./validator-shared";

export function ValidatorHistory({ ctx }: { ctx: ValidatorContext }) {
  const w = useWallet();
  const live = useEscrowLive();
  const d = useValidatorDesk(ctx);
  const titleFor = useCampaignTitle();
  const rows = toTxRows(d.myVotes, titleFor, (e) => {
    const c = live.getCampaign(e.campaignId);
    const mine = e.args.approved === "true" ? "You approved" : "You rejected";
    return c ? `${mine} · outcome: ${presentState(c.state).label}` : mine;
  });
  const aligned = d.myVotes.filter((e) => {
    const c = live.getCampaign(e.campaignId);
    if (!c || c.state === 7) return false;
    const passed = c.stage1Paid;
    return (e.args.approved === "true") === passed;
  }).length;
  const decided = d.myVotes.filter((e) => live.getCampaign(e.campaignId)?.state !== 7).length;

  return (
    <div className="space-y-6">
      <RoleHeader eyebrow="Validator dashboard" title="Decision history" description="Every vote cast by your wallet, with the motion's final outcome. This record is public on-chain." />
      <WalletPanel purpose="History is read for the connected validator wallet." />
      {!w.address ? (
        <EmptyState icon={Wallet} title="Connect your validator wallet" action={<Button onClick={w.connect} loading={w.connecting}>Connect wallet</Button>} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Votes cast" value={d.myVotes.length} />
            <StatCard label="Motions concluded" value={decided} />
            <StatCard label="Agreed with final outcome" value={decided ? `${aligned}/${decided}` : "—"} hint="Informational only — dissent is legitimate" />
          </div>
          <Panel title="Votes">
            <TransactionTable rows={rows} emptyMessage="No votes from this wallet in the scanned range." searchPlaceholder="Search votes" />
          </Panel>
          <UnsupportedFeature title="Participation score, rewards, penalties & appeals">
            Reputation changes, reward and penalty history, and appeal assignments are V2 features. The V1 contract records votes only.
          </UnsupportedFeature>
        </>
      )}
    </div>
  );
}
