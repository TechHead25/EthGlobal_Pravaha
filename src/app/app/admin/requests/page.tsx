import { requirePrincipal } from "@/server/session";
import { getStore } from "@/server/db";
import { can } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/primitives";
import { ApprovalsBoard, type OrgRow, type RequestRow } from "./approvals-board";

export const metadata = { title: "Approvals" };

export default async function AdminRequestsPage() {
  const principal = await requirePrincipal("admin:review_requests", "/app/admin/requests");
  const store = getStore();
  const [requests, orgs, users] = await Promise.all([
    store.listRoleRequests({ limit: 200 }),
    can(principal, "admin:verify_organizations") ? store.listOrganizations({ limit: 200 }) : Promise.resolve([]),
    store.listUsers({ limit: 500 }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  const requestRows: RequestRow[] = requests.map((r) => ({
    id: r.id,
    role: r.role,
    status: r.status,
    justification: r.justification,
    walletAddress: r.walletAddress,
    createdAt: r.createdAt.toISOString(),
    reviewNote: r.reviewNote,
    userEmail: userById.get(r.userId)?.email ?? "unknown",
    userName: userById.get(r.userId)?.name ?? null,
    isSelf: r.userId === principal.id,
    organization: r.organizationId && orgById.get(r.organizationId) ? { id: r.organizationId, name: orgById.get(r.organizationId)!.name, status: orgById.get(r.organizationId)!.status } : null,
  }));
  const orgRows: OrgRow[] = orgs.map((o) => ({
    id: o.id,
    kind: o.kind,
    name: o.name,
    country: o.country,
    website: o.website,
    registrationNumber: o.registrationNumber,
    description: o.description,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    ownerEmail: userById.get(o.ownerId)?.email ?? "unknown",
    isSelf: o.ownerId === principal.id,
  }));

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Administration" title="Approvals" description="Verify organizations first, then approve the role requests that depend on them. Every decision is audited." />
      <ApprovalsBoard requests={requestRows} organizations={orgRows} />
    </div>
  );
}
