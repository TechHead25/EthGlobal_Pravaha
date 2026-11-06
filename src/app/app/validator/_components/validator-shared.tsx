"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, Fingerprint, ShieldAlert, Wallet } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useValidatorStatus } from "@/components/dashboard/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import type { ValidatorContext } from "@/server/validator-context";

const WorldIdVerify = dynamic(() => import("../world-id-verify"), { ssr: false, loading: () => <Button loading>Loading World ID…</Button> });

/** One derivation of validator eligibility + workload shared by validator pages. */
export function useValidatorDesk(ctx: ValidatorContext) {
  const w = useWallet();
  const live = useEscrowLive();
  const { isValidator, voted, reload } = useValidatorStatus();
  const me = w.address?.toLowerCase();
  return React.useMemo(() => {
    const reviews = live.campaigns.filter((c) => c.state === 7);
    const disputes = live.campaigns.filter((c) => c.state === 10);
    const myVotes = me ? live.events.filter((e) => e.name === "VoteCast" && e.args.validator?.toLowerCase() === me) : [];
    const humanVerified = Boolean(ctx.worldId.verifiedAt);
    return {
      reviews,
      disputes,
      myVotes,
      voted,
      reload,
      isValidator,
      humanVerified,
      canVote: humanVerified && isValidator === true && w.isCorrectNetwork,
      pending: reviews.filter((c) => !voted[c.id]),
      approvals: myVotes.filter((e) => e.args.approved === "true").length,
      rejections: myVotes.filter((e) => e.args.approved !== "true").length,
    };
  }, [live.campaigns, live.events, me, voted, reload, isValidator, ctx.worldId.verifiedAt, w.isCorrectNetwork]);
}

export function EligibilityCard({ ctx, isValidator }: { ctx: ValidatorContext; isValidator: boolean | null }) {
  const w = useWallet();
  const human = Boolean(ctx.worldId.verifiedAt);
  const rows = [
    { label: "Validator role (application)", ok: true, detail: "Granted by an administrator" },
    { label: "Human uniqueness (World ID)", ok: human, detail: human ? `Verified ${formatDateTime(ctx.worldId.verifiedAt)}` : ctx.worldId.configured ? "Required before voting" : "World ID not configured on this server" },
    {
      label: "On-chain validator set",
      ok: isValidator === true,
      detail: !w.address ? "Connect your validator wallet" : isValidator === null ? "Checking…" : isValidator ? "Connected wallet is registered" : "Connected wallet is not registered",
    },
    { label: "Arc Testnet", ok: w.isCorrectNetwork, detail: w.address ? (w.isCorrectNetwork ? "Connected" : "Switch network") : "No wallet" },
  ];
  const eligible = rows.every((r) => r.ok);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Voting eligibility</p>
        {eligible ? <Badge tone="verified"><CheckCircle2 aria-hidden /> Eligible</Badge> : <Badge tone="pending">Action needed</Badge>}
      </div>
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 p-3 text-sm">
            {r.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-verified" aria-hidden /> : <ShieldAlert className="h-4 w-4 shrink-0 text-pending" aria-hidden />}
            <div className="min-w-0">
              <p className="font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      {!human && ctx.worldId.configured ? (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <Fingerprint className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="flex-1 text-xs text-muted-foreground">The proof is verified server-side; only an action-scoped nullifier is stored.</p>
          <WorldIdVerify appId={ctx.worldId.appId as `app_${string}`} action={ctx.worldId.action} signal={ctx.worldId.signal} level={ctx.worldId.level} />
        </div>
      ) : null}
      {!w.address ? (
        <Button variant="outline" size="sm" onClick={w.connect} loading={w.connecting}><Wallet aria-hidden /> Connect validator wallet</Button>
      ) : null}
      {isValidator === false && w.address ? <Notice tone="error">The contract would reject votes from this wallet.</Notice> : null}
    </div>
  );
}
