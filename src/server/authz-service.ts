/**
 * Authorization & governance service. Every function:
 *   1. requires a server-resolved Principal (never request-supplied identity/roles),
 *   2. checks a specific permission,
 *   3. validates input with zod,
 *   4. checks resource ownership / state,
 *   5. writes an audit event for every privilege-relevant change.
 *
 * Framework-free (no Next.js imports) so it is directly unit-testable.
 */
import { ZodError, type ZodTypeAny, type z } from "zod";
import {
  ADMIN_GRANTABLE_ROLES,
  ORGANIZATION_ROLE_KIND,
  SELF_SERVICE_ROLES,
  can,
  type Permission,
  type Principal,
  type Role,
} from "../lib/auth/roles";
import {
  adminRoleChangeSchema,
  adminStatusChangeSchema,
  cuidLike,
  organizationSchema,
  reviewDecisionSchema,
  roleRequestSchema,
} from "../lib/validation/schemas";
import type { AuthzStore, OrganizationRecord, RoleRequestRecord, UserWithRoles } from "./store/types";

export type ServiceResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string; issues?: { path: string; message: string }[] };

const ok = <T>(data: T, status = 200): ServiceResult<T> => ({ ok: true, status, data });
const fail = (status: number, code: string, message: string): ServiceResult<never> => ({ ok: false, status, code, message });

export const UNAUTHENTICATED = fail(401, "UNAUTHENTICATED", "Sign in to continue.");
export const FORBIDDEN = fail(403, "FORBIDDEN", "You do not have permission to perform this action.");

const MAX_ORGS_PER_USER = 5;

function gate(principal: Principal | null, permission: Permission): ServiceResult<never> | null {
  if (!principal) return UNAUTHENTICATED;
  if (principal.status !== "ACTIVE") return fail(403, "ACCOUNT_SUSPENDED", "This account is suspended.");
  if (!can(principal, permission)) return FORBIDDEN;
  return null;
}

function parse<S extends ZodTypeAny>(schema: S, input: unknown): { data: z.infer<S> } | { error: ServiceResult<never> } {
  try {
    return { data: schema.parse(input) };
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        error: {
          ok: false,
          status: 400,
          code: "INVALID_INPUT",
          message: "The request contains invalid fields.",
          issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      };
    }
    throw e;
  }
}

function parseId(id: unknown): string | null {
  const r = cuidLike.safeParse(id);
  return r.success ? r.data : null;
}

/* ------------------------------------------------------------------------------------------------
 * Self-service: identity & role requests
 * ---------------------------------------------------------------------------------------------- */

export async function getMyAccess(store: AuthzStore, principal: Principal | null) {
  const denied = gate(principal, "dashboard:view");
  if (denied) return denied;
  const [requests, organizations] = await Promise.all([
    store.listRoleRequests({ userId: principal!.id, limit: 50 }),
    store.listOrganizations({ ownerId: principal!.id, limit: 20 }),
  ]);
  return ok({
    user: { id: principal!.id, email: principal!.email, name: principal!.name, roles: principal!.roles, worldIdVerified: Boolean(principal!.worldIdVerifiedAt) },
    requests,
    organizations,
  });
}

