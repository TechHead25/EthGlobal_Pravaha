import { CheckCircle2 } from "lucide-react";
import { requirePrincipal } from "@/server/session";
import { getStore } from "@/server/db";
import { REQUESTABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/roles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, SectionHeading } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { RoleRequestForm } from "./role-request-form";
import { OrganizationForm } from "./organization-form";
import { WithdrawButton } from "./withdraw-button";

export const metadata = { title: "Access & roles" };

const STATUS_TONE = { PENDING: "pending", APPROVED: "verified", REJECTED: "failed", WITHDRAWN: "neutral" } as const;
const ORG_TONE = { PENDING_REVIEW: "pending", VERIFIED: "verified", REJECTED: "failed" } as const;

export default async function AccessPage() {
  const principal = await requirePrincipal("role:request", "/app/access");
  const store = getStore();
  const [requests, orgs] = await Promise.all([
    store.listRoleRequests({ userId: principal.id, limit: 50 }),
    store.listOrganizations({ ownerId: principal.id, limit: 20 }),
  ]);
  const pendingRoles = requests.filter((r) => r.status === "PENDING").map((r) => r.role);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Account"
        title="Access & roles"
        description="Roles are granted by review and recorded in an audit log. Choosing a role here submits a request — it does not grant access by itself."
      />

      <section>
        <SectionHeading title="Your roles" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {REQUESTABLE_ROLES.map((role) => {
            const held = principal.roles.includes(role);
            const pending = pendingRoles.includes(role);
            return (
              <div key={role} className="surface p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{ROLE_LABELS[role]}</p>
                  {held ? (
                    <Badge tone="verified"><CheckCircle2 aria-hidden /> Active</Badge>
                  ) : pending ? (
                    <Badge tone="pending">Pending</Badge>
                  ) : (
                    <Badge>Not held</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
              </div>
            );
          })}
        </div>
        {principal.roles.includes("ADMIN") ? (
          <p className="mt-3 text-xs text-muted-foreground">You also hold the Administrator role (operator-provisioned).</p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Request a role</CardTitle>
            <p className="text-sm text-muted-foreground">NGO and Vendor roles require a verified organization of the same type.</p>
          </CardHeader>
          <CardContent>
            <RoleRequestForm
              heldRoles={principal.roles}
              pendingRoles={pendingRoles}
              organizations={orgs.filter((o) => o.status !== "REJECTED").map((o) => ({ id: o.id, name: o.name, kind: o.kind, status: o.status }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Register an organization</CardTitle>
            <p className="text-sm text-muted-foreground">Submitted for verification by an administrator. Verification status is separate from your roles.</p>
          </CardHeader>
          <CardContent>
            <OrganizationForm />
          </CardContent>
        </Card>
      </div>

      <section>
        <SectionHeading title="Your organizations" />
        {orgs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No organizations submitted.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {orgs.map((o) => (
              <li key={o.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{o.name} <span className="text-xs font-normal text-muted-foreground">· {o.kind} · {o.country}</span></p>
                  <p className="text-xs text-muted-foreground">Submitted {formatDateTime(o.createdAt)}{o.reviewNote ? ` · Note: ${o.reviewNote}` : ""}</p>
                </div>
                <Badge tone={ORG_TONE[o.status]}>{o.status.replace("_", " ").toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading title="Request history" />
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{ROLE_LABELS[r.role]}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(r.createdAt)}
                    {r.reviewedAt ? ` · reviewed ${formatDateTime(r.reviewedAt)}` : ""}
                    {r.reviewNote ? ` · ${r.reviewNote}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[r.status]}>{r.status.toLowerCase()}</Badge>
                  {r.status === "PENDING" ? <WithdrawButton id={r.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
