import { z } from "zod";
import { ADMIN_GRANTABLE_ROLES, REQUESTABLE_ROLES } from "../auth/roles";

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Strip characters that have no business in free text (control chars, bidi overrides). */
const safeText = (min: number, max: number) =>
  trimmed(min, max).refine((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/.test(s), {
    message: "Contains unsupported control characters",
  });

export const evmAddress = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a 0x-prefixed 20-byte address");

export const cuidLike = z.string().trim().min(8).max(64).regex(/^[a-z0-9]+$/i, "Invalid id");

export const roleRequestSchema = z
  .object({
    role: z.enum(REQUESTABLE_ROLES),
    justification: safeText(20, 1000),
    walletAddress: evmAddress.optional().or(z.literal("").transform(() => undefined)),
    organizationId: cuidLike.optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();
export type RoleRequestInput = z.infer<typeof roleRequestSchema>;

export const reviewDecisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    note: safeText(0, 500).optional(),
  })
  .strict();

export const adminRoleChangeSchema = z
  .object({
    action: z.enum(["GRANT", "REVOKE"]),
    role: z.enum(ADMIN_GRANTABLE_ROLES as unknown as [string, ...string[]]),
    reason: safeText(5, 500),
  })
  .strict();

export const adminStatusChangeSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]),
    reason: safeText(5, 500),
  })
  .strict();

export const organizationSchema = z
  .object({
    kind: z.enum(["NGO", "VENDOR"]),
    name: safeText(2, 120),
    country: safeText(2, 80),
    description: safeText(20, 2000),
    website: z
      .string()
      .trim()
      .max(200)
      .url()
      .refine((u) => /^https:\/\//i.test(u), "Website must use https://")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    registrationNumber: safeText(2, 80).optional().or(z.literal("").transform(() => undefined)),
  })
  .strict();
export type OrganizationInput = z.infer<typeof organizationSchema>;

export const worldIdProofSchema = z
  .object({
    merkle_root: z.string().trim().min(3).max(80),
    nullifier_hash: z.string().trim().min(3).max(80),
    proof: z.string().trim().min(3).max(2000),
    verification_level: z.enum(["orb", "device"]).optional(),
  })
  .strict();

/** Client-side form for creating an on-chain campaign (amount is a decimal USDC string). */
export const campaignFormSchema = z.object({
  title: safeText(4, 120),
  budgetUsdc: z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,6})?$/, "Enter a USDC amount with up to 6 decimals")
    .refine((v) => Number(v) > 0, "Budget must be greater than zero"),
  fundingDays: z.coerce.number().int().min(1).max(365),
  deliveryDays: z.coerce.number().int().min(1).max(365),
  metadataCid: z
    .string()
    .trim()
    .min(10, "Provide the IPFS CID of the campaign metadata")
    .max(120)
    .regex(/^[a-zA-Z0-9]+$/, "CID must be alphanumeric (CIDv0/CIDv1)"),
});
export type CampaignFormInput = z.infer<typeof campaignFormSchema>;
