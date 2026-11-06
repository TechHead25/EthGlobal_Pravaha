"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ExternalLink, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { formatDateTime, shortAddress } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormField, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface RequestRow {
  id: string;
  role: Role;
  status: string;
  justification: string;
  walletAddress: string | null;
  createdAt: string;
  reviewNote: string | null;
  userEmail: string;
  userName: string | null;
  isSelf: boolean;
  organization: { id: string; name: string; status: string } | null;
}

export interface OrgRow {
  id: string;
  kind: string;
  name: string;
  country: string;
  website: string | null;
  registrationNumber: string | null;
  description: string;
  status: string;
  createdAt: string;
  ownerEmail: string;
  isSelf: boolean;
}

const TONE: Record<string, "pending" | "verified" | "failed" | "neutral"> = {
  PENDING: "pending",
  PENDING_REVIEW: "pending",
  APPROVED: "verified",
  VERIFIED: "verified",
  REJECTED: "failed",
  WITHDRAWN: "neutral",
};

function DecisionButtons({ endpoint, label, disabledReason, onDone }: { endpoint: string; label: string; disabledReason?: string; onDone: () => void }) {
  const [note, setNote] = React.useState("");
  const decide = (decision: "APPROVE" | "REJECT") => async () => {
    const res = await apiFetch(endpoint, { method: "PATCH", body: { decision, ...(note.trim() ? { note: note.trim() } : {}) } });
    if (!res.ok) {
      toast.error("Decision not recorded", { description: res.message });
      return;
    }
    toast.success(decision === "APPROVE" ? "Approved" : "Rejected");
    onDone();
  };
  const noteField = (
    <FormField id={`note-${endpoint}`} label="Note (optional, shown to the requester)" className="mt-2">
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-[72px]" />
    </FormField>
  );
  if (disabledReason) return <p className="text-xs text-muted-foreground">{disabledReason}</p>;
  return (
    <div className="flex gap-2">
      <ConfirmDialog trigger={<Button size="sm" variant="verified"><Check aria-hidden /> Approve</Button>} title={`Approve ${label}?`} description="This is recorded in the audit log." tone="verified" confirmLabel="Approve" onConfirm={decide("APPROVE")}>
        {noteField}
      </ConfirmDialog>
      <ConfirmDialog trigger={<Button size="sm" variant="outline"><X aria-hidden /> Reject</Button>} title={`Reject ${label}?`} description="This is recorded in the audit log." tone="destructive" confirmLabel="Reject" onConfirm={decide("REJECT")}>
        {noteField}
      </ConfirmDialog>
    </div>
  );
}

export function ApprovalsBoard({ requests, organizations }: { requests: RequestRow[]; organizations: OrgRow[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const pendingReq = requests.filter((r) => r.status === "PENDING");
  const pendingOrg = organizations.filter((o) => o.status === "PENDING_REVIEW");
  const decided = requests.filter((r) => r.status !== "PENDING");

  return (
    <Tabs defaultValue="roles">
      <TabsList>
        <TabsTrigger value="roles">Role requests <Badge tone={pendingReq.length ? "pending" : "neutral"} className="ml-1">{pendingReq.length}</Badge></TabsTrigger>
        <TabsTrigger value="orgs">Organizations <Badge tone={pendingOrg.length ? "pending" : "neutral"} className="ml-1">{pendingOrg.length}</Badge></TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="roles" className="space-y-3">
        {pendingReq.length === 0 ? (
          <EmptyState icon={Inbox} title="No pending role requests" />
        ) : (
          pendingReq.map((r) => {
            const needsOrg = r.role === "NGO" || r.role === "VENDOR";
            const blocked = r.isSelf
              ? "You cannot review your own request."
              : needsOrg && r.organization?.status !== "VERIFIED"
                ? "Verify the linked organization before approving."
                : undefined;
            return (
              <div key={r.id} className="surface space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{r.userName ?? r.userEmail} <span className="text-sm font-normal text-muted-foreground">· {r.userEmail}</span></p>
                    <p className="text-xs text-muted-foreground">Requested {formatDateTime(r.createdAt)}</p>
                  </div>
                  <Badge tone="info">{ROLE_LABELS[r.role]}</Badge>
                </div>
                <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{r.justification}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  {r.walletAddress ? <span>Claimed wallet: <span className="font-mono">{shortAddress(r.walletAddress, 6)}</span> (unverified claim)</span> : null}
                  {r.organization ? <span>Organization: {r.organization.name} <Badge tone={TONE[r.organization.status]} className="ml-1">{r.organization.status.toLowerCase().replace("_", " ")}</Badge></span> : null}
                  {r.role === "VALIDATOR" ? <span>On-chain voting also requires this wallet in the contract’s validator set.</span> : null}
                </div>
                <DecisionButtons endpoint={`/api/admin/role-requests/${r.id}`} label={`${ROLE_LABELS[r.role]} for ${r.userEmail}`} disabledReason={blocked} onDone={refresh} />
              </div>
            );
          })
        )}
      </TabsContent>

      <TabsContent value="orgs" className="space-y-3">
        {organizations.length === 0 ? (
          <EmptyState icon={Building2} title="No organizations submitted" />
        ) : (
          organizations.map((o) => (
            <div key={o.id} className="surface space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{o.name} <span className="text-sm font-normal text-muted-foreground">· {o.kind} · {o.country}</span></p>
                  <p className="text-xs text-muted-foreground">Owner {o.ownerEmail} · submitted {formatDateTime(o.createdAt)}</p>
                </div>
                <Badge tone={TONE[o.status]}>{o.status.toLowerCase().replace("_", " ")}</Badge>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{o.description}</p>
              <div className="flex flex-wrap gap-4 text-xs">
                {o.website ? (
                  <a href={o.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-verified hover:underline">
                    {o.website} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
                {o.registrationNumber ? <span>Reg. no. {o.registrationNumber}</span> : null}
              </div>
              {o.status === "PENDING_REVIEW" ? (
                <DecisionButtons endpoint={`/api/admin/organizations/${o.id}`} label={o.name} disabledReason={o.isSelf ? "You cannot verify your own organization." : undefined} onDone={refresh} />
              ) : null}
            </div>
          ))
        )}
      </TabsContent>

      <TabsContent value="history">
        {decided.length === 0 ? (
          <EmptyState icon={Inbox} title="No decided requests yet" />
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {decided.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>{r.userEmail} · {ROLE_LABELS[r.role]}</span>
                <span className="text-xs text-muted-foreground">{r.reviewNote ?? ""}</span>
                <Badge tone={TONE[r.status]}>{r.status.toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
