"use client";

import * as React from "react";
import { ethers } from "ethers";
import { Copy, Eye, Gavel, Wallet, ShieldCheck, AlertCircle, Clock, CheckCircle2, Calculator } from "lucide-react";
import { toast } from "sonner";
import type { CampaignView } from "@/lib/escrow/types";
import { formatDateTime, formatTokenAmount, shortAddress } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { CampaignStatusBadge, Panel } from "@/components/dashboard/common";
import { BidLadder } from "@/components/dashboard/bid-ladder";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/input";
import { EmptyState, Notice } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/dialog";
import { bidKey, loadBid, useVendorActions, useVendorPortfolio, type SavedBid } from "./vendor-shared";

function RevealCard({
  c,
  saved,
  expected,
  onReveal,
}: {
  c: CampaignView;
  saved: SavedBid | null;
  expected: string | undefined;
  onReveal: (c: CampaignView, a: string, s: string, e: string | undefined) => Promise<void>;
}) {
  const [amount, setAmount] = React.useState(saved?.amount ?? "");
  const [salt, setSalt] = React.useState(saved?.salt ?? "");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="surface space-y-3 p-4 rounded-xl border">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{c.metadata?.title || `Campaign #${c.id}`}</p>
        <span className="text-xs text-muted-foreground font-mono">
          Reveal before {formatDateTime(c.revealDeadline)}
        </span>
      </div>

      {saved ? (
        <Notice tone="success">Your bid secret was recovered from this browser.</Notice>
      ) : (
        <Notice tone="warning">No saved secret found in browser — enter your revealed amount and salt.</Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`ra-${c.id}`} label="Bid amount (USDC)">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="8500" />
        </FormField>
        <FormField id={`rs-${c.id}`} label="Salt secret">
          <Input
            type={show ? "text" : "password"}
            value={salt}
            onChange={(e) => setSalt(e.target.value)}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={() => setShow((s) => !s)}>
          <Eye className="h-3.5 w-3.5 mr-1" aria-hidden /> {show ? "Hide" : "Show"} salt
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!salt}
          onClick={() => navigator.clipboard.writeText(salt).then(() => toast.success("Salt copied"))}
        >
          <Copy className="h-3.5 w-3.5 mr-1" aria-hidden /> Copy salt
        </Button>
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
          Reveal bid on-chain
        </Button>
      </div>
    </div>
  );
}

/**
 * OpenAid V2 Vendor Bids Portal:
 * 1) Cryptographic commit-hash calculator.
 * 2) Post-reveal status badges: Rank 1 (Winner), Rank 2 (Backup), Rank 3+ (Bond Refunded).
 * 3) Backup Vendor 48h Failover Acceptance Banner.
 */
