import { expect } from "chai";
import {
  ADMIN_GRANTABLE_ROLES,
  can,
  hasRole,
  normalizeRoles,
  permissionForAppPath,
  permissionsFor,
  REQUESTABLE_ROLES,
  ROLE_PERMISSIONS,
  type Principal,
  type Role,
} from "../src/lib/auth/roles";
import {
  adminChangeRole,
  adminListAudit,
  adminListRoleRequests,
  adminListUsers,
  adminSetUserStatus,
  bindWorldIdVerification,
  createOrganization,
  getMyAccess,
  getOrganizationForPrincipal,
  requestRole,
  reviewOrganization,
  reviewRoleRequest,
  withdrawRoleRequest,
} from "../src/server/authz-service";
import { MemoryAuthzStore } from "./helpers/memory-store";

/** Resolves a Principal exactly like the server does: from the store, never from input. */
async function principalOf(store: MemoryAuthzStore, userId: string): Promise<Principal> {
  const u = (await store.getUserWithRoles(userId))!;
  return { id: u.id, email: u.email, name: u.name, image: u.image, status: u.status, roles: u.roles, worldIdVerifiedAt: u.worldIdVerifiedAt };
}

async function newUser(store: MemoryAuthzStore, tag: string) {
  return store.upsertGoogleUser({ googleSub: `sub-${tag}`, email: `${tag}@example.org`, name: tag, image: null });
}

async function makeAdmin(store: MemoryAuthzStore, tag = "admin") {
  const u = await newUser(store, tag);
  await store.grantRole({ userId: u.id, role: "ADMIN", grantedById: null, reason: "operator cli (test)" });
  return principalOf(store, u.id);
}

const JUSTIFICATION = "We run food distribution in the northern districts and need access.";
const ORG = { kind: "NGO", name: "Relief Partners", country: "Kenya", description: "Registered relief NGO operating food distribution programs." };

describe("RBAC — permission matrix", () => {
  it("USER has only baseline permissions", () => {
    const p = permissionsFor(["USER"]);
    expect([...p].sort()).to.deep.equal(["dashboard:view", "organization:manage_own", "role:request"]);
  });

  it("each role's workspace permission is exclusive to that role", () => {
    const view: Record<string, Role> = { "donor:view": "DONOR", "ngo:view": "NGO", "vendor:view": "VENDOR", "validator:view": "VALIDATOR", "admin:view": "ADMIN" };
    for (const [perm, owner] of Object.entries(view)) {
      for (const role of Object.keys(ROLE_PERMISSIONS) as Role[]) {
        expect(ROLE_PERMISSIONS[role].includes(perm as never), `${role} vs ${perm}`).to.equal(role === owner);
      }
    }
  });

  it("ADMIN does not inherit operational permissions (separation of duties)", () => {
    const admin = { roles: normalizeRoles(["ADMIN"]), status: "ACTIVE" as const };
    for (const perm of ["validator:vote", "vendor:bid", "donor:refund", "ngo:campaign_create"] as const) {
      expect(can(admin, perm)).to.equal(false);
    }
  });

  it("suspended principals have no permissions at all", () => {
    const suspended = { roles: normalizeRoles(["ADMIN", "DONOR"]), status: "SUSPENDED" as const };
    expect(can(suspended, "dashboard:view")).to.equal(false);
    expect(can(suspended, "admin:manage_roles")).to.equal(false);
    expect(hasRole(suspended, "ADMIN")).to.equal(false);
  });

  it("normalizeRoles drops unknown/spoofed values and always includes USER", () => {
    expect(normalizeRoles(["SUPERADMIN", "admin", "DONOR", "DONOR", "__proto__"])).to.deep.equal(["USER", "DONOR"]);
  });

  it("ADMIN is never requestable or grantable through the application", () => {
    expect((REQUESTABLE_ROLES as readonly string[]).includes("ADMIN")).to.equal(false);
    expect(ADMIN_GRANTABLE_ROLES.includes("ADMIN")).to.equal(false);
    expect(ADMIN_GRANTABLE_ROLES.includes("USER")).to.equal(false);
  });

  it("maps every /app route to the right permission (public user denied everywhere privileged)", () => {
    const user = { roles: normalizeRoles([]), status: "ACTIVE" as const };
    const cases: [string, boolean][] = [
      ["/app/dashboard", true],
      ["/app/donor", false],
      ["/app/ngo/campaigns", false],
      ["/app/vendor", false],
      ["/app/validator", false],
      ["/app/admin", false],
      ["/app/admin/users", false],
      ["/app/administrator-lookalike", true], // not a privileged workspace prefix → falls back to dashboard:view
    ];
    for (const [path, allowed] of cases) {
      const perm = permissionForAppPath(path)!;
      expect(can(user, perm), path).to.equal(allowed);
    }
    expect(permissionForAppPath("/campaigns")).to.equal(null);
  });
});

