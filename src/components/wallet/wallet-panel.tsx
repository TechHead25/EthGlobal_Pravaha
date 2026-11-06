"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Wallet, XCircle } from "lucide-react";
import { ARC_TESTNET_CONFIG, getExplorerAddressUrl, getExplorerTxUrl } from "@/lib/arc/config";
import { cn, shortAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "./wallet-provider";

/** Compact wallet status bar shown on role workspaces that need on-chain actions. */
export function WalletPanel({ purpose }: { purpose: string }) {
  const w = useWallet();
  return (
    <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-900 text-white">
          <Wallet className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {w.address ? (
              <a href={getExplorerAddressUrl(w.address)} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                {shortAddress(w.address, 6)}
              </a>
            ) : (
              "No wallet connected"
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {purpose} Your Google sign-in does not authorize transactions — your wallet signs each one.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {w.address ? (
          w.isCorrectNetwork ? (
            <Badge tone="verified" dot>
              {ARC_TESTNET_CONFIG.chainName}
            </Badge>
          ) : (
            <>
              <Badge tone="failed">
                <AlertTriangle aria-hidden /> Wrong network
              </Badge>
              <Button size="sm" variant="outline" onClick={w.switchNetwork}>
                Switch to Arc
              </Button>
            </>
          )
        ) : (
          <Button size="sm" onClick={w.connect} loading={w.connecting}>
            {w.available ? "Connect wallet" : "Install a wallet"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Inline status of the most recent transaction. Never shows success before a mined receipt. */
export function TxStatus({ className }: { className?: string }) {
  const { tx } = useWallet();
  if (tx.phase === "idle") return null;
  const map = {
    wrong_network: { icon: AlertTriangle, tone: "text-pending", text: "Switch to Arc Testnet to continue." },
    awaiting_signature: { icon: Loader2, tone: "text-pending", text: "Waiting for your wallet signature…" },
    pending: { icon: Loader2, tone: "text-pending", text: "Submitted — waiting for confirmation." },
    confirmed: { icon: CheckCircle2, tone: "text-verified", text: "Confirmed on-chain." },
    failed: { icon: XCircle, tone: "text-destructive", text: tx.error ?? "Transaction failed." },
    rejected: { icon: XCircle, tone: "text-muted-foreground", text: tx.error ?? "Cancelled in wallet." },
  } as const;
  const m = map[tx.phase];
  const Icon = m.icon;
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm", className)}>
      <Icon className={cn("h-4 w-4", m.tone, (tx.phase === "pending" || tx.phase === "awaiting_signature") && "animate-spin")} aria-hidden />
      <span className="font-medium">{tx.label}</span>
      <span className="text-muted-foreground">{m.text}</span>
      {tx.hash ? (
        <a className="ml-auto inline-flex items-center gap-1 text-xs text-verified hover:underline" href={getExplorerTxUrl(tx.hash)} target="_blank" rel="noreferrer">
          View transaction <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}
