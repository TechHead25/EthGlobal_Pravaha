"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export interface AuditRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  metadata: string;
}

function tone(action: string) {
  if (action.includes("revoked") || action.includes("suspended") || action.includes("blocked") || action.includes("rejected")) return "failed" as const;
  if (action.includes("granted") || action.includes("verified")) return "verified" as const;
  if (action.includes("requested") || action.includes("submitted")) return "pending" as const;
  return "neutral" as const;
}

const columns: ColumnDef<AuditRow>[] = [
  { accessorKey: "at", header: "Time", cell: ({ row }) => <span className="whitespace-nowrap text-xs">{formatDateTime(row.original.at)}</span> },
  { accessorKey: "action", header: "Action", cell: ({ row }) => <Badge tone={tone(row.original.action)}>{row.original.action}</Badge> },
  { accessorKey: "actor", header: "Actor", cell: ({ row }) => <span className="text-xs">{row.original.actor}</span> },
  { accessorKey: "target", header: "Target", cell: ({ row }) => <span className="text-xs">{row.original.target}</span> },
  { accessorKey: "metadata", header: "Details", enableSorting: false, cell: ({ row }) => <code className="break-all text-[0.7rem] text-muted-foreground">{row.original.metadata}</code> },
];

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return <DataTable columns={columns} data={rows} searchPlaceholder="Filter by action, actor, or target" pageSize={25} emptyMessage="No audit events recorded yet." />;
}