describe("RBAC — sign-in defaults and role requests", () => {
  let store: MemoryAuthzStore;
  beforeEach(() => {
    store = new MemoryAuthzStore();
  });

  it("a new Google user receives only the USER role", async () => {
    const u = await newUser(store, "alice");
    const p = await principalOf(store, u.id);
    expect(p.roles).to.deep.equal(["USER"]);
  });

  it("unauthenticated callers get 401 on every protected operation", async () => {
    const calls = [
      getMyAccess(store, null),
      requestRole(store, null, { role: "DONOR", justification: JUSTIFICATION }),
      withdrawRoleRequest(store, null, "abcdefgh12"),
      createOrganization(store, null, ORG),
      reviewRoleRequest(store, null, "abcdefgh12", { decision: "APPROVE" }),
      adminChangeRole(store, null, "abcdefgh12", { action: "GRANT", role: "NGO", reason: "test reason" }),
      adminSetUserStatus(store, null, "abcdefgh12", { status: "SUSPENDED", reason: "test reason" }),
      adminListUsers(store, null),
      adminListRoleRequests(store, null),
      adminListAudit(store, null),
      bindWorldIdVerification(store, null, { action: "a", nullifierHash: "0x1" }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.ok).to.equal(false);
      expect(res.status).to.equal(401);
    }
  });

  it("rejects role spoofing via payload: ADMIN role, extra fields, and unknown roles", async () => {
    const u = await principalOf(store, (await newUser(store, "mallory")).id);
    for (const body of [
      { role: "ADMIN", justification: JUSTIFICATION },
      { role: "DONOR", justification: JUSTIFICATION, roles: ["ADMIN"] },
      { role: "DONOR", justification: JUSTIFICATION, status: "APPROVED" },
      { role: "SUPERUSER", justification: JUSTIFICATION },
      { role: "DONOR", justification: "short" },
    ]) {
      const res = await requestRole(store, u, body);
      expect(res.ok, JSON.stringify(body)).to.equal(false);
      expect(res.status).to.equal(400);
    }
    expect((await principalOf(store, u.id)).roles).to.deep.equal(["USER"]);
  });

  it("a principal object with forged roles is ignored once re-resolved from the store", async () => {
    const u = await newUser(store, "forger");
    const forged: Principal = { ...(await principalOf(store, u.id)), roles: ["USER", "ADMIN"] };
    // Server code never trusts this object; it always rebuilds the principal from the DB:
    const real = await principalOf(store, forged.id);
    const res = await adminListUsers(store, real);
    expect(res.status).to.equal(403);
  });

  it("DONOR is granted immediately via self-service and audited", async () => {
    const u = await principalOf(store, (await newUser(store, "dana")).id);
    const res = await requestRole(store, u, { role: "DONOR", justification: JUSTIFICATION });
    expect(res.ok).to.equal(true);
    expect((await principalOf(store, u.id)).roles).to.include("DONOR");
    expect(store.audit.map((a) => a.action)).to.include.members(["role.requested", "role.granted"]);
  });

  it("DONOR self-service is disabled after an administrator revoked it", async () => {
    const admin = await makeAdmin(store);
    const u = await principalOf(store, (await newUser(store, "rev")).id);
    await requestRole(store, u, { role: "DONOR", justification: JUSTIFICATION });
    const revoke = await adminChangeRole(store, admin, u.id, { action: "REVOKE", role: "DONOR", reason: "abuse report" });
    expect(revoke.ok).to.equal(true);
    const again = await requestRole(store, await principalOf(store, u.id), { role: "DONOR", justification: JUSTIFICATION });
    expect(again.ok).to.equal(true);
    expect(again.ok && again.data.status).to.equal("PENDING");
    expect((await principalOf(store, u.id)).roles).to.not.include("DONOR");
  });

  it("NGO/VENDOR/VALIDATOR requests stay pending and grant nothing", async () => {
    const u = await principalOf(store, (await newUser(store, "nina")).id);
    const org = await createOrganization(store, u, ORG);
    expect(org.ok).to.equal(true);
    const res = await requestRole(store, u, { role: "NGO", justification: JUSTIFICATION, organizationId: org.ok ? org.data.id : "" });
    expect(res.ok && res.data.status).to.equal("PENDING");
    const v = await requestRole(store, u, { role: "VALIDATOR", justification: JUSTIFICATION });
    expect(v.ok && v.data.status).to.equal("PENDING");
    expect((await principalOf(store, u.id)).roles).to.deep.equal(["USER"]);
  });

  it("organization roles require an organization owned by the requester", async () => {
    const a = await principalOf(store, (await newUser(store, "a")).id);
    const b = await principalOf(store, (await newUser(store, "b")).id);
    const bOrg = await createOrganization(store, b, ORG);
    const none = await requestRole(store, a, { role: "NGO", justification: JUSTIFICATION });
    expect(none.status).to.equal(400);
    const stolen = await requestRole(store, a, { role: "NGO", justification: JUSTIFICATION, organizationId: bOrg.ok ? bOrg.data.id : "" });
    expect(stolen.status).to.equal(404);
    const vendorOrg = await createOrganization(store, a, { ...ORG, kind: "VENDOR" });
    const mismatch = await requestRole(store, a, { role: "NGO", justification: JUSTIFICATION, organizationId: vendorOrg.ok ? vendorOrg.data.id : "" });
    expect(mismatch.status).to.equal(400);
  });

  it("duplicate pending requests are rejected", async () => {
    const u = await principalOf(store, (await newUser(store, "dup")).id);
    await requestRole(store, u, { role: "VALIDATOR", justification: JUSTIFICATION });
    const again = await requestRole(store, u, { role: "VALIDATOR", justification: JUSTIFICATION });
    expect(again.status).to.equal(409);
  });

  it("users cannot withdraw someone else's request", async () => {
    const a = await principalOf(store, (await newUser(store, "a2")).id);
    const b = await principalOf(store, (await newUser(store, "b2")).id);
    const req = await requestRole(store, a, { role: "VALIDATOR", justification: JUSTIFICATION });
    const res = await withdrawRoleRequest(store, b, req.ok ? req.data.id : "");
    expect(res.status).to.equal(404);
    const own = await withdrawRoleRequest(store, a, req.ok ? req.data.id : "");
    expect(own.ok).to.equal(true);
  });

  it("organization records are private to their owner and reviewers", async () => {
    const a = await principalOf(store, (await newUser(store, "owner")).id);
    const b = await principalOf(store, (await newUser(store, "other")).id);
    const admin = await makeAdmin(store);
    const org = await createOrganization(store, a, ORG);
    const orgId = org.ok ? org.data.id : "";
    expect((await getOrganizationForPrincipal(store, a, orgId)).ok).to.equal(true);
    expect((await getOrganizationForPrincipal(store, b, orgId)).status).to.equal(404);
    expect((await getOrganizationForPrincipal(store, admin, orgId)).ok).to.equal(true);
  });
});

