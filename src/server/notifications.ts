import "server-only";
import { can, ROLE_LABELS, type Principal } from "@/lib/auth/roles";
import type { ShellNotification } from "@/components/app/app-shell";
import type { AuthzStore } from "./store/types";

const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

/** Builds notifications from real records only (role requests, org reviews, admin queues). */
export async function buildNotifications(store: AuthzStore, principal: Principal): Promise<ShellNotification[]> {
  const out: ShellNotification[] = [];
  const [requests, orgs] = await Promise.all([
    store.listRoleRequests({ userId: principal.id, limit: 20 }),
    store.listOrganizations({ ownerId: principal.id, limit: 10 }),
  ]);
  const now = Date.now();
  for (const r of requests) {
    if (r.status === "PENDING") {
      out.push({ id: `rr-${r.id}`, title: `${ROLE_LABELS[r.role]} request pending`, body: "Awaiting administrator review.", href: "/app/access", tone: "pending" });
    } else if (r.reviewedAt && now - r.reviewedAt.getTime() < RECENT_MS && r.status !== "WITHDRAWN") {
      out.push({
        id: `rr-${r.id}`,
        title: `${ROLE_LABELS[r.role]} request ${r.status === "APPROVED" ? "approved" : "declined"}`,
        body: r.reviewNote ?? undefined,
        href: "/app/access",
        tone: r.status === "APPROVED" ? "verified" : "failed",
      });
    }
  }
  for (const o of orgs) {
    if (o.reviewedAt && now - o.reviewedAt.getTime() < RECENT_MS) {
      out.push({
        id: `org-${o.id}`,
        title: `${o.name} ${o.status === "VERIFIED" ? "verified" : "not verified"}`,
        href: "/app/access",
        tone: o.status === "VERIFIED" ? "verified" : "failed",
      });
    }
  }
  if (can(principal, "admin:review_requests")) {
    const pending = await store.listRoleRequests({ status: "PENDING", limit: 100 });
    const others = pending.filter((p) => p.userId !== principal.id).length;
    if (others > 0) out.unshift({ id: "admin-rr", title: `${others} role request${others === 1 ? "" : "s"} to review`, href: "/app/admin/requests", tone: "pending" });
  }
  if (can(principal, "admin:verify_organizations")) {
    const pendingOrgs = await store.listOrganizations({ status: "PENDING_REVIEW", limit: 100 });
    const others = pendingOrgs.filter((o) => o.ownerId !== principal.id).length;
    if (others > 0) out.unshift({ id: "admin-org", title: `${others} organization${others === 1 ? "" : "s"} awaiting verification`, href: "/app/admin/requests", tone: "info" });
  }
  return out.slice(0, 12);
}
