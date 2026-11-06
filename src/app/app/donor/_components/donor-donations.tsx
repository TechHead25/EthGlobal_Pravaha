"use client";

import Link from "next/link";
import { HandCoins, Landmark, RefreshCw, Undo2, Wallet } from "lucide-react";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { CampaignStatusBadge, Panel, useCampaignTitle } from "@/components/dashboard/common";
import { toTxRows, TransactionTable } from "@/components/dashboard/transaction-table";
import { useUsdc } from "@/components/dashboard/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, Notice, StatCard } from "@/components/ui/primitives";
import { presentState } from "@/lib/protocol";
import { formatTokenAmount } from "@/lib/utils";
import { useDonorPortfolio } from "./use-donor-portfolio";

export function DonorDonations() {
  const w = useWallet();
  const live = useEscrowLive();
  const p = useDonorPortfolio();
  const { usdc, reload: reloadUsdc } = useUsdc();
  const titleFor = useCampaignTitle();

  async function claim(id: number) {
    const rec = await w.runTx(`Claim refund #${id}`, ({ escrow }) => escrow.claimRefund(id));
    if (rec) await Promise.all([live.refresh([id]), p.reload(), reloadUsdc()]);
  }

  const rows = toTxRows(p.myEvents, titleFor, (e) => {
    if (e.name === "RefundClaimed") return "Refund paid to your wallet";
    const c = live.getCampaign(e.campaignId);
    return c ? `Confirmed · campaign ${presentState(c.state).label.toLowerCase()}` : "Confirmed on-chain";
  });

  return (
    <div className="space-y-8">
      <RoleHeader eyebrow="Donor dashboard" title="My donations" description="Your deposits, refunds and receipts. Each row links to its transaction on the Arc explorer." />
      <WalletPanel purpose="History is read for the connected wallet." />
      <TxStatus />
      {!w.address ? (
        <EmptyState icon={Wallet} title="Connect a wallet to see your donation history" action={<Button onClick={w.connect} loading={w.connecting}>Connect wallet</Button>} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Personal wallet balance" icon={Wallet} value={usdc ? formatTokenAmount(usdc.balance) : "…"} hint="USDC you control — not donated" />
            <StatCard label="Donated (all time)" icon={HandCoins} value={p.ready ? formatTokenAmount(p.totals.donated) : "…"} hint="USDC deposited into campaign escrows" />
            <StatCard label="Locked in campaign escrow" icon={Landmark} value={p.ready ? formatTokenAmount(p.totals.inEscrow) : "…"} hint="Your share, held by the contract" />
          </div>
          {p.error ? <Notice tone="error">{p.error}</Notice> : null}

          <Panel
            title="Positions & refunds"
            description="Refund eligibility mirrors the contract's claimRefund rules; the contract computes the exact amount."
            action={<Button variant="ghost" size="sm" onClick={() => void p.reload()} loading={p.loading}><RefreshCw aria-hidden /> Refresh</Button>}
          >
            {!p.ready ? (
              <div className="h-24 animate-pulse-soft rounded-lg bg-muted" />
            ) : p.rows.length === 0 ? (
              <EmptyState icon={HandCoins} title="No deposits from this wallet" action={<Button asChild variant="outline"><Link href="/app/donor/campaigns">Discover campaigns</Link></Button>} />
            ) : (
              <ul className="divide-y rounded-lg border">
                {p.rows.map((r) => (
                  <li key={r.campaign.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <Link href={`/campaigns/${r.campaign.id}`} className="font-medium hover:underline">{titleFor(r.campaign.id)}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <CampaignStatusBadge state={r.campaign.state} />
                        <span>Deposited {formatTokenAmount(r.deposit)} USDC · {(r.share.shareBps / 100).toFixed(2)}% of campaign</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm">
                      {r.claimed ? (
                        <span className="text-xs text-muted-foreground">Refund claimed</span>
                      ) : r.refundable > 0n ? (
                        <ConfirmDialog
                          trigger={<Button size="sm" variant="verified"><Undo2 aria-hidden /> Claim ~{formatTokenAmount(r.refundable)} USDC</Button>}
                          title={`Claim refund from ${titleFor(r.campaign.id)}?`}
                          description={`Your wallet calls claimRefund on the escrow. The contract computes the exact amount (estimated ${formatTokenAmount(r.refundable)} USDC) and sends it to ${w.address}.`}
                          confirmLabel="Open wallet"
                          tone="verified"
                          onConfirm={() => claim(r.campaign.id)}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">No refund due</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Transaction history" description={live.eventsAvailable ? "Confirmed deposits and refunds for this wallet." : "Event history is temporarily unavailable."}>
            <TransactionTable rows={rows} emptyMessage="No deposit or refund transactions for this wallet in the scanned range." searchPlaceholder="Search by campaign or activity" />
          </Panel>
        </>
      )}
    </div>
  );
}
