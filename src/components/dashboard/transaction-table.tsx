"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import type { EscrowEvent } from "@/lib/escrow/types";
import { describeEvent } from "@/lib/escrow/activity";
import { getExplorerTxUrl } from "@/lib/arc/config";
import { formatDateTime, formatTokenAmount, shortAddress } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";

export interface TxRow {
  key: string;
  event: EscrowEvent;
  title: string;
  tone: "verified" | "pending" | "info" | "failed" | "neutral";
  campaignId: number;
  campaignTitle: string;
  amount: number | null;
  amountRaw: bigint | null;
  time: number;
  status: string;
}

export function toTxRows(events: readonly EscrowEvent[], titleFor: (id: number) => string, statusFor?: (e: EscrowEvent) => string): TxRow[] {
  return events.map((e) => {
    const d = describeEvent(e);
    const raw = d.amountArg && e.args[d.amountArg] ? BigInt(e.args[d.amountArg]) : null;
    return {
      key: e.key,
      event: e,
      title: d.title,
      tone: d.tone,
      campaignId: e.campaignId,
      campaignTitle: titleFor(e.campaignId),
      amount: raw === null ? null : Number(raw) / 1e6,
      amountRaw: raw,
      time: e.timestamp ?? e.blockNumber,
      status: statusFor ? statusFor(e) : "Confirmed on-chain",
    };
  });
}

const columns: ColumnDef<TxRow>[] = [
  {
    accessorKey: "time",
    header: "Date",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs">
        {row.original.event.timestamp ? formatDateTime(row.original.event.timestamp) : `Block ${row.original.event.blockNumber.toLocaleString("en-US")}`}
      </span>
    ),
  },
  { accessorKey: "title", header: "Activity", cell: ({ row }) => <Badge tone={row.original.tone}>{row.original.title}</Badge> },
  {
    accessorKey: "campaignTitle",
    header: "Campaign",
    cell: ({ row }) => (
      <Link href={`/campaigns/${row.original.campaignId}`} className="hover:underline">
        {row.original.campaignTitle}
      </Link>
    ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (row.original.amountRaw !== null ? <span className="whitespace-nowrap font-medium">{formatTokenAmount(row.original.amountRaw)} USDC</span> : "—"),
  },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.status}</span> },
  {
    id: "tx",
    header: "Transaction",
    enableSorting: false,
    cell: ({ row }) => (
      <a href={getExplorerTxUrl(row.original.event.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-verified hover:underline">
        {shortAddress(row.original.event.txHash, 6)} <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    ),
  },
];

export function TransactionTable({ rows, emptyMessage = "No transactions yet.", searchPlaceholder = "Search transactions" }: { rows: TxRow[]; emptyMessage?: string; searchPlaceholder?: string }) {
  return <DataTable columns={columns} data={rows} searchPlaceholder={searchPlaceholder} pageSize={10} emptyMessage={emptyMessage} />;
}
