import { requirePrincipal } from "@/server/session";
import { getStore } from "@/server/db";
import { PageHeader } from "@/components/ui/primitives";
import { UsersTable, type UserRow } from "./users-table";

export const metadata = { title: "Users & roles" };

export default async function AdminUsersPage() {
  const principal = await requirePrincipal("admin:manage_roles", "/app/admin/users");
  const users = await getStore().listUsers({ limit: 500 });
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    status: u.status,
    roles: u.roles,
    worldId: Boolean(u.worldIdVerifiedAt),
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    isSelf: u.id === principal.id,
  }));
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Users & roles"
        description="Grant or revoke workspace roles and suspend accounts. Your own account and other administrators cannot be modified here."
      />
      <UsersTable rows={rows} />
    </div>
  );
}
