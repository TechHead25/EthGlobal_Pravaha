/**
 * OpenAid application roles & permission matrix.
 *
 * SECURITY MODEL
 * - Application roles are stored server-side (database) and are NEVER read from client
 *   input, cookies, JWT claims, or browser storage.
 * - Every Google sign-in starts with only USER. All elevation happens through the audited
 *   role-request / admin-review flow, or (for ADMIN only) the operator CLI.
 * - Application roles gate *UI and off-chain workflows only*. On-chain permissions
 *   (validator set, winning vendor, donor deposits) are enforced by OpenAidEscrow and
 *   remain authoritative. No role here can move escrowed funds.
 * - ADMIN is a governance role, not a super-user: it does not inherit donor/NGO/vendor/
 *   validator operational permissions (separation of duties).
 *
 * This module is framework-free so it can be unit tested without Next.js.
 */

export const ROLES = ["USER", "DONOR", "NGO", "VENDOR", "VALIDATOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  USER: "Member",
  DONOR: "Donor / Funder",
  NGO: "NGO",
  VENDOR: "Vendor",
  VALIDATOR: "Validator",
  ADMIN: "Administrator",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  USER: "Default signed-in account. Browse campaigns and request a workspace role.",
  DONOR: "Fund campaigns from your own wallet, track allocations, and claim eligible refunds.",
  NGO: "Create and manage campaigns for a verified organization.",
  VENDOR: "Bid in procurement auctions and submit delivery evidence for a verified supplier.",
  VALIDATOR: "Review delivery evidence and cast quorum votes. Requires authorized assignment and World ID.",
  ADMIN: "Review role and organization requests, manage access, and monitor platform health.",
};

export const PERMISSIONS = [
  "dashboard:view",
  "role:request",
  "organization:manage_own",
  "donor:view",
  "donor:refund",
  "ngo:view",
  "ngo:campaign_create",
  "vendor:view",
  "vendor:bid",
  "vendor:evidence_submit",
  "validator:view",
  "validator:vote",
  "validator:worldid_verify",
  "admin:view",
  "admin:review_requests",
  "admin:manage_roles",
  "admin:suspend_users",
  "admin:verify_organizations",
  "admin:view_audit",
  "admin:view_health",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const BASE: Permission[] = ["dashboard:view", "role:request", "organization:manage_own"];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  USER: BASE,
  DONOR: [...BASE, "donor:view", "donor:refund"],
  NGO: [...BASE, "ngo:view", "ngo:campaign_create"],
  VENDOR: [...BASE, "vendor:view", "vendor:bid", "vendor:evidence_submit"],
  VALIDATOR: [...BASE, "validator:view", "validator:vote", "validator:worldid_verify"],
  ADMIN: [
    ...BASE,
    "admin:view",
    "admin:review_requests",
    "admin:manage_roles",
    "admin:suspend_users",
    "admin:verify_organizations",
    "admin:view_audit",
    "admin:view_health",
  ],
};

/** Roles a user may ask for through the in-app request flow. ADMIN is never requestable. */
export const REQUESTABLE_ROLES = ["DONOR", "NGO", "VENDOR", "VALIDATOR"] as const satisfies readonly Role[];
export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

/** Requestable roles that are granted immediately (low risk: donating is permissionless on-chain). */
export const SELF_SERVICE_ROLES: readonly Role[] = ["DONOR"];

/** Roles that require a VERIFIED organization of the matching kind before approval. */
export const ORGANIZATION_ROLE_KIND: Partial<Record<Role, "NGO" | "VENDOR">> = {
  NGO: "NGO",
  VENDOR: "VENDOR",
};

/** Roles an administrator may grant/revoke through the API. ADMIN/USER are excluded. */
export const ADMIN_GRANTABLE_ROLES: readonly Role[] = ["DONOR", "NGO", "VENDOR", "VALIDATOR"];

export type AccountStatus = "ACTIVE" | "SUSPENDED";

/** Server-resolved identity. Constructed only from the database, never from request input. */
export interface Principal {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  status: AccountStatus;
  roles: Role[];
  worldIdVerifiedAt: Date | null;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Normalizes stored roles: drops unknown values, always includes USER, de-duplicates. */
export function normalizeRoles(stored: readonly string[]): Role[] {
  const set = new Set<Role>(["USER"]);
  for (const r of stored) if (isRole(r)) set.add(r);
  return ROLES.filter((r) => set.has(r));
}

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) out.add(p);
  return out;
}

/** The single authorization predicate. Suspended accounts have no permissions at all. */
export function can(principal: Pick<Principal, "roles" | "status"> | null | undefined, permission: Permission): boolean {
  if (!principal || principal.status !== "ACTIVE") return false;
  return permissionsFor(principal.roles).has(permission);
}

export function hasRole(principal: Pick<Principal, "roles" | "status"> | null | undefined, role: Role): boolean {
  if (!principal || principal.status !== "ACTIVE") return false;
  return principal.roles.includes(role);
}

/** Workspace routes and the permission that gates each one. */
export const WORKSPACES = [
  { href: "/app/dashboard", label: "Overview", permission: "dashboard:view" },
  { href: "/app/donor", label: "Donor", permission: "donor:view" },
  { href: "/app/ngo", label: "NGO", permission: "ngo:view" },
  { href: "/app/vendor", label: "Vendor", permission: "vendor:view" },
  { href: "/app/validator", label: "Validator", permission: "validator:view" },
  { href: "/app/admin", label: "Admin", permission: "admin:view" },
] as const satisfies readonly { href: string; label: string; permission: Permission }[];

/** Longest-prefix match of an /app path to the permission that guards it. */
export function permissionForAppPath(pathname: string): Permission | null {
  if (!pathname.startsWith("/app")) return null;
  const match = [...WORKSPACES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((w) => pathname === w.href || pathname.startsWith(`${w.href}/`));
  return match ? match.permission : "dashboard:view";
}
