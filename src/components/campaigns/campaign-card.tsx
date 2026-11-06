import Link from "next/link";
import { ArrowUpRight, Building2, ShieldCheck } from "lucide-react";
import type { CampaignView } from "@/server/chain";
import { presentState } from "@/lib/protocol";
import { formatDate, formatTokenAmount, percent, shortAddress } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/primitives";

export function CampaignCard({ campaign }: { campaign: CampaignView }) {
  const s = presentState(campaign.state);
  const budget = BigInt(campaign.budgetCeiling);
  const raised = BigInt(campaign.totalDeposited);
  const pct = percent(raised, budget);
  const title = campaign.metadata?.title || `Campaign #${campaign.id}`;
  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="group surface flex h-full flex-col p-5 transition-shadow hover:shadow-[0_12px_32px_-16px_hsl(222_40%_12%/0.25)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {campaign.metadata?.category ? <Badge>{campaign.metadata.category}</Badge> : null}
          <Badge tone={s.tone} dot>
            {s.label}
          </Badge>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" aria-hidden />
      </div>
      <h3 className="mt-4 font-display text-xl leading-snug tracking-tight">{title}</h3>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" aria-hidden />
        {campaign.metadata?.organization ? (
          <span>
            {campaign.metadata.organization} <span className="opacity-70">(self-declared metadata)</span>
          </span>
        ) : (
          <span>
            Creator <span className="font-mono">{shortAddress(campaign.creator)}</span>
          </span>
        )}
      </p>
      <div className="mt-auto pt-6">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span>
            <span className="font-semibold">{formatTokenAmount(raised)}</span>
            <span className="text-muted-foreground"> / {formatTokenAmount(budget)} USDC</span>
          </span>
          <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
        </div>
        <Progress value={pct} label={`Funding progress for ${title}`} />
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-verified" aria-hidden /> On-chain escrow
          </span>
          <span>Funding closes {formatDate(campaign.fundingDeadline)}</span>
        </div>
      </div>
    </Link>
  );
}
