"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { roleRequestSchema, type RoleRequestInput } from "@/lib/validation/schemas";
import { ORGANIZATION_ROLE_KIND, REQUESTABLE_ROLES, ROLE_LABELS, SELF_SERVICE_ROLES, type Role } from "@/lib/auth/roles";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/primitives";

interface OrgOption {
  id: string;
  name: string;
  kind: "NGO" | "VENDOR";
  status: string;
}

export function RoleRequestForm({ heldRoles, pendingRoles, organizations }: { heldRoles: Role[]; pendingRoles: Role[]; organizations: OrgOption[] }) {
  const router = useRouter();
  const available = REQUESTABLE_ROLES.filter((r) => !heldRoles.includes(r) && !pendingRoles.includes(r));
  const form = useForm<RoleRequestInput>({
    resolver: zodResolver(roleRequestSchema),
    defaultValues: { role: available[0] ?? "DONOR", justification: "", walletAddress: "", organizationId: "" },
  });
  const role = form.watch("role");
  const orgKind = ORGANIZATION_ROLE_KIND[role];
  const orgOptions = organizations.filter((o) => o.kind === orgKind);

  if (available.length === 0) {
    return <Notice tone="success">You hold or have requested every available role.</Notice>;
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await apiFetch("/api/role-requests", { method: "POST", body: values });
    if (!res.ok) {
      res.issues?.forEach((i) => form.setError(i.path as keyof RoleRequestInput, { message: i.message }));
      toast.error("Request not submitted", { description: res.message });
      return;
    }
    toast.success(SELF_SERVICE_ROLES.includes(role) ? `${ROLE_LABELS[role]} role activated` : "Request submitted for review");
    form.reset({ role: available.find((r) => r !== role) ?? role, justification: "", walletAddress: "", organizationId: "" });
    router.refresh();
  });

  const e = form.formState.errors;
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="role" label="Role" error={e.role?.message}>
        <Select {...form.register("role")}>
          {available.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
              {SELF_SERVICE_ROLES.includes(r) ? " — instant" : " — reviewed"}
            </option>
          ))}
        </Select>
      </FormField>

      {orgKind ? (
        orgOptions.length === 0 ? (
          <Notice tone="warning">Register a {orgKind} organization first (form on the right). It can be reviewed together with this request.</Notice>
        ) : (
          <FormField id="organizationId" label={`${orgKind} organization`} error={e.organizationId?.message}>
            <Select {...form.register("organizationId")}>
              <option value="">Select…</option>
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.status === "VERIFIED" ? "verified" : "pending verification"})
                </option>
              ))}
            </Select>
          </FormField>
        )
      ) : null}

      <FormField id="justification" label="Why do you need this role?" hint="At least 20 characters. Reviewers see this text." error={e.justification?.message}>
        <Textarea {...form.register("justification")} maxLength={1000} />
      </FormField>

      <FormField
        id="walletAddress"
        label="Wallet address (optional)"
        hint={role === "VALIDATOR" ? "Validators: the address registered in the on-chain validator set." : "Informational only — on-chain permissions are decided by the contract."}
        error={e.walletAddress?.message}
      >
        <Input {...form.register("walletAddress")} placeholder="0x…" autoComplete="off" spellCheck={false} className="font-mono" />
      </FormField>

      <Button type="submit" loading={form.formState.isSubmitting} disabled={Boolean(orgKind && orgOptions.length === 0)}>
        {SELF_SERVICE_ROLES.includes(role) ? "Activate role" : "Submit for review"}
      </Button>
    </form>
  );
}
