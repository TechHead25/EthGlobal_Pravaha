"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { organizationSchema, type OrganizationInput } from "@/lib/validation/schemas";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select, Textarea } from "@/components/ui/input";

export function OrganizationForm() {
  const router = useRouter();
  const form = useForm<OrganizationInput>({
    resolver: zodResolver(organizationSchema),
    defaultValues: { kind: "NGO", name: "", country: "", description: "", website: "", registrationNumber: "" },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await apiFetch("/api/organizations", { method: "POST", body: values });
    if (!res.ok) {
      res.issues?.forEach((i) => form.setError(i.path as keyof OrganizationInput, { message: i.message }));
      toast.error("Organization not submitted", { description: res.message });
      return;
    }
    toast.success("Organization submitted for verification");
    form.reset();
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="kind" label="Type" error={e.kind?.message}>
          <Select {...form.register("kind")}>
            <option value="NGO">NGO / campaign creator</option>
            <option value="VENDOR">Vendor / supplier</option>
          </Select>
        </FormField>
        <FormField id="country" label="Country of registration" error={e.country?.message}>
          <Input {...form.register("country")} autoComplete="country-name" />
        </FormField>
      </div>
      <FormField id="name" label="Legal name" error={e.name?.message}>
        <Input {...form.register("name")} autoComplete="organization" />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="website" label="Website (https)" error={e.website?.message}>
          <Input {...form.register("website")} type="url" placeholder="https://" />
        </FormField>
        <FormField id="registrationNumber" label="Registration no. (optional)" error={e.registrationNumber?.message}>
          <Input {...form.register("registrationNumber")} />
        </FormField>
      </div>
      <FormField id="description" label="Description" hint="Mission, operating regions, and references a reviewer can check." error={e.description?.message}>
        <Textarea {...form.register("description")} maxLength={2000} />
      </FormField>
      <p className="text-xs text-muted-foreground">Do not upload or paste personal identity documents here. A reviewer will contact you if more evidence is needed.</p>
      <Button type="submit" variant="outline" loading={form.formState.isSubmitting}>
        Submit organization
      </Button>
    </form>
  );
}
