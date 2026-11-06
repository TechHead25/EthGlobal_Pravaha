"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, FileJson } from "lucide-react";
import { toast } from "sonner";
import { campaignFormSchema } from "@/lib/validation/schemas";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel, UnsupportedFeature } from "@/components/dashboard/common";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { DAY } from "./shared";

type FormValues = { title: string; budgetUsdc: string; fundingDays: number; deliveryDays: number; metadataCid: string };

const CATEGORIES = ["Food security", "Shelter", "Water & sanitation", "Health & medical", "Education", "Disaster relief", "Livelihoods", "Other"];
const URGENCY = ["critical", "high", "medium", "low"];

/**
 * Two-step campaign creation:
 * 1) NGO-defined descriptor (category, urgency, region, description, documents) → metadata JSON
 *    to pin on IPFS (no pinning service is integrated in this build);
 * 2) createCampaign(budget, durations, metadataCid) signed by the NGO wallet.
 */
export function NgoNewCampaign({ organizationName }: { organizationName: string | null }) {
  const w = useWallet();
  const live = useEscrowLive();
  const router = useRouter();
  const [meta, setMeta] = React.useState({ category: CATEGORIES[0], urgency: "high", region: "", description: "", documents: "" });
  const [copied, setCopied] = React.useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(campaignFormSchema) as never,
    defaultValues: { title: "", budgetUsdc: "", fundingDays: 14, deliveryDays: 30, metadataCid: "" },
  });
  const title = form.watch("title");
  const metadataJson = JSON.stringify(
    {
      title: title || "",
      organization: organizationName ?? "",
      category: meta.category,
      urgency: meta.urgency,
      region: meta.region,
      description: meta.description,
      documents: meta.documents.split(/[\s,]+/).filter(Boolean),
      schema: "openaid.campaign.v1",
    },
    null,
    2
  );

  const onCreate = form.handleSubmit(async (v) => {
    const budget = ethers.parseUnits(v.budgetUsdc, 6);
    const rec = await w.runTx("Create campaign", ({ escrow }) =>
      escrow.createCampaign(budget, BigInt(Number(v.fundingDays) * DAY), BigInt(Number(v.deliveryDays) * DAY), v.metadataCid)
    );
    if (rec) {
      await live.refresh();
      form.reset();
      router.push("/app/ngo/campaigns");
    }
  });

  const e = form.formState.errors;
  return (
    <div className="space-y-6">
      <RoleHeader eyebrow="NGO dashboard" title="Create a campaign" description="You define the need, priority and budget. Once created, the budget ceiling and deadlines are enforced by the contract and cannot be edited." />
      <WalletPanel purpose="The creating wallet owns the campaign on-chain." />
      <TxStatus />
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Panel title="1 · Describe the campaign" description="Stored in IPFS metadata. Donors see this as NGO-declared information.">
            <div className="grid gap-4">
              <FormField id="title" label="Title" error={e.title?.message}>
                <Input {...form.register("title")} placeholder="Winter blankets for flood-affected families" />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField id="category" label="Category">
                  <Select value={meta.category} onChange={(ev) => setMeta({ ...meta, category: ev.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
                </FormField>
                <FormField id="urgency" label="Urgency (NGO-defined)">
                  <Select value={meta.urgency} onChange={(ev) => setMeta({ ...meta, urgency: ev.target.value })}>{URGENCY.map((u) => <option key={u} value={u} className="capitalize">{u}</option>)}</Select>
                </FormField>
                <FormField id="region" label="Location / region">
                  <Input value={meta.region} onChange={(ev) => setMeta({ ...meta, region: ev.target.value })} maxLength={120} />
                </FormField>
              </div>
              <FormField id="description" label="Objectives & specifications" hint="Quantities, quality standards, delivery location. Vendors bid against this.">
                <Textarea value={meta.description} onChange={(ev) => setMeta({ ...meta, description: ev.target.value })} maxLength={2000} className="min-h-[120px]" />
              </FormField>
              <FormField id="documents" label="Supporting document CIDs (optional)" hint="Space- or comma-separated IPFS CIDs of needs assessments, BOQs, etc.">
                <Input value={meta.documents} onChange={(ev) => setMeta({ ...meta, documents: ev.target.value })} className="font-mono" />
              </FormField>
            </div>
          </Panel>

          <Panel title="2 · Budget, timeline and on-chain creation">
            <form onSubmit={onCreate} className="grid gap-4" noValidate>
              <FormField id="budgetUsdc" label="Budget ceiling (USDC)" hint="Donations stop at this amount; the auction cannot award above it." error={e.budgetUsdc?.message}>
                <Input {...form.register("budgetUsdc")} inputMode="decimal" placeholder="10000" />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="fundingDays" label="Funding window (days)" error={e.fundingDays?.message}>
                  <Input type="number" min={1} max={365} {...form.register("fundingDays")} />
                </FormField>
                <FormField id="deliveryDays" label="Delivery window after funding (days)" error={e.deliveryDays?.message}>
                  <Input type="number" min={1} max={365} {...form.register("deliveryDays")} />
                </FormField>
              </div>
              <FormField id="metadataCid" label="Metadata IPFS CID" hint="Pin the JSON on the right with your IPFS provider, then paste its CID." error={e.metadataCid?.message}>
                <Input {...form.register("metadataCid")} className="font-mono" spellCheck={false} autoComplete="off" />
              </FormField>
              <ConfirmDialog
                disabled={!w.address || !w.isCorrectNetwork}
                trigger={<Button type="button" disabled={!w.address || !w.isCorrectNetwork} loading={w.tx.phase === "awaiting_signature" || w.tx.phase === "pending"}>Create campaign on-chain</Button>}
                title="Create this campaign?"
                description="Your wallet will call createCampaign. The budget ceiling, deadlines and metadata CID are permanent."
                confirmLabel="Open wallet"
                onConfirm={() => onCreate()}
              />
            </form>
          </Panel>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Panel title="Metadata file" description="openaid.campaign.v1 — pin this exact JSON." action={<FileJson className="h-4 w-4 text-muted-foreground" aria-hidden />}>
            <pre className="max-h-80 overflow-auto rounded-md bg-ink-950 p-3 font-mono text-xs text-white/80">{metadataJson}</pre>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() =>
                navigator.clipboard.writeText(metadataJson).then(
                  () => {
                    setCopied(true);
                    toast.success("Metadata copied");
                    setTimeout(() => setCopied(false), 2000);
                  },
                  () => toast.error("Copy failed")
                )
              }
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />} Copy JSON
            </Button>
          </Panel>
          <UnsupportedFeature compact title="Sub-campaign vaults">Item-level vaults and allocations arrive with V2.</UnsupportedFeature>
          <UnsupportedFeature compact title="Vendor shortlist">V1 auctions are open to any wallet; NGO-defined eligible vendor pools are V2.</UnsupportedFeature>
          <UnsupportedFeature compact title="Validator campaign approval">V1 campaigns go live on creation without a validator motion.</UnsupportedFeature>
        </div>
      </div>
    </div>
  );
}
