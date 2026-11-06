import Link from "next/link";
import { ArrowRight, Building2, Clock, HandCoins, KeyRound, Scale, Shield, Truck, XCircle } from "lucide-react";
import { requirePrincipal } from "@/server/session";
import { getCampaigns, getEscrowEvents } from "@/server/chain";
import { getStore } from "@/server/db";
import { can, ROLE_LABELS, type Permission, type Role } from "@/lib/auth/roles";
import { computeFundFlow, sumFlows } from "@/lib/escrow/fund-flow";
import { formatTokenAmount } from "@/lib/utils";
import { CampaignCard } from "@/components/campaigns/campaign-card";
import { FundFlowDiagram } from "@/components/dashboard/fund-flow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader, SectionHeading, StatCard } from "@/components/ui/primitives";
import { ActivateDonorButton } from "./activate-donor";

export const metadata = { title: "Overview" };

const WORKSPACES: { href: string; title: string; body: string; icon: typeof HandCoins; permission: Permission; role: Role }[] = [
  { href: "/app/donor", title: "Donor", body: "Donate, track every contribution, and claim eligible refunds.", icon: HandCoins, permission: "donor:view", role: "DONOR" },
  { href: "/app/ngo", title: "NGO", body: "Create campaigns, run procurement, and follow delivery.", icon: Building2, permission: "ngo:view", role: "NGO" },
  { href: "/app/vendor", title: "Vendor", body: "Bid with sealed commitments, deliver, and get paid in stages.", icon: Truck, permission: "vendor:view", role: "VENDOR" },
  { href: "/app/validator", title: "Validator", body: "Review evidence and decide release motions.", icon: Scale, permission: "validator:view", role: "VALIDATOR" },
  { href: "/app/admin", title: "Administration", body: "Approvals, users, audit log and integration health.", icon: Shield, permission: "admin:view", role: "ADMIN" },
];

const STATUS_COPY = {
  PENDING: { label: "Pending review", tone: "pending" as const, icon: Clock },
  REJECTED: { label: "Not approved", tone: "failed" as const, icon: XCircle },
};

export default async function DashboardPage() {
  const principal = await requirePrincipal("dashboard:view");
  const [chain, events, requests] = await Promise.all([getCampaigns(), getEscrowEvents(null), getStore().listRoleRequests({ userId: principal.id, limit: 50 })]);
  const open = WORKSPACES.filter((w) => can(principal, w.permission));
  const requestable = WORKSPACES.filter((w) => !can(principal, w.permission) && w.role !== "ADMIN");
  const latestByRole = new Map<Role, (typeof requests)[number]>();
  for (const r of requests) if (!latestByRole.has(r.role)) latestByRole.set(r.role, r);
  const firstName = principal.name?.split(" ")[0];
  const isDonor = can(principal, "donor:view");

  const campaigns = chain.status === "ok" ? chain.data.campaigns : [];
  const platform = sumFlows(campaigns.map((c) => computeFundFlow(c, events.status === "ok" ? events.data.events : [])));
  const fundable = campaigns.filter((c) => c.state === 0 && c.fundingDeadline * 1000 > Date.now()).slice(0, 3);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Member overview"
        title={firstName ? `Welcome, ${firstName}` : "Welcome"}
        description="Browse campaigns, donate, follow every dollar on-chain, and request a workspace role when you need one."
        actions={
          <>
            {isDonor ? (
              <Button asChild><Link href="/app/donor/campaigns"><HandCoins aria-hidden /> Donate</Link></Button>
            ) : (
              <ActivateDonorButton />
            )}
            <Button asChild variant="outline"><Link href="/app/access"><KeyRound aria-hidden /> Access & roles</Link></Button>
          </>
        }
      />

      {!isDonor ? (
        <Notice tone="info" title="Donating takes one click">
          “Start donating” activates the Donor role through the standard role-request flow (instant, audited). Donations are then signed by your own wallet.
        </Notice>
      ) : null}

      <section>
        <SectionHeading title="Platform at a glance" description={chain.status === "ok" ? "Read live from the escrow contract on Arc Testnet." : "Chain data unavailable."} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Campaigns" value={chain.status === "ok" ? chain.data.campaignCount : "—"} />
          <StatCard label="Donated in total" value={chain.status === "ok" ? formatTokenAmount(platform.donated) : "—"} hint="USDC" />
          <StatCard label="Held in escrow" value={chain.status === "ok" ? formatTokenAmount(BigInt(chain.data.escrowBalance)) : "—"} hint="Includes vendor bonds" />
          <StatCard label="Paid to vendors" value={chain.status === "ok" ? formatTokenAmount(platform.released) : "—"} hint={`${formatTokenAmount(platform.refunded)} refunded`} />
        </div>
        <div className="surface mt-4 p-5">
          <FundFlowDiagram values={{ ...platform, stage1: "not_applicable", stage2: "not_applicable" }} perspective="Platform" />
        </div>
      </section>

      <section>
        <SectionHeading title="Open for funding" action={<Button asChild variant="ghost" size="sm"><Link href={isDonor ? "/app/donor/campaigns" : "/campaigns"}>All campaigns <ArrowRight aria-hidden /></Link></Button>} />
        {fundable.length === 0 ? (
          <EmptyState icon={HandCoins} title="No campaigns are accepting donations right now" description="New campaigns appear here as soon as an NGO creates them on-chain." />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">{fundable.map((c) => <CampaignCard key={c.id} campaign={c} />)}</div>
        )}
      </section>

      <section>
        <SectionHeading title="Your workspaces" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((w) => (
            <Link key={w.href} href={w.href} className="surface group flex flex-col p-5 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink-900 text-white"><w.icon className="h-4 w-4" aria-hidden /></span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
              </div>
              <p className="mt-4 font-semibold">{w.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{w.body}</p>
            </Link>
          ))}
          {open.length === 0 ? <p className="text-sm text-muted-foreground">No role workspaces yet.</p> : null}
        </div>
      </section>

      {requestable.length > 0 ? (
        <section>
          <SectionHeading title="Request additional access" description="NGO, Vendor and Validator access is reviewed by an administrator. Pending or rejected requests grant nothing." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {requestable.map((w) => {
              const r = latestByRole.get(w.role);
              const s = r && (r.status === "PENDING" || r.status === "REJECTED") ? STATUS_COPY[r.status] : null;
              return (
                <div key={w.href} className="flex flex-col rounded-lg border border-dashed p-4">
                  <div className="flex items-center gap-2">
                    <w.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <p className="text-sm font-medium">{ROLE_LABELS[w.role]}</p>
                    {s ? <Badge tone={s.tone} className="ml-auto"><s.icon aria-hidden /> {s.label}</Badge> : <Badge className="ml-auto">Not requested</Badge>}
                  </div>
                  <p className="mt-1.5 flex-1 text-xs text-muted-foreground">{w.body}</p>
                  {r?.status === "REJECTED" && r.reviewNote ? <p className="mt-2 text-xs text-destructive">Reviewer note: {r.reviewNote}</p> : null}
                  <Button asChild variant="link" className="mt-2 h-auto justify-start p-0 text-xs">
                    <Link href="/app/access">{s?.label === "Pending review" ? "View request" : "Request access"} <ArrowRight aria-hidden /></Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
