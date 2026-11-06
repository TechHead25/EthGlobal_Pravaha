import * as React from "react";
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  HandCoins,
  Landmark,
  Layers,
  PackageCheck,
  Undo2,
  Wallet,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Check,
} from "lucide-react";
import type { MilestoneStatus } from "@/lib/escrow/fund-flow";
import { cn, formatTokenAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Shared fund-flow visualization. Pure/presentational so it renders on the server
 * (public campaign page) and inside client dashboards alike.
 *
 * Money path shown exactly as V2 enforces it: donors → campaign escrow → category sub-vaults →
 * vendor award → vendor payments, with independent pull-refunds and unawarded surplus branching back to donors.
 * Funds never route through NGO or validator wallets, and the UI never implies they do.
 */

export interface FundFlowValues {
  donated: bigint;
  inEscrow: bigint;
  awarded: bigint;
  released: bigint;
  refunded: bigint;
  surplus: bigint;
  stage1: MilestoneStatus;
  stage2: MilestoneStatus;
  stage1Released?: bigint;
  stage2Released?: bigint;
}

export interface SubVaultViewItem {
  id: number;
  category: string;
  name: string;
  budgetCeilingUsdc: bigint;
  depositedUsdc: bigint;
  awardedUsdc: bigint;
  releasedUsdc: bigint;
  refundedUsdc: bigint;
  status: "funding" | "bidding" | "delivering" | "settled" | "disputed" | "failed";
  winningVendor?: string;
  backupVendor?: string;
}

const amt = (v: bigint) => `${formatTokenAmount(v)}`;

function Node({
  icon: Icon,
  label,
  value,
  caption,
  ratio,
  tone = "default",
  concept,
}: {
  icon: typeof Wallet;
  label: string;
  value?: bigint;
  caption: string;
  ratio?: number;
  tone?: "default" | "verified" | "muted";
  concept?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col rounded-xl border p-4 transition-shadow",
        tone === "verified"
          ? "border-verified/25 bg-verified-soft/60"
          : tone === "muted"
          ? "border-dashed bg-muted/30"
          : "bg-card shadow-sm"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md",
            tone === "verified" ? "bg-verified text-white" : "bg-ink-900 text-white"
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      {concept ? null : (
        <p className="mt-3 font-display text-2xl leading-none tracking-tight">
          {value !== undefined ? amt(value) : "—"} <span className="text-xs font-sans text-muted-foreground">USDC</span>
        </p>
      )}
      <p className={cn("text-xs text-muted-foreground", concept ? "mt-2" : "mt-1.5")}>{caption}</p>
      {ratio !== undefined && !concept ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn("h-full rounded-full", tone === "verified" ? "bg-verified" : "bg-primary/70")}
            style={{ width: `${Math.max(0, Math.min(100, ratio))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex items-center justify-center text-muted-foreground/60 lg:px-0" aria-hidden>
      <ArrowRight className="hidden h-4 w-4 lg:block" />
      <ArrowDown className="h-4 w-4 lg:hidden" />
    </div>
  );
}

const MILESTONE: Record<MilestoneStatus, { label: string; icon: typeof Circle; cls: string }> = {
  not_applicable: { label: "Not awarded yet", icon: Circle, cls: "text-muted-foreground" },
  locked: { label: "Locked in escrow", icon: Clock3, cls: "text-pending" },
  eligible: { label: "Eligible — anyone can finalize", icon: Clock3, cls: "text-verified" },
  released: { label: "Released", icon: CheckCircle2, cls: "text-verified" },
  withheld: { label: "Withheld · returned to donors", icon: XCircle, cls: "text-destructive" },
};

export function MilestoneTrack({ values, className }: { values: FundFlowValues; className?: string }) {
  const rows = [
    {
      key: "s1",
      title: "Stage 1 · 70%",
      rule: "Released automatically when 3 of 5 validators approve evidence",
      status: values.stage1,
      amount: values.stage1Released,
    },
    {
      key: "s2",
      title: "Stage 2 · 30%",
      rule: "Released after challenge window cleanly expires without dispute",
      status: values.stage2,
      amount: values.stage2Released,
    },
  ];
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {rows.map((r) => {
        const m = MILESTONE[r.status];
        const Icon = m.icon;
        return (
          <div key={r.key} className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{r.title}</p>
              <span className={cn("inline-flex items-center gap-1 text-xs font-medium", m.cls)}>
                <Icon className="h-3.5 w-3.5" aria-hidden /> {m.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.rule}
              {r.status === "released" && r.amount ? ` · ${amt(r.amount)} USDC paid` : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * OpenAid V2 Independent Sub-Vault Breakdown
 * Renders each category sub-vault with its isolated budget, settlement status,
 * and individual pull-refund trigger for failed sub-vaults.
 */
export function SubVaultBreakdown({
  subVaults,
  onClaimRefund,
  isClaiming,
}: {
  subVaults: SubVaultViewItem[];
  onClaimRefund?: (subVaultId: number) => Promise<void> | void;
  isClaiming?: boolean;
}) {
  if (!subVaults || subVaults.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="h-4 w-4 text-primary" aria-hidden /> Independent Category Sub-Vaults (V2)
        </h4>
        <span className="text-[11px] text-muted-foreground">
          Strict non-interference: Each category settles independently
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {subVaults.map((sv) => {
          const isFailed = sv.status === "failed";
          const isSettled = sv.status === "settled";
          const isDisputed = sv.status === "disputed";
          const fundedPct =
            sv.budgetCeilingUsdc > 0n
              ? Number((sv.depositedUsdc * 100n) / sv.budgetCeilingUsdc)
              : 0;

          return (
            <div
              key={sv.id}
              className={cn(
                "flex flex-col justify-between rounded-xl border p-4 transition-all bg-card shadow-sm",
                isFailed && "border-destructive/40 bg-destructive/5",
                isSettled && "border-verified/40 bg-verified-soft/30",
                isDisputed && "border-pending/40 bg-pending/5"
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    #{sv.id} · {sv.category}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase font-mono",
                      isSettled && "bg-verified/15 text-verified",
                      isFailed && "bg-destructive/15 text-destructive",
                      isDisputed && "bg-pending/15 text-pending",
                      !isSettled && !isFailed && !isDisputed && "bg-primary/10 text-primary"
                    )}
                  >
                    {sv.status}
                  </span>
                </div>

                <p className="mt-2 text-sm font-bold text-foreground truncate">{sv.name}</p>

                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Ceiling</span>
                    <span className="font-mono font-medium text-foreground">{amt(sv.budgetCeilingUsdc)} USDC</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Deposited</span>
                    <span className="font-mono">{amt(sv.depositedUsdc)} USDC ({fundedPct}%)</span>
                  </div>
                  {sv.awardedUsdc > 0n && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Awarded Bid</span>
                      <span className="font-mono text-primary font-medium">{amt(sv.awardedUsdc)} USDC</span>
                    </div>
                  )}
                  {sv.releasedUsdc > 0n && (
                    <div className="flex justify-between text-verified font-medium">
                      <span>Disbursed</span>
                      <span className="font-mono">{amt(sv.releasedUsdc)} USDC</span>
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      isFailed ? "bg-destructive" : isSettled ? "bg-verified" : "bg-primary"
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, fundedPct))}%` }}
                  />
                </div>
              </div>

              {/* Action / Pull-Refund button if failed */}
              <div className="mt-4 pt-3 border-t">
                {isFailed ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full text-xs"
                    disabled={isClaiming}
                    loading={isClaiming}
                    onClick={() => onClaimRefund?.(sv.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden /> Pull Sub-Vault Refund
                  </Button>
                ) : isSettled ? (
                  <p className="flex items-center gap-1 text-[11px] text-verified font-medium">
                    <Check className="h-3.5 w-3.5" /> 100% Settled to Vendor
                  </p>
                ) : isDisputed ? (
                  <p className="flex items-center gap-1 text-[11px] text-pending font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" /> Frozen: Active Challenge
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground font-mono">
                    Procurement In Progress
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FundFlowDiagram({
  values,
  subVaults,
  mode = "live",
  perspective = "Campaign",
  onClaimRefund,
  isClaiming,
  className,
}: {
  values?: FundFlowValues;
  subVaults?: SubVaultViewItem[];
  mode?: "live" | "concept";
  /** Label prefix, e.g. "Your share" for donors. */
  perspective?: string;
  onClaimRefund?: (subVaultId: number) => Promise<void> | void;
  isClaiming?: boolean;
  className?: string;
}) {
  const concept = mode === "concept" || !values;
  const v = values;
  const pct = (n: bigint) => (v && v.donated > 0n ? Number((n * 10000n) / v.donated) / 100 : 0);

  return (
    <figure className={cn("space-y-4", className)} aria-label={`${perspective} fund flow`}>
      <div className="grid gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
        <Node
          icon={HandCoins}
          label="Donations"
          value={v?.donated}
          caption={concept ? "Donors deposit USDC from their own wallets" : `${perspective} deposited into escrow`}
          ratio={100}
          concept={concept}
        />
        <Connector />
        <Node
          icon={Landmark}
          label="Campaign escrow"
          value={v?.inEscrow}
          caption={concept ? "Held by the contract — no owner withdrawal path" : "Donor funds still held by the contract"}
          ratio={v ? pct(v.inEscrow) : undefined}
          concept={concept}
        />
        <Connector />
        <Node
          icon={PackageCheck}
          label="Vendor award"
          value={v?.awarded}
          caption={
            concept
              ? "Lowest valid sealed bid wins the contract"
              : v && v.awarded > 0n
              ? "Committed to the winning vendor"
              : "No vendor awarded yet"
          }
          ratio={v ? pct(v.awarded) : undefined}
          concept={concept}
        />
        <Connector />
        <Node
          icon={Wallet}
          label="Paid to vendor"
          value={v?.released}
          caption={concept ? "70% on quorum · 30% after challenge window" : "Actually transferred to the vendor"}
          ratio={v ? pct(v.released) : undefined}
          tone="verified"
          concept={concept}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-xs shadow-sm">
          <Layers className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-medium">Sub-campaign vaults</span>
            <span className="text-muted-foreground"> · Isolated categories settle and refund independently.</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-xs shadow-sm">
          <Undo2 className="h-4 w-4 shrink-0 text-info" aria-hidden />
          <span>
            <span className="font-medium">Refunded to donors{concept ? "" : `: ${amt(v!.refunded)} USDC`}</span>
            <span className="text-muted-foreground"> · pulled by donors on any failure path</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-xs shadow-sm">
          <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="font-medium">Unawarded surplus{concept ? "" : `: ${amt(v!.surplus)} USDC`}</span>
            <span className="text-muted-foreground"> · budget minus winning bid, refundable on completion</span>
          </span>
        </div>
      </div>

      {!concept && v ? <MilestoneTrack values={v} /> : null}

      {/* RENDER INDEPENDENT SUB-VAULTS WHEN AVAILABLE */}
      {subVaults && subVaults.length > 0 && (
        <div className="pt-2">
          <SubVaultBreakdown
            subVaults={subVaults}
            onClaimRefund={onClaimRefund}
            isClaiming={isClaiming}
          />
        </div>
      )}

      <figcaption className="text-xs text-muted-foreground">
        {concept
          ? "How funds move under OpenAid Protocol. Funds never pass through NGO or validator wallets."
          : "Amounts are read directly from Arc Testnet escrow and its events. Funds never pass through NGO or validator wallets."}
      </figcaption>
    </figure>
  );
}