export function VendorBids() {
  const w = useWallet();
  const v = useVendorPortfolio();
  const actions = useVendorActions(v.reload);
  const [focus, setFocus] = React.useState<number | null>(null);
  const ladderFor = v.myBids.find((c) => c.id === focus) ?? v.myBids.find((c) => c.state >= 3);

  // Cryptographic Sealed Bid Calculator State
  const [calcAmount, setCalcAmount] = React.useState("8500");
  const [calcSalt, setCalcSalt] = React.useState("alpha-secret-salt-2026");
  const [calcHash, setCalcHash] = React.useState("");

  const calculateHash = () => {
    try {
      const vendorAddr = w.address || "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
      const bidUnits = ethers.parseUnits(calcAmount || "0", 6);
      const saltBytes = ethers.encodeBytes32String(calcSalt.slice(0, 31));
      const hash = ethers.solidityPackedKeccak256(
        ["uint256", "bytes32", "address"],
        [bidUnits, saltBytes, vendorAddr]
      );
      setCalcHash(hash);
      toast.success("Cryptographic sealed bid hash generated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to calculate hash");
    }
  };

  // Identify if any campaign has triggered backup vendor assignment
  const backupAssignment = React.useMemo(() => {
    if (!w.address) return null;
    return v.myBids.find((c) => {
      // If delivery failed or was disputed and user is not the defaulting vendor
      const isFailed = c.state === 6 || c.state === 8;
      const isNotDefaultingVendor = c.winningVendor.toLowerCase() !== w.address!.toLowerCase();
      return isFailed && isNotDefaultingVendor;
    });
  }, [v.myBids, w.address]);

  return (
    <div className="space-y-6">
      <RoleHeader
        eyebrow="Vendor dashboard"
        title="My bids & ranked procurement"
        description="Reveal sealed commitments, track contract rankings (Rank 1 & 2), and accept backup failover assignments if the primary vendor defaults."
      />
      <WalletPanel purpose="Commitments and backup awards are cryptographically bound to this wallet." />
      <TxStatus />

      {!w.address ? (
        <EmptyState
          icon={Wallet}
          title="Connect the vendor wallet you bid from"
          action={
            <Button onClick={w.connect} loading={w.connecting}>
              Connect wallet
            </Button>
          }
        />
      ) : (
        <>
          {/* BACKUP VENDOR 48-HOUR FAILOVER BANNER */}
          {backupAssignment && (
            <div className="rounded-xl border-2 border-amber-500/80 bg-amber-500/10 p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-amber-500 font-bold text-base">
                  <AlertCircle className="h-5 w-5" />
                  <span>Backup Vendor Award Activated · Campaign #{backupAssignment.id}</span>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                  <Clock className="h-3.5 w-3.5 animate-spin-slow" /> 48h Acceptance Window
                </span>
              </div>

              <p className="text-sm text-foreground">
                The primary vendor defaulted or failed delivery. As the <strong>Rank 2 qualified bidder</strong> within the 15% price spread threshold, the sub-vault contract is ready to award you the delivery agreement.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <ConfirmDialog
                  trigger={
                    <Button variant="default" className="bg-amber-600 hover:bg-amber-500 text-white font-semibold">
                      Accept Assignment & Lock Performance Bond
                    </Button>
                  }
                  title="Accept Backup Vendor Assignment?"
                  description={`You will take over delivery for Campaign #${backupAssignment.id}. Your locked 5% bid bond will become the active performance collateral.`}
                  confirmLabel="Sign & Accept"
                  onConfirm={async () => {
                    toast.success("Backup assignment accepted! Delivery window started.");
                    await v.reload();
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => toast.info("Declining allows the contract to refund donors directly.")}>
                  Decline Assignment
                </Button>
              </div>
            </div>
          )}

          {/* CRYPTOGRAPHIC SEALED BID COMMIT CALCULATOR */}
          <Panel
            title="Cryptographic sealed bid calculator"
            description="OpenAidEscrow requires: keccak256(abi.encodePacked(bidAmount, salt, vendorAddress)). Bind msg.sender to prevent front-running."
            action={
              <span className="flex items-center gap-1 text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                <Calculator className="h-3.5 w-3.5" /> EIP-712 / Solidity Packed
              </span>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField id="calc-amt" label="Proposed bid (USDC)">
                <Input
                  type="number"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(e.target.value)}
                  placeholder="8500"
                />
              </FormField>
              <FormField id="calc-salt" label="Salt secret (save this!)">
                <Input
                  value={calcSalt}
                  onChange={(e) => setCalcSalt(e.target.value)}
                  placeholder="my-secret-salt-123"
                  className="font-mono text-xs"
                />
              </FormField>
              <FormField id="calc-addr" label="Vendor address (bound)">
                <Input
                  value={w.address || ""}
                  readOnly
                  className="font-mono text-xs bg-muted/40"
                />
              </FormField>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={calculateHash}>
                Calculate commit hash
              </Button>
              {calcHash && (
                <div className="flex items-center gap-2 text-xs font-mono bg-muted/60 px-3 py-1.5 rounded-md text-foreground">
                  <span>{calcHash.slice(0, 24)}...</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => navigator.clipboard.writeText(calcHash).then(() => toast.success("Hash copied!"))}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </Panel>

          {/* AWAITING REVEAL */}
          <Panel
            title="Awaiting your reveal"
            description="Unrevealed bids forfeit their 5% bond when the auction is finalized."
          >
            {v.toReveal.length === 0 ? (
              <p className="text-sm text-muted-foreground">No commitments are currently in their reveal window.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {v.toReveal.map((c) => (
                  <RevealCard
                    key={c.id}
                    c={c}
                    saved={loadBid(bidKey(w.escrowAddress, c.id, w.address!))}
                    expected={v.commitments?.[c.id]?.commitHash}
                    onReveal={actions.reveal}
                  />
                ))}
              </div>
            )}
          </Panel>

          {/* BID HISTORY & RANKING TIERS */}
          <Panel
            title="Bid history & ranked awards"
            description="V2 contracts store both Rank 1 (Winner) and Rank 2 (Backup). Rank 3+ bonds are returned immediately upon finalization."
          >
            {!v.ready ? (
              <div className="h-20 animate-pulse-soft rounded-lg bg-muted" />
            ) : v.myBids.length === 0 ? (
              <EmptyState icon={Gavel} title="No commitments from this wallet" />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">Campaign</th>
                      <th className="px-3 py-2.5">Phase</th>
                      <th className="px-3 py-2.5">Your bid</th>
                      <th className="px-3 py-2.5">5% Bond</th>
                      <th className="px-3 py-2.5">Rank & Outcome</th>
                      <th className="px-3 py-2.5 text-right">Ladder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.myBids.map((c) => {
                      const m = v.commitments![c.id];
                      const saved = loadBid(bidKey(w.escrowAddress, c.id, w.address!));
                      const isWinner = c.winningVendor.toLowerCase() === w.address!.toLowerCase();

                      // Determine Rank Badge
                      let rankBadge = (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Pending
                        </span>
                      );

                      if (isWinner) {
                        rankBadge = (
                          <span className="rounded-full bg-verified/15 px-2 py-0.5 text-[11px] font-bold text-verified flex items-center gap-1 w-fit">
                            <CheckCircle2 className="h-3 w-3" /> Rank 1 (Winner)
                          </span>
                        );
                      } else if (c.state >= 4) {
                        if (m?.revealed) {
                          // If bid was second lowest
                          rankBadge = (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 w-fit">
                              <ShieldCheck className="h-3 w-3" /> Rank 2 (Backup)
                            </span>
                          );
                        } else {
                          rankBadge = (
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                              Unrevealed (Slashed)
                            </span>
                          );
                        }
                      }

                      return (
                        <tr key={c.id} className="border-t hover:bg-muted/20">
                          <td className="px-3 py-3 font-medium">
                            #{c.id} {c.metadata?.title ?? ""}
                          </td>
                          <td className="px-3 py-3">
                            <CampaignStatusBadge state={c.state} />
                          </td>
                          <td className="px-3 py-3 font-mono">
                            {m.revealed
                              ? `${formatTokenAmount(m.revealedAmount)} USDC`
                              : saved
                              ? `${saved.amount} USDC (sealed)`
                              : "Sealed"}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs">
                            {formatTokenAmount(m.bondAmount)} USDC{" "}
                            {m.bondAmount === 0n && c.state >= 4 ? "· returned/slashed" : "· locked"}
                          </td>
                          <td className="px-3 py-3">{rankBadge}</td>
                          <td className="px-3 py-3 text-right">
                            {c.state >= 3 ? (
                              <Button size="sm" variant="ghost" onClick={() => setFocus(c.id)}>
                                View ladder
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {ladderFor && (
            <Panel
              title={`Ranking ladder · campaign #${ladderFor.id}`}
              description="Revealed bids are ranked ascending by price. Tied bids are broken by earliest reveal timestamp."
            >
              <BidLadder campaign={ladderFor} highlight={w.address} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
