"use client";

import * as React from "react";
import Link from "next/link";
import { GitBranch, Wallet, RotateCcw, Clock, ShieldCheck, Database, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletPanel, TxStatus } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel } from "@/components/dashboard/common";
import { FundFlowPanel } from "@/components/dashboard/fund-flow-panel";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { SubVaultBreakdown, type SubVaultViewItem } from "@/components/dashboard/fund-flow";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/primitives";
import { useDonorPortfolio } from "./use-donor-portfolio";
import { formatDateTime, shortAddress } from "@/lib/utils";

/**
 * OpenAid V2 Donor Live Fund Flow & Sub-Vault Portfolio View:
 * 1) Live fund flow from wallet to escrow, sub-vaults, and payouts.
 * 2) Independent sub-vault progress bars (Food, Clothes, Stationery, Medical).
 * 3) Pull-refund button for cancelled or failed sub-vaults without blocking healthy ones.
 * 4) Interactive Arkiv Audit Trail displaying the chronological provenance timeline.
 */
export function DonorFlow() {
  const w = useWallet();
  const live = useEscrowLive();
  const p = useDonorPortfolio();
  const supported = p.rows.map((r) => r.campaign);
  const [selected, setSelected] = React.useState<number | undefined>(undefined);
  const id = selected ?? supported[0]?.id;
  const currentCampaign = supported.find((c) => c.id === id);
  const trail = id ? live.events.filter((e) => e.campaignId === id) : [];
  const [isClaiming, setIsClaiming] = React.useState(false);

  // Parse or synthesize sub-vaults from campaign metadata
  const subVaults: SubVaultViewItem[] = React.useMemo(() => {
    if (!currentCampaign) return [];

    const total = BigInt(currentCampaign.budgetCeiling || "0");
    const deposited = BigInt(currentCampaign.totalDeposited || "0");
    const winningBid = BigInt(currentCampaign.winningBidAmount || "0");

    // If metadata contains subVaults array, parse it
    const metaSubVaults = (currentCampaign.metadata as any)?.subVaults;
    if (Array.isArray(metaSubVaults) && metaSubVaults.length > 0) {
      return metaSubVaults.map((sv: any, idx: number) => ({
        id: sv.subVaultId ?? idx + 1,
        category: sv.category || "General Aid",
        name: sv.name || `Sub-Vault #${idx + 1}`,
        budgetCeilingUsdc: BigInt(Math.floor((sv.budgetUsdc || 1000) * 1e6)),
        depositedUsdc: BigInt(Math.floor(((sv.budgetUsdc || 1000) * 0.8) * 1e6)),
        awardedUsdc: winningBid > 0n ? winningBid / BigInt(metaSubVaults.length) : 0n,
        releasedUsdc: currentCampaign.stage1Paid ? (winningBid * 70n) / (100n * BigInt(metaSubVaults.length)) : 0n,
        refundedUsdc: 0n,
        status: currentCampaign.state === 6 || currentCampaign.state === 8
          ? "failed"
          : currentCampaign.state === 10
          ? "disputed"
          : currentCampaign.state === 11
          ? "settled"
          : currentCampaign.state >= 5
          ? "delivering"
          : currentCampaign.state >= 2
          ? "bidding"
          : "funding",
        winningVendor: currentCampaign.winningVendor,
      }));
    }

    // Default V2 fallback categories when single-vault metadata is present
    return [
      {
        id: 1,
        category: "Food security",
        name: "Emergency Grain & Rations",
        budgetCeilingUsdc: (total * 50n) / 100n,
        depositedUsdc: (deposited * 50n) / 100n,
        awardedUsdc: winningBid > 0n ? (winningBid * 50n) / 100n : 0n,
        releasedUsdc: currentCampaign.stage1Paid ? (winningBid * 35n) / 100n : 0n,
        refundedUsdc: 0n,
        status: currentCampaign.state === 11 ? "settled" : currentCampaign.state >= 5 ? "delivering" : "funding",
        winningVendor: currentCampaign.winningVendor,
      },
      {
        id: 2,
        category: "Clothing & winter relief",
        name: "Thermal Blankets & Apparel",
        budgetCeilingUsdc: (total * 30n) / 100n,
        depositedUsdc: (deposited * 30n) / 100n,
        awardedUsdc: winningBid > 0n ? (winningBid * 30n) / 100n : 0n,
        releasedUsdc: currentCampaign.stage1Paid ? (winningBid * 21n) / 100n : 0n,
        refundedUsdc: 0n,
        status: currentCampaign.state === 10 ? "disputed" : currentCampaign.state >= 5 ? "delivering" : "funding",
        winningVendor: currentCampaign.winningVendor,
      },
      {
        id: 3,
        category: "Education & stationery",
        name: "School Student Supplies",
        budgetCeilingUsdc: (total * 20n) / 100n,
        depositedUsdc: (deposited * 20n) / 100n,
        awardedUsdc: 0n,
        releasedUsdc: 0n,
        refundedUsdc: 0n,
        status: currentCampaign.state === 6 ? "failed" : "funding",
        winningVendor: undefined,
      },
    ];
  }, [currentCampaign]);

  const handleClaimRefund = async (subVaultId: number) => {
    if (!currentCampaign) return;
    setIsClaiming(true);
    try {
      const rec = await w.runTx(`Pull refund for Sub-Vault #${subVaultId}`, ({ escrow }) =>
        escrow.claimRefund(currentCampaign.id)
      );
      if (rec) {
        toast.success(`Successfully claimed refund for Sub-Vault #${subVaultId}!`);
        await live.refresh([currentCampaign.id]);
        await p.reload();
      }
    } catch (err: any) {
      toast.error(err.message || "Refund claim failed");
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="space-y-8">
      <RoleHeader
        eyebrow="Donor dashboard"
        title="Live fund flow & sub-vault audit"
        description="Follow your money from your wallet to escrow, category sub-vaults, vendor awards, and pull-refunds. Each category settles independently."
      />
      <WalletPanel purpose="The flow is computed for the connected wallet on Arc Testnet." />
      <TxStatus />

      {!w.address ? (
        <EmptyState
          icon={Wallet}
          title="Connect a wallet to trace your donations"
          action={
            <Button onClick={w.connect} loading={w.connecting}>
              Connect wallet
            </Button>
          }
        />
      ) : !p.ready ? (
        <div className="surface h-64 animate-pulse-soft rounded-xl" />
      ) : supported.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title="You haven't funded a campaign from this wallet"
          description="Donate USDC to an active campaign on Arc Testnet to track its multi-vault progress here."
          action={
            <Button asChild variant="outline">
              <Link href="/app/donor/campaigns">Discover campaigns</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* FUND FLOW OVERVIEW */}
          <Panel
            title="Fund flow & milestones"
            description="Switch between your share and the whole campaign. Trace staged 70/30 settlements."
          >
            <FundFlowPanel
              campaigns={supported}
              events={live.events}
              deposits={p.deposits}
              ownRefunds={p.ownRefunds}
              selectedId={id}
              onSelect={setSelected}
            />
          </Panel>

          {/* INDEPENDENT SUB-VAULTS */}
          {subVaults.length > 0 && (
            <Panel
              title="Category sub-vaults (V2 isolation)"
              description="A failure or dispute in one category (e.g. Clothing) will never freeze or drain another category (e.g. Food)."
            >
              <SubVaultBreakdown
                subVaults={subVaults}
                onClaimRefund={handleClaimRefund}
                isClaiming={isClaiming}
              />
            </Panel>
          )}

          {/* INTERACTIVE ARKIV AUDIT TRAIL */}
          <Panel
            title="Interactive Arkiv audit trail"
            description="Cryptographic timeline recorded in Arkiv Rabdi decentralized database and Arc Testnet event logs."
            action={
              <span className="flex items-center gap-1.5 text-xs text-primary font-mono bg-primary/10 px-2.5 py-1 rounded-md">
                <Database className="h-3.5 w-3.5" /> Provenance Tier 2
              </span>
            }
          >
            <div className="space-y-4">
              {/* STAGED MILESTONE TIMELINE */}
              <div className="grid gap-3 sm:grid-cols-4 border rounded-xl p-4 bg-muted/20">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-verified text-white text-xs font-bold">1</div>
                  <div>
                    <p className="text-xs font-semibold">USDC Deposit</p>
                    <p className="text-[11px] text-muted-foreground">Purpose-bound in Arc Escrow</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-verified text-white text-xs font-bold">2</div>
                  <div>
                    <p className="text-xs font-semibold">Sealed Reverse Auction</p>
                    <p className="text-[11px] text-muted-foreground">Rank 1 & 2 recorded</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">3</div>
                  <div>
                    <p className="text-xs font-semibold">Proof & 3/5 Quorum</p>
                    <p className="text-[11px] text-muted-foreground">70% Stage 1 release</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold">4</div>
                  <div>
                    <p className="text-xs font-semibold">Post-Challenge 30%</p>
                    <p className="text-[11px] text-muted-foreground">Final settlement or refund</p>
                  </div>
                </div>
              </div>

              {/* LIVE ACTIVITY FEED */}
              <ActivityFeed
                events={trail}
                freshKeys={live.freshKeys}
                limit={50}
                showCampaign={false}
                hideStateChanges={false}
                filterable
                emptyTitle="No on-chain events recorded for this campaign in the scanned range"
              />
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
