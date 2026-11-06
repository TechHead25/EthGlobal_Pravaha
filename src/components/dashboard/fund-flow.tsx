import { ArrowDown, ArrowRight, CheckCircle2, Circle, Clock3, HandCoins, Landmark, Layers, PackageCheck, Undo2, Wallet, XCircle } from "lucide-react";
import type { MilestoneStatus } from "@/lib/escrow/fund-flow";
import { cn, formatTokenAmount } from "@/lib/utils";

/**
 * Shared fund-flow visualization. Pure/presentational so it renders on the server
 * (public campaign page) and inside client dashboards alike.
 *
 * Money path shown exactly as V1 enforces it: donors → campaign escrow → vendor award →
 * vendor payments, with refunds and unawarded surplus branching back to donors.
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
        "relative flex min-w-0 flex-col rounded-xl border p-4",
        tone === "verified" ? "border-verified/25 bg-verified-soft/60" : tone === "muted" ? "border-dashed bg-muted/30" : "bg-card"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", tone === "verified" ? "bg-verified text-white" : "bg-ink-900 text-white")}>
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
          <div className={cn("h-full rounded-full", tone === "verified" ? "bg-verified" : "bg-primary/70")} style={{ width: `${Math.max(0, Math.min(100, ratio))}%` }} />
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
    { key: "s1", title: "Stage 1 · 70%", rule: "Released automatically when 3 of 5 validators approve", status: values.stage1, amount: values.stage1Released },
    { key: "s2", title: "Stage 2 · 30%", rule: "Released after the challenge window if no dispute is upheld", status: values.stage2, amount: values.stage2Released },
  ];
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {rows.map((r) => {
        const m = MILESTONE[r.status];
        const Icon = m.icon;
        return (
          <div key={r.key} className="rounded-lg border bg-card p-3">
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

export function FundFlowDiagram({
  values,
  mode = "live",
  perspective = "Campaign",
  className,
}: {
  values?: FundFlowValues;
  mode?: "live" | "concept";
  /** Label prefix, e.g. "Your share" for donors. */
  perspective?: string;
  className?: string;
}) {
  const concept = mode === "concept" || !values;
  const v = values;
  const pct = (n: bigint) => (v && v.donated > 0n ? Number((n * 10000n) / v.donated) / 100 : 0);

  return (
    <figure className={cn("space-y-3", className)} aria-label={`${perspective} fund flow`}>
      <div className="grid gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
        <Node icon={HandCoins} label="Donations" value={v?.donated} caption={concept ? "Donors deposit USDC from their own wallets" : `${perspective} deposited into escrow`} ratio={100} concept={concept} />
        <Connector />
        <Node icon={Landmark} label="Campaign escrow" value={v?.inEscrow} caption={concept ? "Held by the contract — no owner withdrawal path" : "Donor funds still held by the contract"} ratio={v ? pct(v.inEscrow) : undefined} concept={concept} />
        <Connector />
        <Node icon={PackageCheck} label="Vendor award" value={v?.awarded} caption={concept ? "Lowest valid sealed bid wins the contract" : v && v.awarded > 0n ? "Committed to the winning vendor" : "No vendor awarded yet"} ratio={v ? pct(v.awarded) : undefined} concept={concept} />
        <Connector />
        <Node icon={Wallet} label="Paid to vendor" value={v?.released} caption={concept ? "70% on quorum · 30% after challenge window" : "Actually transferred to the vendor"} ratio={v ? pct(v.released) : undefined} tone="verified" concept={concept} />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-xs">
          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="font-medium">Sub-campaign vaults</span>
            <span className="text-muted-foreground"> · planned for V2. V1 holds one vault per campaign.</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-xs">
          <Undo2 className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
          <span>
            <span className="font-medium">Refunded to donors{concept ? "" : `: ${amt(v!.refunded)} USDC`}</span>
            <span className="text-muted-foreground"> · pulled by donors on any failure path</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-xs">
          <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="font-medium">Unawarded surplus{concept ? "" : `: ${amt(v!.surplus)} USDC`}</span>
            <span className="text-muted-foreground"> · budget minus winning bid, refundable on completion</span>
          </span>
        </div>
      </div>
      {!concept && v ? <MilestoneTrack values={v} /> : null}
      <figcaption className="text-xs text-muted-foreground">
        {concept
          ? "How funds move under OpenAidEscrow V1. Funds never pass through NGO or validator wallets."
          : "Amounts are read from the escrow contract and its events. Funds never pass through NGO or validator wallets."}
      </figcaption>
    </figure>
  );
}