describe("RBAC — administrator review, grants, revocations", () => {
  let store: MemoryAuthzStore;
  beforeEach(() => {
    store = new MemoryAuthzStore();
  });

  it("non-admins (including every other role) cannot call admin operations", async () => {
    const u = await newUser(store, "x");
    for (const role of ["DONOR", "NGO", "VENDOR", "VALIDATOR"] as Role[]) await store.grantRole({ userId: u.id, role, grantedById: null, reason: null });
    const p = await principalOf(store, u.id);
    const target = await newUser(store, "y");
    expect((await adminListUsers(store, p)).status).to.equal(403);
    expect((await adminListAudit(store, p)).status).to.equal(403);
    expect((await adminChangeRole(store, p, target.id, { action: "GRANT", role: "VALIDATOR", reason: "please" })).status).to.equal(403);
    expect((await adminSetUserStatus(store, p, target.id, { status: "SUSPENDED", reason: "because" })).status).to.equal(403);
    expect((await reviewRoleRequest(store, p, "abcdefgh12", { decision: "APPROVE" })).status).to.equal(403);
  });

  it("full NGO approval flow: org must be verified first, then role is granted and audited", async () => {
    const admin = await makeAdmin(store);
    const u = await principalOf(store, (await newUser(store, "ngo")).id);
    const org = await createOrganization(store, u, ORG);
    const orgId = org.ok ? org.data.id : "";
    const req = await requestRole(store, u, { role: "NGO", justification: JUSTIFICATION, organizationId: orgId });
    const reqId = req.ok ? req.data.id : "";

    const early = await reviewRoleRequest(store, admin, reqId, { decision: "APPROVE" });
    expect(early.status).to.equal(409);
    expect((early as { code: string }).code).to.equal("ORGANIZATION_NOT_VERIFIED");

    expect((await reviewOrganization(store, admin, orgId, { decision: "APPROVE", note: "Registry checked" })).ok).to.equal(true);
    const approved = await reviewRoleRequest(store, admin, reqId, { decision: "APPROVE" });
    expect(approved.ok).to.equal(true);
    expect((await principalOf(store, u.id)).roles).to.include("NGO");
    const grant = store.audit.find((a) => a.action === "role.granted" && a.targetId === u.id);
    expect(grant?.actorId).to.equal(admin.id);

    // A decided request cannot be decided again.
    expect((await reviewRoleRequest(store, admin, reqId, { decision: "REJECT" })).status).to.equal(409);
  });

  it("admins cannot review their own requests or organizations", async () => {
    const admin = await makeAdmin(store);
    const org = await createOrganization(store, admin, ORG);
    const req = await requestRole(store, admin, { role: "VALIDATOR", justification: JUSTIFICATION });
    expect((await reviewRoleRequest(store, admin, req.ok ? req.data.id : "", { decision: "APPROVE" })).status).to.equal(403);
    expect((await reviewOrganization(store, admin, org.ok ? org.data.id : "", { decision: "APPROVE" })).status).to.equal(403);
  });

  it("admins cannot grant ADMIN, modify themselves, or suspend other admins", async () => {
    const admin = await makeAdmin(store, "admin1");
    const admin2 = await makeAdmin(store, "admin2");
    const u = await newUser(store, "target");
    expect((await adminChangeRole(store, admin, u.id, { action: "GRANT", role: "ADMIN", reason: "promote" })).status).to.equal(400);
    expect((await adminChangeRole(store, admin, admin.id, { action: "GRANT", role: "VALIDATOR", reason: "self change" })).status).to.equal(403);
    expect((await adminSetUserStatus(store, admin, admin.id, { status: "SUSPENDED", reason: "self change" })).status).to.equal(403);
    expect((await adminSetUserStatus(store, admin, admin2.id, { status: "SUSPENDED", reason: "coup attempt" })).status).to.equal(403);
  });

  it("direct VENDOR grant requires a verified vendor organization", async () => {
    const admin = await makeAdmin(store);
    const u = await principalOf(store, (await newUser(store, "vend")).id);
    expect((await adminChangeRole(store, admin, u.id, { action: "GRANT", role: "VENDOR", reason: "direct grant" })).status).to.equal(409);
    const org = await createOrganization(store, u, { ...ORG, kind: "VENDOR" });
    await reviewOrganization(store, admin, org.ok ? org.data.id : "", { decision: "APPROVE" });
    expect((await adminChangeRole(store, admin, u.id, { action: "GRANT", role: "VENDOR", reason: "direct grant" })).ok).to.equal(true);
  });

  it("grant and revoke are both audited and take effect on the next resolution", async () => {
    const admin = await makeAdmin(store);
    const u = await newUser(store, "val");
    expect((await adminChangeRole(store, admin, u.id, { action: "GRANT", role: "VALIDATOR", reason: "assigned seat 3" })).ok).to.equal(true);
    expect(can(await principalOf(store, u.id), "validator:vote")).to.equal(true);
    expect((await adminChangeRole(store, admin, u.id, { action: "REVOKE", role: "VALIDATOR", reason: "rotated out" })).ok).to.equal(true);
    expect(can(await principalOf(store, u.id), "validator:vote")).to.equal(false);
    const actions = store.audit.filter((a) => a.targetId === u.id).map((a) => a.action);
    expect(actions).to.include.members(["role.granted", "role.revoked"]);
    expect((await adminChangeRole(store, admin, u.id, { action: "REVOKE", role: "VALIDATOR", reason: "again" })).status).to.equal(409);
  });

  it("suspension removes all access immediately", async () => {
    const admin = await makeAdmin(store);
    const u = await newUser(store, "sus");
    await store.grantRole({ userId: u.id, role: "DONOR", grantedById: null, reason: null });
    expect((await adminSetUserStatus(store, admin, u.id, { status: "SUSPENDED", reason: "fraud review" })).ok).to.equal(true);
    const p = await principalOf(store, u.id);
    expect(can(p, "donor:view")).to.equal(false);
    const res = await requestRole(store, p, { role: "VALIDATOR", justification: JUSTIFICATION });
    expect(res.status).to.equal(403);
    expect((await adminChangeRole(store, admin, u.id, { action: "GRANT", role: "VALIDATOR", reason: "grant to suspended" })).status).to.equal(409);
  });

  it("rejects malformed ids before touching the store", async () => {
    const admin = await makeAdmin(store);
    for (const bad of ["", "../etc", "a b c d e f", "x".repeat(200), { $ne: null }]) {
      expect((await reviewRoleRequest(store, admin, bad, { decision: "APPROVE" })).status).to.equal(400);
    }
  });
});

