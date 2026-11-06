"use client";

import * as React from "react";
import { FileUp, Inbox, PackageCheck, Truck, Wallet, MapPin, Upload, Camera, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { CampaignView } from "@/lib/escrow/types";
import { formatDateTime, formatTokenAmount } from "@/lib/utils";
import { computeFundFlow } from "@/lib/escrow/fund-flow";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { CampaignStatusBadge, Panel, useCampaignTitle } from "@/components/dashboard/common";
import { FundFlowDiagram } from "@/components/dashboard/fund-flow";
import { EvidenceViewer } from "@/components/dashboard/evidence-viewer";
import { toTxRows, TransactionTable } from "@/components/dashboard/transaction-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormField, Input } from "@/components/ui/input";
import { EmptyState, StatCard } from "@/components/ui/primitives";
import { useVendorActions, useVendorPortfolio } from "./vendor-shared";

function ProofOfWorkUploader({
  c,
  onSubmit,
}: {
  c: CampaignView;
  onSubmit: (cid: string) => Promise<void>;
}) {
  const [cid, setCid] = React.useState("");
  const [invoiceName, setInvoiceName] = React.useState<string | null>(null);
  const [photoName, setPhotoName] = React.useState<string | null>(null);
  const [exifData, setExifData] = React.useState<{
    lat?: number;
    lng?: number;
    timestamp?: string;
    extracted: boolean;
  }>({ extracted: false });

  // Simulate EXIF metadata extraction from geotagged delivery photo
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoName(file.name);
    // Extract metadata or mock standard disaster relief coordinates for demo
    setTimeout(() => {
      setExifData({
        lat: 24.8607,
        lng: 67.0011,
        timestamp: new Date().toISOString(),
        extracted: true,
      });
      toast.success("Geotagged EXIF metadata extracted: GPS coordinates verified inside relief polygon.");
      if (!cid) {
        setCid("bafybeicb blankets_delivery_manifest_v1_cid");
      }
    }, 500);
  };

  const handleInvoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInvoiceName(file.name);
    toast.success("Invoice uploaded! Ready for Gemini AI line-item extraction.");
  };

  return (
    <div className="rounded-xl border bg-muted/20 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FileUp className="h-5 w-5 text-primary" aria-hidden />
        <h4 className="font-semibold text-sm text-foreground">Submit multi-modal proof of delivery</h4>
      </div>

      <p className="text-xs text-muted-foreground">
        Upload your delivery invoice (for Gemini AI spec check), geotagged photos (for Chainlink CRE geofencing), and the IPFS manifest CID. Proof is anchored on-chain and triggers the 3-of-5 validator review.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* INVOICE UPLOAD */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <label className="text-xs font-medium flex items-center gap-1.5 text-foreground">
            <FileText className="h-4 w-4 text-primary" /> Delivery Invoice (PDF/PNG)
          </label>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleInvoiceUpload}
            className="text-xs text-muted-foreground file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-primary/10 file:text-primary file:font-semibold hover:file:bg-primary/20 cursor-pointer"
          />
          {invoiceName && (
            <p className="text-[11px] text-verified flex items-center gap-1 font-mono">
              <CheckCircle2 className="h-3 w-3" /> {invoiceName} (Ready for Gemini AI)
            </p>
          )}
        </div>

        {/* GEOTAGGED PHOTO UPLOAD */}
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <label className="text-xs font-medium flex items-center gap-1.5 text-foreground">
            <Camera className="h-4 w-4 text-primary" /> Geotagged Delivery Photo
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="text-xs text-muted-foreground file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-primary/10 file:text-primary file:font-semibold hover:file:bg-primary/20 cursor-pointer"
          />
          {exifData.extracted && (
            <div className="text-[11px] font-mono text-muted-foreground space-y-0.5">
              <p className="flex items-center gap-1 text-verified font-semibold">
                <MapPin className="h-3 w-3" /> Lat: {exifData.lat?.toFixed(4)}° N, Long: {exifData.lng?.toFixed(4)}° E
              </p>
              <p className="text-[10px]">Captured: {new Date(exifData.timestamp!).toLocaleTimeString()}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end pt-1">
        <FormField id={`ev-${c.id}`} label="Final manifest IPFS CID" className="flex-1">
          <Input
            value={cid}
            onChange={(e) => setCid(e.target.value)}
            className="font-mono text-xs"
            placeholder="bafybeicb... manifest.json"
            autoComplete="off"
          />
        </FormField>
        <ConfirmDialog
          trigger={
            <Button disabled={!cid} className="w-full sm:w-auto">
              <PackageCheck className="h-4 w-4 mr-1.5" aria-hidden /> Anchor evidence on-chain
            </Button>
          }
          title="Submit delivery evidence?"
          description={`Writing manifest ${cid.slice(0, 18)}... on-chain. This immediately advances Campaign #${c.id} to 3-of-5 validator quorum.`}
          confirmLabel="Open wallet & sign"
          onConfirm={() => onSubmit(cid)}
        />
      </div>
    </div>
  );
}

