import { requirePrincipal } from "@/server/session";
import { getStore } from "@/server/db";
import { PageHeader } from "@/components/ui/primitives";
import { AuditTable, type AuditRow } from "./audit-table";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requirePrincipal("admin:view_audit", "/app/admin/audit");
  const store = getStore();
  const [events, users] = await Promise.all([store.listAudit({ limit: 300 }), store.listUsers({ limit: 500 })]);
  const email = new Map(users.map((u) => [u.id, u.email]));
  const rows: AuditRow[] = events.map((e) => ({
    id: e.id,
    at: e.createdAt.toISOString(),
    actor: e.actorId ? email.get(e.actorId) ?? e.actorId : "system / operator",
    action: e.action,
    target: e.targetType ? `${e.targetType}${e.targetId ? ` · ${e.targetType === "User" ? email.get(e.targetId) ?? e.targetId : e.targetId}` : ""}` : "—",
    metadata: e.metadata ? JSON.stringify(e.metadata) : "",
  }));
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Administration" title="Audit log" description="Append-only record of sign-ins, role changes, verification decisions, and suspensions. The 300 most recent events." />
      <AuditTable rows={rows} />
    </div>
  );
}