describe("Validator World ID binding", () => {
  it("requires validator role and enforces one human per action", async () => {
    const store = new MemoryAuthzStore();
    const user = await principalOf(store, (await newUser(store, "plain")).id);
    expect((await bindWorldIdVerification(store, user, { action: "verify-human-reviewer", nullifierHash: "0xabc" })).status).to.equal(403);

    const v1 = await newUser(store, "v1");
    const v2 = await newUser(store, "v2");
    await store.grantRole({ userId: v1.id, role: "VALIDATOR", grantedById: null, reason: null });
    await store.grantRole({ userId: v2.id, role: "VALIDATOR", grantedById: null, reason: null });
    const first = await bindWorldIdVerification(store, await principalOf(store, v1.id), { action: "verify-human-reviewer", nullifierHash: "0xABC" });
    expect(first.ok).to.equal(true);
    expect((await principalOf(store, v1.id)).worldIdVerifiedAt).to.be.instanceOf(Date);
    const second = await bindWorldIdVerification(store, await principalOf(store, v2.id), { action: "verify-human-reviewer", nullifierHash: "0xabc" });
    expect(second.status).to.equal(409);
    // The nullifier itself is never written to the audit log.
    expect(JSON.stringify(store.audit)).to.not.include("0xabc");
  });
});