export async function requestRole(store: AuthzStore, principal: Principal | null, raw: unknown): Promise<ServiceResult<RoleRequestRecord>> {
  const denied = gate(principal, "role:request");
  if (denied) return denied;
  const parsed = parse(roleRequestSchema, raw);
  if ("error" in parsed) return parsed.error;
  const input = parsed.data;
  const p = principal!;
  const role = input.role as Role;

  if (p.roles.includes(role)) return fail(409, "ALREADY_HAS_ROLE", "You already hold this role.");
  if (await store.findPendingRoleRequest(p.id, role)) {
    return fail(409, "REQUEST_PENDING", "You already have a pending request for this role.");
  }

  const orgKind = ORGANIZATION_ROLE_KIND[role];
  let organizationId: string | null = null;
  if (orgKind) {
    if (!input.organizationId) {
      return fail(400, "ORGANIZATION_REQUIRED", `A ${orgKind} organization profile is required for this role.`);
    }
    const org = await store.getOrganization(input.organizationId);
    // Not-found and not-owned are indistinguishable to avoid leaking other users' records.
    if (!org || org.ownerId !== p.id) return fail(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
    if (org.kind !== orgKind) return fail(400, "ORGANIZATION_KIND_MISMATCH", `This role requires a ${orgKind} organization.`);
    if (org.status === "REJECTED") return fail(409, "ORGANIZATION_REJECTED", "This organization was not verified.");
    organizationId = org.id;
  }

  const request = await store.createRoleRequest({
    userId: p.id,
    role,
    justification: input.justification,
    walletAddress: input.walletAddress ?? null,
    organizationId,
  });
  await store.recordAudit({ actorId: p.id, action: "role.requested", targetType: "RoleRequest", targetId: request.id, metadata: { role } });

  // Self-service applies only if an administrator has never revoked this role from the user;
  // otherwise the request waits for human review.
  const previouslyRevoked = SELF_SERVICE_ROLES.includes(role)
    ? (await store.listAudit({ targetId: p.id, limit: 200 })).some((e) => e.action === "role.revoked" && e.metadata?.role === role)
    : false;

  if (SELF_SERVICE_ROLES.includes(role) && !previouslyRevoked) {
    const decided = await store.decideRoleRequest({ id: request.id, status: "APPROVED", reviewerId: null, note: "Self-service policy" });
    await store.grantRole({ userId: p.id, role, grantedById: null, reason: "Self-service policy" });
    await store.recordAudit({ actorId: p.id, action: "role.granted", targetType: "User", targetId: p.id, metadata: { role, via: "self_service_policy", requestId: request.id } });
    return ok(decided ?? request, 201);
  }
  return ok(request, 201);
}

export async function withdrawRoleRequest(store: AuthzStore, principal: Principal | null, rawId: unknown) {
  const denied = gate(principal, "role:request");
  if (denied) return denied;
  const id = parseId(rawId);
  if (!id) return fail(400, "INVALID_INPUT", "Invalid request id.");
  const req = await store.getRoleRequest(id);
  if (!req || req.userId !== principal!.id) return fail(404, "NOT_FOUND", "Request not found.");
  const decided = await store.decideRoleRequest({ id, status: "WITHDRAWN", reviewerId: principal!.id, note: null });
  if (!decided) return fail(409, "NOT_PENDING", "This request is no longer pending.");
  await store.recordAudit({ actorId: principal!.id, action: "role.request_withdrawn", targetType: "RoleRequest", targetId: id });
  return ok(decided);
}

/* ------------------------------------------------------------------------------------------------
 * Organizations
 * ---------------------------------------------------------------------------------------------- */

export async function createOrganization(store: AuthzStore, principal: Principal | null, raw: unknown): Promise<ServiceResult<OrganizationRecord>> {
  const denied = gate(principal, "organization:manage_own");
  if (denied) return denied;
  const parsed = parse(organizationSchema, raw);
  if ("error" in parsed) return parsed.error;
  const existing = await store.listOrganizations({ ownerId: principal!.id, limit: MAX_ORGS_PER_USER + 1 });
  if (existing.length >= MAX_ORGS_PER_USER) return fail(409, "LIMIT_REACHED", "Organization limit reached for this account.");
  const org = await store.createOrganization({
    ownerId: principal!.id,
    kind: parsed.data.kind,
    name: parsed.data.name,
    country: parsed.data.country,
    description: parsed.data.description,
    website: parsed.data.website ?? null,
    registrationNumber: parsed.data.registrationNumber ?? null,
  });
  await store.recordAudit({ actorId: principal!.id, action: "organization.submitted", targetType: "Organization", targetId: org.id, metadata: { kind: org.kind } });
  return ok(org, 201);
}

export async function getOrganizationForPrincipal(store: AuthzStore, principal: Principal | null, rawId: unknown) {
  if (!principal) return UNAUTHENTICATED;
  const id = parseId(rawId);
  if (!id) return fail(400, "INVALID_INPUT", "Invalid organization id.");
  const org = await store.getOrganization(id);
  const isOwner = org?.ownerId === principal.id;
  const isReviewer = can(principal, "admin:verify_organizations");
  if (!org || (!isOwner && !isReviewer) || principal.status !== "ACTIVE") return fail(404, "NOT_FOUND", "Organization not found.");
  return ok(org);
}

export async function reviewOrganization(store: AuthzStore, principal: Principal | null, rawId: unknown, raw: unknown) {
  const denied = gate(principal, "admin:verify_organizations");
  if (denied) return denied;
  const id = parseId(rawId);
  if (!id) return fail(400, "INVALID_INPUT", "Invalid organization id.");
  const parsed = parse(reviewDecisionSchema, raw);
  if ("error" in parsed) return parsed.error;
  const org = await store.getOrganization(id);
  if (!org) return fail(404, "NOT_FOUND", "Organization not found.");
  if (org.ownerId === principal!.id) return fail(403, "SELF_REVIEW_FORBIDDEN", "You cannot review your own organization.");
  const status = parsed.data.decision === "APPROVE" ? "VERIFIED" : "REJECTED";
  const updated = await store.setOrganizationStatus({ id, status, reviewerId: principal!.id, note: parsed.data.note ?? null });
  await store.recordAudit({ actorId: principal!.id, action: `organization.${status.toLowerCase()}`, targetType: "Organization", targetId: id, metadata: { previous: org.status } });
  return ok(updated);
}

/* ------------------------------------------------------------------------------------------------
 * Administration
 * ---------------------------------------------------------------------------------------------- */

export async function reviewRoleRequest(store: AuthzStore, principal: Principal | null, rawId: unknown, raw: unknown) {
  const denied = gate(principal, "admin:review_requests");
  if (denied) return denied;
  const id = parseId(rawId);
  if (!id) return fail(400, "INVALID_INPUT", "Invalid request id.");
  const parsed = parse(reviewDecisionSchema, raw);
  if ("error" in parsed) return parsed.error;
  const p = principal!;

  const req = await store.getRoleRequest(id);
  if (!req) return fail(404, "NOT_FOUND", "Request not found.");
  if (req.userId === p.id) return fail(403, "SELF_REVIEW_FORBIDDEN", "You cannot review your own role request.");
  if (req.status !== "PENDING") return fail(409, "NOT_PENDING", "This request is no longer pending.");

  if (parsed.data.decision === "APPROVE") {
    const target = await store.getUserWithRoles(req.userId);
    if (!target || target.status !== "ACTIVE") return fail(409, "TARGET_INACTIVE", "The requesting account is not active.");
    const orgKind = ORGANIZATION_ROLE_KIND[req.role];
    if (orgKind) {
      const org = req.organizationId ? await store.getOrganization(req.organizationId) : null;
      if (!org || org.ownerId !== req.userId || org.kind !== orgKind || org.status !== "VERIFIED") {
        return fail(409, "ORGANIZATION_NOT_VERIFIED", "Verify the linked organization before approving this role.");
      }
    }
  }

  const status = parsed.data.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const decided = await store.decideRoleRequest({ id, status, reviewerId: p.id, note: parsed.data.note ?? null });
  if (!decided) return fail(409, "NOT_PENDING", "This request is no longer pending.");

  if (status === "APPROVED") {
    await store.grantRole({ userId: req.userId, role: req.role, grantedById: p.id, reason: `Approved request ${id}` });
    await store.recordAudit({ actorId: p.id, action: "role.granted", targetType: "User", targetId: req.userId, metadata: { role: req.role, requestId: id } });
  } else {
    await store.recordAudit({ actorId: p.id, action: "role.request_rejected", targetType: "RoleRequest", targetId: id, metadata: { role: req.role } });
  }
  return ok(decided);
}

export async function adminChangeRole(store: AuthzStore, principal: Principal | null, rawUserId: unknown, raw: unknown) {
  const denied = gate(principal, "admin:manage_roles");
  if (denied) return denied;
  const userId = parseId(rawUserId);
  if (!userId) return fail(400, "INVALID_INPUT", "Invalid user id.");
  const parsed = parse(adminRoleChangeSchema, raw);
  if ("error" in parsed) return parsed.error;
  const p = principal!;
  const role = parsed.data.role as Role;

  // Defense in depth: schema already restricts this, but never let ADMIN/USER through.
  if (!ADMIN_GRANTABLE_ROLES.includes(role)) return FORBIDDEN;
  if (userId === p.id) return fail(403, "SELF_MODIFICATION_FORBIDDEN", "Administrators cannot change their own roles.");

  const target = await store.getUserWithRoles(userId);
  if (!target) return fail(404, "NOT_FOUND", "User not found.");

  if (parsed.data.action === "GRANT") {
    if (target.status !== "ACTIVE") return fail(409, "TARGET_INACTIVE", "Cannot grant roles to a suspended account.");
    const orgKind = ORGANIZATION_ROLE_KIND[role];
    if (orgKind) {
      const orgs = await store.listOrganizations({ ownerId: userId, status: "VERIFIED", limit: 20 });
      if (!orgs.some((o) => o.kind === orgKind)) {
        return fail(409, "ORGANIZATION_NOT_VERIFIED", `The user has no verified ${orgKind} organization.`);
      }
    }
    const created = await store.grantRole({ userId, role, grantedById: p.id, reason: parsed.data.reason });
    if (!created) return fail(409, "ALREADY_HAS_ROLE", "The user already holds this role.");
    await store.recordAudit({ actorId: p.id, action: "role.granted", targetType: "User", targetId: userId, metadata: { role, reason: parsed.data.reason, via: "admin_direct" } });
  } else {
    const revoked = await store.revokeRole({ userId, role, revokedById: p.id, reason: parsed.data.reason });
    if (!revoked) return fail(409, "ROLE_NOT_HELD", "The user does not hold this role.");
    await store.recordAudit({ actorId: p.id, action: "role.revoked", targetType: "User", targetId: userId, metadata: { role, reason: parsed.data.reason } });
  }
  const updated = await store.getUserWithRoles(userId);
  return ok(updated as UserWithRoles);
}

export async function adminSetUserStatus(store: AuthzStore, principal: Principal | null, rawUserId: unknown, raw: unknown) {
  const denied = gate(principal, "admin:suspend_users");
  if (denied) return denied;
  const userId = parseId(rawUserId);
  if (!userId) return fail(400, "INVALID_INPUT", "Invalid user id.");
  const parsed = parse(adminStatusChangeSchema, raw);
  if ("error" in parsed) return parsed.error;
  const p = principal!;
  if (userId === p.id) return fail(403, "SELF_MODIFICATION_FORBIDDEN", "Administrators cannot change their own status.");
  const target = await store.getUserWithRoles(userId);
  if (!target) return fail(404, "NOT_FOUND", "User not found.");
  if (target.roles.includes("ADMIN")) {
    return fail(403, "ADMIN_TARGET_FORBIDDEN", "Administrator accounts can only be suspended through the operator process.");
  }
  if (target.status === parsed.data.status) return ok(target);
  await store.setUserStatus(userId, parsed.data.status);
  await store.recordAudit({
    actorId: p.id,
    action: parsed.data.status === "SUSPENDED" ? "user.suspended" : "user.reactivated",
    targetType: "User",
    targetId: userId,
    metadata: { reason: parsed.data.reason },
  });
  return ok({ ...target, status: parsed.data.status });
}

export async function adminListUsers(store: AuthzStore, principal: Principal | null, query?: string) {
  const denied = gate(principal, "admin:manage_roles");
  if (denied) return denied;
  const q = typeof query === "string" ? query.trim().slice(0, 100) : undefined;
  return ok(await store.listUsers({ query: q || undefined, limit: 200 }));
}

export async function adminListRoleRequests(store: AuthzStore, principal: Principal | null, status?: string) {
  const denied = gate(principal, "admin:review_requests");
  if (denied) return denied;
  const allowed = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"] as const;
  const s = allowed.find((a) => a === status);
  return ok(await store.listRoleRequests({ status: s, limit: 200 }));
}

export async function adminListOrganizations(store: AuthzStore, principal: Principal | null, status?: string) {
  const denied = gate(principal, "admin:verify_organizations");
  if (denied) return denied;
  const allowed = ["PENDING_REVIEW", "VERIFIED", "REJECTED"] as const;
  const s = allowed.find((a) => a === status);
  return ok(await store.listOrganizations({ status: s, limit: 200 }));
}

export async function adminListAudit(store: AuthzStore, principal: Principal | null) {
  const denied = gate(principal, "admin:view_audit");
  if (denied) return denied;
  return ok(await store.listAudit({ limit: 300 }));
}

/* ------------------------------------------------------------------------------------------------
 * Validator World ID binding
 * ---------------------------------------------------------------------------------------------- */

/**
 * Bind a server-verified World ID nullifier to the validator's account. The caller MUST have
 * already verified the proof with the World ID verifier; this enforces one-human-one-account.
 */
export async function bindWorldIdVerification(
  store: AuthzStore,
  principal: Principal | null,
  input: { action: string; nullifierHash: string }
) {
  const denied = gate(principal, "validator:worldid_verify");
  if (denied) return denied;
  const claimed = await store.claimWorldIdNullifier({ action: input.action, nullifierHash: input.nullifierHash.toLowerCase(), userId: principal!.id });
  if (!claimed) return fail(409, "ALREADY_VERIFIED", "This World ID has already been used for this action.");
  const at = new Date();
  await store.markWorldIdVerified(principal!.id, at);
  // Do not log the nullifier itself.
  await store.recordAudit({ actorId: principal!.id, action: "validator.worldid_verified", targetType: "User", targetId: principal!.id, metadata: { action: input.action } });
  return ok({ verifiedAt: at.toISOString() });
}
