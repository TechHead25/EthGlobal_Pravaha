"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ADMIN_GRANTABLE_ROLES, ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormField, Textarea } from "@/components/ui/input";

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  status: "ACTIVE" | "SUSPENDED";
  roles: Role[];
  worldId: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  isSelf: boolean;
}

type PendingAction =
  | { kind: "role"; user: UserRow; action: "GRANT" | "REVOKE"; role: Role }
  | { kind: "status"; user: UserRow; status: "ACTIVE" | "SUSPENDED" };

export function UsersTable({ rows }: { rows: UserRow[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    if (!pending) return;
    if (reason.trim().length < 5) return setError("Give a reason of at least 5 characters (recorded in the audit log).");
    setBusy(true);
    const res =
      pending.kind === "role"
        ? await apiFetch(`/api/admin/users/${pending.user.id}/roles`, { method: "POST", body: { action: pending.action, role: pending.role, reason: reason.trim() } })
        : await apiFetch(`/api/admin/users/${pending.user.id}/status`, { method: "POST", body: { status: pending.status, reason: reason.trim() } });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    toast.success("Change recorded");
    setPending(null);
    router.refresh();
  }

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: "email",
      header: "User",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name ?? "—"}{row.original.isSelf ? <span className="ml-1 text-xs text-muted-foreground">(you)</span> : null}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
      filterFn: "includesString",
    },
    {
      id: "roles",
      header: "Roles",
      accessorFn: (r) => r.roles.join(" "),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.filter((r) => r !== "USER").map((r) => (
            <Badge key={r} tone={r === "ADMIN" ? "completed" : "verified"}>{ROLE_LABELS[r]}</Badge>
          ))}
          {row.original.roles.length === 1 ? <Badge>Member</Badge> : null}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge tone={row.original.status === "ACTIVE" ? "verified" : "failed"} dot>{row.original.status.toLowerCase()}</Badge>,
    },
    { accessorKey: "worldId", header: "World ID", cell: ({ row }) => (row.original.worldId ? "Verified" : "—") },
    { accessorKey: "lastLoginAt", header: "Last sign-in", cell: ({ row }) => formatDate(row.original.lastLoginAt) },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original;
        const locked = u.isSelf || u.roles.includes("ADMIN");
        if (locked) return <span className="text-xs text-muted-foreground">{u.isSelf ? "Self" : "Operator-managed"}</span>;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Actions for ${u.email}`}><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Roles</DropdownMenuLabel>
              {ADMIN_GRANTABLE_ROLES.map((role) =>
                u.roles.includes(role) ? (
                  <DropdownMenuItem key={role} onSelect={() => { setReason(""); setError(null); setPending({ kind: "role", user: u, action: "REVOKE", role }); }}>Revoke {ROLE_LABELS[role]}</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={role} onSelect={() => { setReason(""); setError(null); setPending({ kind: "role", user: u, action: "GRANT", role }); }}>Grant {ROLE_LABELS[role]}</DropdownMenuItem>
                )
              )}
              <DropdownMenuSeparator />
              {u.status === "ACTIVE" ? (
                <DropdownMenuItem className="text-destructive" onSelect={() => { setReason(""); setError(null); setPending({ kind: "status", user: u, status: "SUSPENDED" }); }}>Suspend account</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => { setReason(""); setError(null); setPending({ kind: "status", user: u, status: "ACTIVE" }); }}>Reactivate account</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const title = !pending
    ? ""
    : pending.kind === "role"
      ? `${pending.action === "GRANT" ? "Grant" : "Revoke"} ${ROLE_LABELS[pending.role]} — ${pending.user.email}`
      : `${pending.status === "SUSPENDED" ? "Suspend" : "Reactivate"} ${pending.user.email}`;

  return (
    <>
      <DataTable columns={columns} data={rows} searchPlaceholder="Search users" pageSize={15} emptyMessage="No users yet." />
      <Dialog open={pending !== null} onOpenChange={(o) => !busy && !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {pending?.kind === "role" && pending.action === "GRANT" && (pending.role === "NGO" || pending.role === "VENDOR")
                ? "The user must own a verified organization of this type. "
                : ""}
              {pending?.kind === "status" && pending.status === "SUSPENDED" ? "Suspended users lose all permissions immediately and cannot sign in. " : ""}
              This change is recorded with your identity and reason.
            </DialogDescription>
          </DialogHeader>
          <FormField id="reason" label="Reason" error={error ?? undefined}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
            <Button variant={pending?.kind === "status" && pending.status === "SUSPENDED" ? "destructive" : "default"} onClick={() => void submit()} loading={busy}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
