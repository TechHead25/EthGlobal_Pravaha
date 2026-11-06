"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, FileJson, Layers, Plus, Trash2, ShieldCheck, Info } from "lucide-react";
import { toast } from "sonner";
import { campaignFormSchema } from "@/lib/validation/schemas";
import { useEscrowLive } from "@/components/live/escrow-live";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, WalletPanel } from "@/components/wallet/wallet-panel";
import { RoleHeader } from "@/components/dashboard/role-header";
import { Panel } from "@/components/dashboard/common";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { DAY } from "./shared";

type FormValues = { title: string; budgetUsdc: string; fundingDays: number; deliveryDays: number; metadataCid: string };

const CATEGORIES = [
  "Food security",
  "Shelter",
  "Water & sanitation",
  "Health & medical",
  "Education & stationery",
  "Clothing & winter relief",
  "Disaster logistics",
  "Other",
];
const URGENCY = ["critical", "high", "medium", "low"];

export interface SubVaultItem {
  id: string;
  category: string;
  name: string;
  budgetUsdc: string;
  targetQuantity: string;
  unit: string;
  specifications: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  "Food security": "bg-amber-500",
  "Shelter": "bg-indigo-500",
  "Water & sanitation": "bg-cyan-500",
  "Health & medical": "bg-emerald-500",
  "Education & stationery": "bg-blue-500",
  "Clothing & winter relief": "bg-purple-500",
  "Disaster logistics": "bg-rose-500",
  "Other": "bg-slate-500",
};

/**
 * OpenAid V2 Multi-Sub-Vault Campaign Creator:
 * 1) Define root campaign scope (region, urgency, description).
 * 2) Split budget into independent category sub-vaults (Food, Clothes, Stationery, Medical)
 *    with real-time allocation percentage visualization.
 * 3) Export openaid.campaign.v2 metadata JSON and broadcast createCampaign on Arc Testnet.
 */
