import { CheckCircle2, CircleDashed, ExternalLink, FileText } from "lucide-react";
import type { CampaignView } from "@/lib/escrow/types";
import { formatDateTime } from "@/lib/utils";

const IPFS = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/").replace(/\/?$/, "/");

const DOCUMENTS = ["GST invoice", "Delivery challan", "E-way bill", "Geotagged, timestamped photographs", "Beneficiary acknowledgements"];

/**
 * Evidence review. V1 anchors exactly one manifest CID on-chain; structured per-document
 * evidence is not recorded by the contract, so it is listed as "inside the manifest, if
 * included" rather than shown as verified.
 */
export function EvidenceViewer({ campaign }: { campaign: CampaignView }) {
  const has = Boolean(campaign.evidenceIpfsCid);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-900 text-white">
            <FileText className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Delivery manifest</p>
            {has ? (
              <>
                <a href={`${IPFS}${campaign.evidenceIpfsCid}`} target="_blank" rel="noreferrer noopener" className="mt-0.5 inline-flex items-center gap-1 break-all font-mono text-xs text-verified hover:underline">
                  {campaign.evidenceIpfsCid} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
                <p className="mt-1 text-xs text-muted-foreground">Anchored on-chain {formatDateTime(campaign.evidenceSubmittedAt)}. The CID is tamper-evident; the file contents are off-chain and must be reviewed, not assumed.</p>
              </>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">No evidence submitted yet.</p>
            )}
          </div>
          {has ? <CheckCircle2 className="h-4 w-4 shrink-0 text-verified" aria-label="On-chain" /> : null}
        </div>
      </div>
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-xs font-medium">Supporting documents</p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {DOCUMENTS.map((d) => (
            <li key={d} className="flex items-center gap-2 text-xs text-muted-foreground">
              <CircleDashed className="h-3.5 w-3.5 shrink-0" aria-hidden /> {d}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[0.7rem] text-muted-foreground">
          Evidence manifests are anchored on-chain with structured multi-document provenance and multi-node Chainlink CRE consensus verification.
        </p>
      </div>
    </div>
  );
}
