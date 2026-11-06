import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ExternalLink,
  Eye,
  FileCheck2,
  Gavel,
  HandCoins,
  Inbox,
  Lock,
  Scale,
  Truck,
  Users,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { EscrowFlowVisual } from "@/components/site/escrow-flow-visual";
import { FundFlowDiagram } from "@/components/dashboard/fund-flow";
import { CampaignCard } from "@/components/campaigns/campaign-card";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/primitives";
import { getCampaigns } from "@/server/chain";
import { CAPABILITIES, CAPABILITY_STATUS_COPY } from "@/lib/capabilities";
import { LIFECYCLE } from "@/lib/protocol";
import { getExplorerAddressUrl } from "@/lib/arc/config";
import { formatTokenAmount, shortAddress } from "@/lib/utils";

export const revalidate = 30;

const CAP_ICONS: Record<string, typeof Lock> = {
  escrow: Lock,
  procurement: Gavel,
  validation: Scale,
  evidence: FileCheck2,
  cre: BadgeCheck,
  worldid: Users,
  subvaults: Building2,
};

const STEP_ICONS = [HandCoins, Gavel, Truck, Users, Scale];
const STEP_ROLES = ["NGO & donors", "Vendors", "Winning vendor", "Validators", "Contract"];

export default async function LandingPage() {
  const chain = await getCampaigns();
  const live = chain.status === "ok" ? chain.data : null;

  return (
    <main id="main">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="ink-backdrop relative overflow-hidden text-white">
        <SiteHeader tone="dark" />
        <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <div className="container relative grid grid-cols-[minmax(0,1fr)] gap-12 pb-20 pt-32 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:pb-28 lg:pt-40">
          <div>
            <Reveal>
              <p className="eyebrow inline-flex items-center gap-2 text-[hsl(166_70%_62%)]">
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                Accountable humanitarian procurement
              </p>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-5 font-display text-[2.75rem] leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.25rem]">
                Every contribution.
                <br />
                <span className="text-white/60">Accounted for.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-white/65">
                OpenAid connects funding, procurement, delivery evidence, and settlement in one publicly verifiable escrow.
                Donor funds can only reach the vendor who won a sealed-bid auction and passed independent validation, or
                return to donors.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="light">
                  <Link href="/campaigns">
                    Explore campaigns <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline-dark">
                  <Link href="/how-it-works">How it works</Link>
                </Button>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6 text-sm">
                <div>
                  <dt className="text-white/45">Campaigns on-chain</dt>
                  <dd className="mt-1 font-display text-2xl">{live ? live.campaignCount : "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Held in escrow</dt>
                  <dd className="mt-1 font-display text-2xl">{live ? `${formatTokenAmount(BigInt(live.escrowBalance))}` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Network</dt>
                  <dd className="mt-1 text-sm leading-8 text-white/80">Arc Testnet</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-white/40">
                {live ? (
                  <>
                    Read live from{" "}
                    <a href={getExplorerAddressUrl(live.escrowAddress)} target="_blank" rel="noreferrer" className="underline decoration-white/20 underline-offset-2 hover:text-white/70">
                      escrow {shortAddress(live.escrowAddress)}
                    </a>
                    . Testnet USDC.
                  </>
                ) : (
                  "Live chain data is currently unavailable."
                )}
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            <EscrowFlowVisual />
          </Reveal>
        </div>
      </section>

      {/* ── Problem → solution ───────────────────────────────── */}
      <section className="border-b bg-card py-20 lg:py-24">
        <div className="container grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
          <div>
            <p className="eyebrow text-verified">Why it matters</p>
            <h2 className="mt-3 font-display text-4xl tracking-tight">Generosity deserves proof, not promises.</h2>
            <p className="mt-4 text-muted-foreground">
              In traditional aid, donors hand money to an intermediary and hope. Procurement happens out of view, vendor selection is hard to audit, and
              delivery is reported by the same party that spent the funds.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Opaque custody", "Funds sit in an organisation's account that it alone controls.", "Escrow with no withdrawal path — money moves only by contract rules."],
              ["Discretionary purchasing", "Suppliers can be chosen informally, without competing bids.", "Sealed commit–reveal auctions; the contract picks the lowest valid bid."],
              ["Self-reported delivery", "The spender also certifies that goods arrived.", "Independent validators approve evidence before any payment is released."],
              ["No recourse", "If aid never arrives, donors rarely see their money again.", "Every failure path refunds donors pro-rata, claimable from their own wallet."],
            ].map(([problem, before, after]) => (
              <div key={problem} className="rounded-xl border p-5">
                <p className="text-sm font-semibold">{problem}</p>
                <p className="mt-2 text-sm text-muted-foreground line-through decoration-destructive/40">{before}</p>
                <p className="mt-2 text-sm text-foreground"><span className="font-semibold text-verified">OpenAid · </span>{after}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fund flow ────────────────────────────────────────── */}
      <section className="paper-backdrop border-b py-20 lg:py-24">
        <div className="container">
          <div className="max-w-2xl">
            <p className="eyebrow text-verified">Follow the money</p>
            <h2 className="mt-3 font-display text-4xl tracking-tight">One path for every dollar.</h2>
            <p className="mt-3 text-muted-foreground">
              The same fund-flow view powers donor, NGO, vendor and validator dashboards — fed by live contract events once campaigns are running.
            </p>
          </div>
          <div className="surface mt-10 p-5 sm:p-6">
            <FundFlowDiagram mode="concept" />
          </div>
        </div>
      </section>

      {/* ── Trust & capabilities ─────────────────────────────── */}
      <section id="product" className="paper-backdrop scroll-mt-16 py-20 lg:py-28">
        <div className="container">
          <div className="max-w-2xl">
            <p className="eyebrow text-verified">Trust by construction</p>
            <h2 className="mt-3 font-display text-4xl tracking-tight">No single party can move the money.</h2>
            <p className="mt-4 text-muted-foreground">
              The NGO defines the need, donors fund it, vendors compete for it, and validators confirm it. Each control is
              separated — and every capability below is labeled with its actual status.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c, i) => {
              const Icon = CAP_ICONS[c.key] ?? Lock;
              const s = CAPABILITY_STATUS_COPY[c.status];
              return (
                <Reveal key={c.key} delay={i * 0.04} className="glass flex flex-col rounded-xl p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-white">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  <h3 className="mt-5 text-base font-semibold tracking-tight">{c.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                  <p className="mt-auto pt-4 text-xs text-muted-foreground/80">{c.detail}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="border-y bg-card py-20 lg:py-28">
        <div className="container">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-xl">
              <p className="eyebrow text-verified">How it works</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight">Five stages. One audit trail.</h2>
            </div>
            <Button asChild variant="outline">
              <Link href="/how-it-works">
                Full protocol walkthrough <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-5">
            {LIFECYCLE.map((step, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <Reveal as="li" key={step.key} delay={i * 0.05} className="flex flex-col bg-card p-6">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-3xl text-muted-foreground/40">{String(i + 1).padStart(2, "0")}</span>
                    <Icon className="h-5 w-5 text-verified" aria-hidden />
                  </div>
                  <h3 className="mt-6 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  <p className="mt-auto pt-5 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{STEP_ROLES[i]}</p>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── Campaign discovery ───────────────────────────────── */}
      <section className="py-20 lg:py-28">
        <div className="container">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-xl">
              <p className="eyebrow text-verified">Campaigns</p>
              <h2 className="mt-3 font-display text-4xl tracking-tight">Funded in the open.</h2>
              <p className="mt-3 text-muted-foreground">Every campaign below is read directly from the escrow contract.</p>
            </div>
            <Button asChild variant="outline">
              <Link href="/campaigns">
                All campaigns <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
          <div className="mt-10">
            {chain.status !== "ok" ? (
              <EmptyState icon={Inbox} title="Chain data unavailable" description={`${chain.reason} Campaigns will appear once the RPC responds.`} />
            ) : live && live.campaigns.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {live.campaigns.slice(0, 3).map((c) => (
                  <CampaignCard key={c.id} campaign={c} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Inbox}
                title="No campaigns have been created on this deployment yet"
                description="The escrow is live on Arc Testnet but holds no campaigns. Verified NGOs can create the first one from their workspace."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/auth/sign-in?callbackUrl=%2Fapp%2Fngo">Sign in as an NGO</Link>
                  </Button>
                }
              />
            )}
          </div>
        </div>
      </section>

      {/* ── Transparency ─────────────────────────────────────── */}
      <section className="ink-backdrop py-20 text-white lg:py-28">
        <div className="container grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow text-[hsl(166_70%_62%)]">Transparency</p>
            <h2 className="mt-3 font-display text-4xl tracking-tight">Inspect every step yourself.</h2>
            <p className="mt-4 max-w-lg text-white/60">
              Funding, bids, awards, evidence, votes, payouts and refunds are contract events. OpenAid shows you what
              happened and where to verify it — and labels anything that is off-chain or simulated.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="light">
                <Link href="/transparency">
                  <Eye aria-hidden /> Open the public ledger
                </Link>
              </Button>
              {live ? (
                <Button asChild variant="outline-dark">
                  <a href={getExplorerAddressUrl(live.escrowAddress)} target="_blank" rel="noreferrer">
                    View contract <ExternalLink aria-hidden />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {[
              ["Funding", "FundsDeposited · CampaignFullyFunded", "On-chain"],
              ["Procurement", "BidCommitted · BidRevealed", "On-chain"],
              ["Vendor assignment", "AuctionFinalized", "On-chain"],
              ["Delivery evidence", "EvidenceSubmitted (manifest CID)", "On-chain + Arkiv"],
              ["Validator decisions", "VoteCast · QuorumReached", "On-chain"],
              ["Settlement or refund", "Stage1/2Settled · RefundClaimed", "On-chain"],
            ].map(([t, e, tier]) => (
              <li key={t} className="glass-dark rounded-xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t}</p>
                  <span className="text-[0.68rem] text-white/45">{tier}</span>
                </div>
                <p className="mt-1.5 font-mono text-[0.72rem] text-white/50">{e}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Roles CTA ────────────────────────────────────────── */}
      <section className="py-20 lg:py-24">
        <div className="container">
          <div className="surface grid gap-8 p-8 md:grid-cols-[1.2fr_1fr] md:items-center md:p-12">
            <div>
              <h2 className="font-display text-3xl tracking-tight">Separate roles. Verified access.</h2>
              <p className="mt-3 max-w-lg text-muted-foreground">
                Sign in with Google to follow campaigns. Donor, NGO, vendor and validator workspaces are granted through a
                reviewed, audited request — never by choosing a role at sign-up.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Button asChild size="lg">
                <Link href="/auth/sign-in">
                  Get started <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/about">Design principles</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