export function NgoNewCampaign({ organizationName }: { organizationName: string | null }) {
  const w = useWallet();
  const live = useEscrowLive();
  const router = useRouter();

  const [meta, setMeta] = React.useState({
    category: CATEGORIES[0],
    urgency: "high",
    region: "",
    description: "",
    documents: "",
  });

  const [subVaults, setSubVaults] = React.useState<SubVaultItem[]>([
    {
      id: "sv-1",
      category: "Food security",
      name: "Emergency Grain & Rations",
      budgetUsdc: "5000",
      targetQuantity: "1000",
      unit: "Ration Packs",
      specifications: "Fortified flour, pulses, cooking oil, vacuum-sealed packaging.",
    },
    {
      id: "sv-2",
      category: "Clothing & winter relief",
      name: "Thermal Blankets & Apparel",
      budgetUsdc: "3000",
      targetQuantity: "500",
      unit: "Blankets",
      specifications: "100% virgin wool, high thermal rating (>2.5 TOG), weather-resistant.",
    },
    {
      id: "sv-3",
      category: "Education & stationery",
      name: "School Student Supplies",
      budgetUsdc: "2000",
      targetQuantity: "250",
      unit: "Kits",
      specifications: "Notebooks, waterproof backpacks, geometry sets, pens.",
    },
  ]);

  const [copied, setCopied] = React.useState(false);

  // Calculate total budget from sub-vaults
  const totalSubVaultBudget = React.useMemo(() => {
    return subVaults.reduce((sum, item) => {
      const val = parseFloat(item.budgetUsdc) || 0;
      return sum + val;
    }, 0);
  }, [subVaults]);

  const form = useForm<FormValues>({
    resolver: zodResolver(campaignFormSchema) as never,
    defaultValues: {
      title: "",
      budgetUsdc: totalSubVaultBudget > 0 ? String(totalSubVaultBudget) : "",
      fundingDays: 14,
      deliveryDays: 30,
      metadataCid: "",
    },
  });

  // Sync total budget with form when sub-vaults change
  React.useEffect(() => {
    if (totalSubVaultBudget > 0) {
      form.setValue("budgetUsdc", String(totalSubVaultBudget), { shouldValidate: true });
    }
  }, [totalSubVaultBudget, form]);

  const title = form.watch("title");

  const metadataJson = JSON.stringify(
    {
      schema: "openaid.campaign.v2",
      title: title || "",
      organization: organizationName ?? "",
      category: meta.category,
      urgency: meta.urgency,
      region: meta.region,
      description: meta.description,
      totalBudgetUsdc: totalSubVaultBudget,
      subVaults: subVaults.map((sv, idx) => ({
        subVaultId: idx + 1,
        category: sv.category,
        name: sv.name,
        budgetUsdc: parseFloat(sv.budgetUsdc) || 0,
        targetQuantity: parseFloat(sv.targetQuantity) || 0,
        unit: sv.unit,
        specifications: sv.specifications,
      })),
      documents: meta.documents.split(/[\s,]+/).filter(Boolean),
    },
    null,
    2
  );

  const addSubVault = () => {
    const nextId = `sv-${subVaults.length + 1}`;
    setSubVaults([
      ...subVaults,
      {
        id: nextId,
        category: CATEGORIES[subVaults.length % CATEGORIES.length],
        name: `Sub-Vault Category #${subVaults.length + 1}`,
        budgetUsdc: "1000",
        targetQuantity: "100",
        unit: "Units",
        specifications: "",
      },
    ]);
  };

  const removeSubVault = (id: string) => {
    if (subVaults.length <= 1) {
      toast.error("At least one sub-vault category is required.");
      return;
    }
    setSubVaults(subVaults.filter((s) => s.id !== id));
  };

  const updateSubVault = (id: string, field: keyof SubVaultItem, val: string) => {
    setSubVaults(subVaults.map((s) => (s.id === id ? { ...s, [field]: val } : s)));
  };

  const onCreate = form.handleSubmit(async (v) => {
    const budget = ethers.parseUnits(v.budgetUsdc, 6);
    const rec = await w.runTx("Create multi-vault campaign", ({ escrow }) =>
      escrow.createCampaign(
        budget,
        BigInt(Number(v.fundingDays) * DAY),
        BigInt(Number(v.deliveryDays) * DAY),
        v.metadataCid
      )
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
      <RoleHeader
        eyebrow="NGO dashboard"
        title="Create a campaign with category sub-vaults"
        description="Configure isolated category sub-vaults (Food, Clothes, Stationery, Medical). Each sub-vault runs independent procurement and staged settlements."
      />
      <WalletPanel purpose="The creating wallet owns the campaign on-chain and administers sub-vault categories." />
      <TxStatus />

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          {/* STEP 1: CAMPAIGN DESCRIPTOR */}
          <Panel
            title="1 · Describe the campaign"
            description="Stored in IPFS & Arkiv metadata. Donors see this as NGO-declared information."
          >
            <div className="grid gap-4">
              <FormField id="title" label="Campaign title" error={e.title?.message}>
                <Input
                  {...form.register("title")}
                  placeholder="Flood Relief 2026: Multi-Need Community Rehabilitation"
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField id="category" label="Primary sector">
                  <Select
                    value={meta.category}
                    onChange={(ev) => setMeta({ ...meta, category: ev.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField id="urgency" label="Urgency level">
                  <Select
                    value={meta.urgency}
                    onChange={(ev) => setMeta({ ...meta, urgency: ev.target.value })}
                  >
                    {URGENCY.map((u) => (
                      <option key={u} value={u} className="capitalize">
                        {u}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField id="region" label="Disaster relief region">
                  <Input
                    value={meta.region}
                    placeholder="e.g. Sindh Basin, Dist. Badin"
                    onChange={(ev) => setMeta({ ...meta, region: ev.target.value })}
                    maxLength={120}
                  />
                </FormField>
              </div>

              <FormField
                id="description"
                label="Overall relief objectives"
                hint="High-level mission context for donors and auditors."
              >
                <Textarea
                  value={meta.description}
                  placeholder="Providing immediate survival rations, winterized blankets, and schooling supplies for displaced families..."
                  onChange={(ev) => setMeta({ ...meta, description: ev.target.value })}
                  maxLength={2000}
                  className="min-h-[100px]"
                />
              </FormField>

              <FormField
                id="documents"
                label="Supporting document CIDs (optional)"
                hint="Space- or comma-separated IPFS CIDs of government assessments, BOQs, or needs surveys."
              >
                <Input
                  value={meta.documents}
                  placeholder="bafybeig... needs_assessment.pdf"
                  onChange={(ev) => setMeta({ ...meta, documents: ev.target.value })}
                  className="font-mono text-xs"
                />
              </FormField>
            </div>
          </Panel>

          {/* STEP 2: CATEGORY SUB-VAULTS */}
          <Panel
            title="2 · Configure category sub-vaults"
            description="Each sub-vault is an independent escrow ledger. Failure or dispute in one category never freezes or drains another."
            action={
              <Button size="sm" variant="outline" onClick={addSubVault}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add sub-vault
              </Button>
            }
          >
            <div className="space-y-4">
              {/* ALLOCATION BREAKDOWN VISUALIZER */}
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                    <Layers className="h-4 w-4 text-primary" aria-hidden /> Sub-Vault Allocation Breakdown
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    Total: {totalSubVaultBudget.toLocaleString()} USDC
                  </span>
                </div>

                {/* Progress bar split */}
                <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {subVaults.map((sv, idx) => {
                    const amount = parseFloat(sv.budgetUsdc) || 0;
                    const pct = totalSubVaultBudget > 0 ? (amount / totalSubVaultBudget) * 100 : 0;
                    const color = CATEGORY_COLORS[sv.category] || "bg-primary";
                    return (
                      <div
                        key={sv.id}
                        className={`${color} transition-all duration-300 hover:opacity-90`}
                        style={{ width: `${pct}%` }}
                        title={`${sv.name} (${sv.category}): ${amount} USDC (${pct.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>

                {/* Badges legend */}
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  {subVaults.map((sv) => {
                    const amount = parseFloat(sv.budgetUsdc) || 0;
                    const pct = totalSubVaultBudget > 0 ? (amount / totalSubVaultBudget) * 100 : 0;
                    const colorDot = CATEGORY_COLORS[sv.category] || "bg-primary";
                    return (
                      <div
                        key={sv.id}
                        className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1"
                      >
                        <span className={`h-2 w-2 rounded-full ${colorDot}`} />
                        <span className="font-medium text-foreground">{sv.name}</span>
                        <span className="text-muted-foreground font-mono">
                          {amount.toLocaleString()} USDC ({pct.toFixed(0)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SUB-VAULT ROWS */}
              <div className="space-y-3">
                {subVaults.map((sv, idx) => (
                  <div
                    key={sv.id}
                    className="group relative rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center justify-between border-b pb-2 text-xs font-semibold">
                      <span className="flex items-center gap-2 text-foreground">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary font-mono text-[11px]">
                          {idx + 1}
                        </span>
                        {sv.category}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeSubVault(sv.id)}
                        disabled={subVaults.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        <span className="sr-only">Remove sub-vault</span>
                      </Button>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <FormField id={`name-${sv.id}`} label="Sub-vault name">
                        <Input
                          value={sv.name}
                          placeholder="e.g. Grain Rations"
                          onChange={(e) => updateSubVault(sv.id, "name", e.target.value)}
                        />
                      </FormField>

                      <FormField id={`category-${sv.id}`} label="Category">
                        <Select
                          value={sv.category}
                          onChange={(e) => updateSubVault(sv.id, "category", e.target.value)}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      </FormField>

                      <FormField id={`budget-${sv.id}`} label="Budget ceiling (USDC)">
                        <Input
                          type="number"
                          min="1"
                          value={sv.budgetUsdc}
                          placeholder="5000"
                          onChange={(e) => updateSubVault(sv.id, "budgetUsdc", e.target.value)}
                        />
                      </FormField>

                      <FormField id={`qty-${sv.id}`} label="Quantity & unit">
                        <div className="flex gap-1.5">
                          <Input
                            type="number"
                            min="1"
                            value={sv.targetQuantity}
                            placeholder="500"
                            className="w-1/2"
                            onChange={(e) => updateSubVault(sv.id, "targetQuantity", e.target.value)}
                          />
                          <Input
                            value={sv.unit}
                            placeholder="Packs"
                            className="w-1/2"
                            onChange={(e) => updateSubVault(sv.id, "unit", e.target.value)}
                          />
                        </div>
                      </FormField>
                    </div>

                    <div className="mt-3">
                      <FormField
                        id={`spec-${sv.id}`}
                        label="Procurement specifications & quality requirements"
                        hint="Gemini AI compares vendor delivery manifests against these exact line items."
                      >
                        <Input
                          value={sv.specifications}
                          placeholder="e.g. 50kg bags, Grade A wheat, ISO 22000 certified packing."
                          onChange={(e) => updateSubVault(sv.id, "specifications", e.target.value)}
                        />
                      </FormField>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* STEP 3: ON-CHAIN CREATION */}
          <Panel title="3 · Campaign timeline & on-chain deployment">
            <form onSubmit={onCreate} className="grid gap-4" noValidate>
              <FormField
                id="budgetUsdc"
                label="Total campaign budget ceiling (USDC)"
                hint="Sum of all category sub-vaults above. Escrow contract strictly caps donor funding at this ceiling."
                error={e.budgetUsdc?.message}
              >
                <Input
                  {...form.register("budgetUsdc")}
                  inputMode="decimal"
                  placeholder="10000"
                  readOnly
                  className="bg-muted/50 font-mono font-bold"
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="fundingDays" label="Funding window (days)" error={e.fundingDays?.message}>
                  <Input type="number" min={1} max={365} {...form.register("fundingDays")} />
                </FormField>
                <FormField
                  id="deliveryDays"
                  label="Delivery window after funding (days)"
                  error={e.deliveryDays?.message}
                >
                  <Input type="number" min={1} max={365} {...form.register("deliveryDays")} />
                </FormField>
              </div>

              <FormField
                id="metadataCid"
                label="Metadata IPFS CID"
                hint="Pin the generated openaid.campaign.v2 JSON (shown right), then paste its CID here."
                error={e.metadataCid?.message}
              >
                <Input
                  {...form.register("metadataCid")}
                  className="font-mono text-xs"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
                />
              </FormField>

              <ConfirmDialog
                disabled={!w.address || !w.isCorrectNetwork || totalSubVaultBudget <= 0}
                trigger={
                  <Button
                    type="button"
                    disabled={!w.address || !w.isCorrectNetwork || totalSubVaultBudget <= 0}
                    loading={w.tx.phase === "awaiting_signature" || w.tx.phase === "pending"}
                    className="w-full sm:w-auto"
                  >
                    Deploy multi-vault campaign on Arc
                  </Button>
                }
                title="Create this multi-vault campaign on-chain?"
                description={`Your wallet will call createCampaign with a budget ceiling of ${totalSubVaultBudget.toLocaleString()} USDC across ${subVaults.length} independent sub-vaults.`}
                confirmLabel="Confirm in wallet"
                onConfirm={() => onCreate()}
              />
            </form>
          </Panel>
        </div>

        {/* SIDEBAR: JSON PREVIEW & PROTOCOL GUARDS */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Panel
            title="Metadata descriptor"
            description="openaid.campaign.v2 — multi-vault schema with category specifications."
            action={<FileJson className="h-4 w-4 text-muted-foreground" aria-hidden />}
          >
            <pre className="max-h-96 overflow-auto rounded-md bg-ink-950 p-3 font-mono text-xs text-white/80">
              {metadataJson}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 w-full"
              onClick={() =>
                navigator.clipboard.writeText(metadataJson).then(
                  () => {
                    setCopied(true);
                    toast.success("V2 Metadata JSON copied");
                    setTimeout(() => setCopied(false), 2000);
                  },
                  () => toast.error("Copy failed")
                )
              }
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />} Copy V2 JSON
            </Button>
          </Panel>

          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              <span>V2 Protocol Invariants</span>
            </div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
                <span><strong>Zero Custody:</strong> NGO never receives deposits. Capital locks into Arc Escrow.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
                <span><strong>Non-Interference:</strong> A failure in Clothing will never freeze or drain Food funds.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-info" />
                <span><strong>Backup Failover:</strong> 2nd-best vendor can be awarded if Rank 1 defaults (&le;15% spread cap).</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
