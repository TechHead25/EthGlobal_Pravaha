import Link from "next/link";
import { Activity, ArrowRight, Building2, Inbox, ScrollText, Users } from "lucide-react";
import { requirePrincipal } from "@/server/session";
import { getStore } from "@/server/db";
import { getIntegrationHealth, type HealthState } from "@/server/integrations";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice, PageHeader, SectionHeading, StatCard } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Administration" };

const HEALTH_TONE: Record<HealthState, BadgeTone> = {
  operational: "verified",
  degraded: "pending",
  unavailable: "failed",
  not_configured: "neutral",
  simulated: "pending",
};

const SECURITY_ACTIONS = new Set(["role.granted", "role.revoked", "user.suspended", "user.reactivated", "auth.sign_in_blocked", "organization.verified", "organization.rejected"]);

export default async function AdminPage() {
  await requirePrincipal("admin:view", "/app/admin");
  const store = getStore();
  const [requests, orgs, users, audit, health] = await Promise.all([
    store.listRoleRequests({ status: "PENDING", limit: 200 }),
    store.listOrganizations({ status: "PENDING_REVIEW", limit: 200 }),
    store.listUsers({ limit: 200 }),
    store.listAudit({ limit: 50 }),
    getIntegrationHealth(),
  ]);
  const security = audit.filter((a) => SECURITY_ACTIONS.has(a.action)).slice(0, 8);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Administration"
        title="Platform governance"
        description="Manage access and monitor integrations. Administrator privileges cover the application only — they cannot move escrowed funds or change on-chain outcomes."
        actions={
          <Button asChild>
            <Link href="/app/admin/requests"><Inbox aria-hidden /> Review approvals</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pending role requests" value={requests.length} icon={Inbox} />
        <StatCard label="Organizations to verify" value={orgs.length} icon={Building2} />
        <StatCard label="Accounts" value={users.length >= 200 ? "200+" : users.length} icon={Users} />
        <StatCard label="Suspended" value={users.filter((u) => u.status === "SUSPENDED").length} icon={Activity} />
      </div>

      <section>
        <SectionHeading title="Integration health" description="Live probes. Configuration is reported by name only." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {health.map((h) => (
            <div key={h.key} className="surface p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{h.name}</p>
                <Badge tone={HEALTH_TONE[h.state]} dot>{h.state.replace("_", " ")}</Badge>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{h.detail}{h.latencyMs !== undefined ? ` · ${h.latencyMs} ms` : ""}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent security events</CardTitle>
            <Button asChild variant="ghost" size="sm"><Link href="/app/admin/audit">Audit log <ArrowRight aria-hidden /></Link></Button>
          </CardHeader>
          <CardContent>
            {security.length === 0 ? (
              <p className="text-sm text-muted-foreground">No role, suspension, or verification changes recorded yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {security.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="font-mono text-xs">{a.action}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ScrollText className="h-4 w-4" aria-hidden /> Policy</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>· Administrators cannot review their own requests, change their own roles, or suspend other administrators through the app.</p>
            <p>· The Administrator role is provisioned only with the operator CLI (<span className="font-mono text-xs">npm run admin:grant</span>), never through the web.</p>
            <p>· NGO and Vendor roles require a verified organization owned by the requester.</p>
            <p>· Every grant, revocation, suspension, and verification decision is audited.</p>
          </CardContent>
        </Card>
      </div>
      <Notice tone="info">Application errors are reported with a reference digest only; consult server logs for details. Secrets and user tokens are never displayed here.</Notice>
    </div>
  );
}
