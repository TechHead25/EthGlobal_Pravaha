"use client";

import Link from "next/link";
import { BadgeCheck, Building2, ExternalLink, Globe2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { RoleHeader } from "@/components/dashboard/role-header";
import { CampaignStatusBadge, Panel, UnsupportedFeature } from "@/components/dashboard/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, StatCard } from "@/components/ui/primitives";
import { useVendorPortfolio } from "./vendor-shared";

interface OrgRow {
  id: string;
  name: string;
  country: string;
  website: string | null;
  registrationNumber: string | null;
  description: string;
  status: string;
  reviewedAt: string | null;
  createdAt: string;
}

const TONE: Record<string, "verified" | "pending" | "failed"> = { VERIFIED: "verified", PENDING_REVIEW: "pending", REJECTED: "failed" };

export function VendorProfile({ orgs }: { orgs: OrgRow[] }) {
  const w = useWallet();
  const v = useVendorPortfolio();
  const delivered = v.awarded.filter((c) => c.evidenceIpfsCid);
  const onTime = delivered.filter((c) => c.evidenceSubmittedAt > 0 && c.evidenceSubmittedAt <= c.deliveryDeadline);

  return (
    <div className="space-y-6">
      <RoleHeader eyebrow="Vendor dashboard" title="Supplier profile" description="Your verified organization record and an on-chain delivery history that anyone can audit." actions={<Button asChild variant="outline"><Link href="/app/access">Manage organization</Link></Button>} />
      {orgs.length === 0 ? (
        <EmptyState icon={Building2} title="No vendor organization on file" action={<Button asChild><Link href="/app/access">Register your business</Link></Button>} />
      ) : (
        orgs.map((o) => (
          <Panel key={o.id} title={o.name} action={<Badge tone={TONE[o.status] ?? "neutral"}>{o.status === "VERIFIED" ? <><BadgeCheck aria-hidden /> Verified</> : o.status.replace("_", " ").toLowerCase()}</Badge>}>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">Country of registration</dt><dd>{o.country}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Registration no.</dt><dd>{o.registrationNumber ?? "—"}</dd></div>
              <div>
                <dt className="text-xs text-muted-foreground">Website</dt>
                <dd>{o.website ? <a href={o.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-verified hover:underline"><Globe2 className="h-3.5 w-3.5" aria-hidden />{new URL(o.website).host}<ExternalLink className="h-3 w-3" aria-hidden /></a> : "—"}</dd>
              </div>
              <div><dt className="text-xs text-muted-foreground">Verified</dt><dd>{o.reviewedAt && o.status === "VERIFIED" ? formatDate(o.reviewedAt) : "Not yet"}</dd></div>
            </dl>
            <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{o.description}</p>
          </Panel>
        ))
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <UnsupportedFeature title="GSTIN & PAN verification">Automated tax-ID verification is not implemented. Administrators verify organizations manually from the details above.</UnsupportedFeature>
        <UnsupportedFeature title="Service categories & operational regions">Not part of the current organization record; adding them would require a schema change.</UnsupportedFeature>
        <UnsupportedFeature title="Ratings, feedback & trust score">Beneficiary feedback and trust scoring (Arkiv) are specified for V2.</UnsupportedFeature>
      </div>

      <Panel title="On-chain delivery record" description={w.address ? "Computed from the escrow for the connected wallet." : "Connect your wallet to load your record."}>
        {w.address ? (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <StatCard label="Contracts won" value={v.awarded.length} />
              <StatCard label="Completed" value={v.completed.length} />
              <StatCard label="Evidence on time" value={delivered.length ? `${onTime.length}/${delivered.length}` : "—"} />
              <StatCard label="Rejected by validators" value={v.awarded.filter((c) => c.state === 8).length} />
            </div>
            {v.awarded.length ? (
              <ul className="mt-4 divide-y rounded-lg border text-sm">
                {v.awarded.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">#{c.id} {c.metadata?.title ?? ""}</Link>
                    <span className="text-xs text-muted-foreground">{c.evidenceSubmittedAt ? `Evidence ${formatDate(c.evidenceSubmittedAt)}` : `Due ${formatDate(c.deliveryDeadline)}`}</span>
                    <CampaignStatusBadge state={c.state} />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <Button onClick={w.connect} loading={w.connecting}>Connect wallet</Button>
        )}
      </Panel>
    </div>
  );
}