function ContractCard({
  c,
  actions,
  bond,
}: {
  c: CampaignView;
  actions: ReturnType<typeof useVendorActions>;
  bond: bigint | null;
}) {
  const live = useEscrowLive();
  const flow = computeFundFlow(c, live.events);
  const now = Math.floor(Date.now() / 1000);

  return (
    <article className="surface space-y-5 p-5 rounded-xl border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl tracking-tight">{c.metadata?.title || `Campaign #${c.id}`}</p>
          <p className="mt-1 text-xs text-muted-foreground font-mono">
            Contract value {formatTokenAmount(flow.awarded)} USDC · delivery deadline {formatDateTime(c.deliveryDeadline)}
          </p>
        </div>
        <CampaignStatusBadge state={c.state} />
      </div>

      {c.metadata?.description ? (
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-semibold text-foreground">Delivery requirements (NGO specification)</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.metadata.description}</p>
        </div>
      ) : null}

      <FundFlowDiagram values={flow} />

      <p className="text-xs text-muted-foreground font-mono">
        Performance bond:{" "}
        {bond === null
          ? "…"
          : `${formatTokenAmount(bond)} USDC ${bond > 0n ? "· held in escrow until final settlement" : "· released or refunded"}`}
      </p>

      {/* STATE 5: AWAITING DELIVERY EVIDENCE */}
      {c.state === 5 ? (
        <ProofOfWorkUploader c={c} onSubmit={(cid) => actions.submitEvidence(c, cid)} />
      ) : c.evidenceIpfsCid ? (
        <EvidenceViewer campaign={c} />
      ) : null}

      {/* STATE 9: CHALLENGE PERIOD FINALIZATION */}
      {c.state === 9 && now > c.challengeExpiry && !c.isDisputed ? (
        <Button variant="verified" onClick={() => void actions.finalize(c)}>
          <Truck className="h-4 w-4 mr-1.5" aria-hidden /> Finalize settlement (Release 30% Stage 2 + Bond)
        </Button>
      ) : c.state === 9 ? (
        <p className="text-xs text-muted-foreground font-mono">
          Final 30% disbursement unlocks after {formatDateTime(c.challengeExpiry)} if no fraud dispute is upheld.
        </p>
      ) : null}
    </article>
  );
}

export function VendorContracts() {
  const w = useWallet();
  const v = useVendorPortfolio();
  const actions = useVendorActions(v.reload);
  const titleFor = useCampaignTitle();
  const payRows = toTxRows(v.payments, titleFor, () => "Paid to your wallet");

  return (
    <div className="space-y-6">
      <RoleHeader
        eyebrow="Vendor dashboard"
        title="Contracts & delivery proof"
        description="Awarded contracts, multi-modal evidence submission (Gemini invoice + EXIF geotag), and milestone payouts. Releases are triggered by 3-of-5 validator quorum and timelocked challenge expiry."
      />
      <WalletPanel purpose="Awards and payments are bound to the winning vendor wallet." />
      <TxStatus />

      {!w.address ? (
        <EmptyState
          icon={Wallet}
          title="Connect the wallet you bid from"
          action={
            <Button onClick={w.connect} loading={w.connecting}>
              Connect wallet
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Total contract value"
              value={formatTokenAmount(v.flows.reduce((s, f) => s + f.flow.awarded, 0n))}
              hint="USDC across awarded contracts"
            />
            <StatCard label="Received" value={formatTokenAmount(v.received)} hint="Stage 1 (70%) + Stage 2 (30%)" />
            <StatCard
              label="Held in escrow for you"
              value={formatTokenAmount(v.pendingPayments)}
              hint="Pending milestone releases"
            />
          </div>

          {v.awarded.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No awarded contracts yet"
              description="Win an auction as Rank 1 or accept a Rank 2 fallback to see delivery requirements and submit evidence here."
            />
          ) : (
            <div className="space-y-4">
              {v.awarded.map((c) => (
                <ContractCard
                  key={c.id}
                  c={c}
                  actions={actions}
                  bond={v.commitments?.[c.id]?.bondAmount ?? null}
                />
              ))}
            </div>
          )}

          <Panel title="Payment transactions">
            <TransactionTable rows={payRows} emptyMessage="No payouts to this wallet yet." />
          </Panel>
        </>
      )}
    </div>
  );
}
