/**
 * Integration tests for PrismaAuthzStore against a real PostgreSQL database.
 * Skipped unless TEST_DATABASE_URL points at a DISPOSABLE, already-migrated database:
 *
 *   TEST_DATABASE_URL=postgresql://user@localhost:5432/openaid_test npm run test:db
 *
 * The suite deletes all rows in the application tables before running.
 */
import { expect } from "chai";
import { PrismaClient } from "@prisma/client";
import { PrismaAuthzStore } from "../src/server/store/prisma-store";
import { adminChangeRole, createOrganization, requestRole, reviewOrganization, reviewRoleRequest } from "../src/server/authz-service";
import type { Principal } from "../src/lib/auth/roles";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("PrismaAuthzStore (PostgreSQL integration)", function () {
  this.timeout(30_000);
  let db: PrismaClient;
  let store: PrismaAuthzStore;

  const principal = async (id: string): Promise<Principal> => {
    const u = (await store.getUserWithRoles(id))!;
    return { id: u.id, email: u.email, name: u.name, image: u.image, status: u.status, roles: u.roles, worldIdVerifiedAt: u.worldIdVerifiedAt };
  };

  before(async () => {
    db = new PrismaClient({ datasources: { db: { url } } });
    store = new PrismaAuthzStore(db);
    await db.$executeRawUnsafe('TRUNCATE "AuditEvent", "WorldIdNullifier", "RoleRequest", "RoleGrant", "Organization", "User" CASCADE');
  });
  after(async () => {
    await db?.$disconnect();
  });

  it("upserts Google users by stable sub with only USER role", async () => {
    const a = await store.upsertGoogleUser({ googleSub: "g-1", email: "a@example.org", name: "A", image: null });
    const again = await store.upsertGoogleUser({ googleSub: "g-1", email: "a+new@example.org", name: "A2", image: null });
    expect(again.id).to.equal(a.id);
    expect((await store.getUserWithRoles(a.id))!.roles).to.deep.equal(["USER"]);
  });

  it("enforces one active grant per role even under concurrent grants", async () => {
    const u = await store.upsertGoogleUser({ googleSub: "g-race", email: "race@example.org", name: null, image: null });
    const results = await Promise.all(Array.from({ length: 8 }, () => store.grantRole({ userId: u.id, role: "VALIDATOR", grantedById: null, reason: "race" })));
    expect(results.filter(Boolean)).to.have.length(1);
    expect(await db.roleGrant.count({ where: { userId: u.id, role: "VALIDATOR", revokedAt: null } })).to.equal(1);
    expect(await store.revokeRole({ userId: u.id, role: "VALIDATOR", revokedById: u.id, reason: "test" })).to.equal(true);
    expect(await store.grantRole({ userId: u.id, role: "VALIDATOR", grantedById: null, reason: "re-grant" })).to.equal(true);
  });

  it("only one concurrent decision on a request wins", async () => {
    const u = await store.upsertGoogleUser({ googleSub: "g-dec", email: "dec@example.org", name: null, image: null });
    const r = await store.createRoleRequest({ userId: u.id, role: "VALIDATOR", justification: "x".repeat(30), walletAddress: null, organizationId: null });
    const outcomes = await Promise.all([
      store.decideRoleRequest({ id: r.id, status: "APPROVED", reviewerId: null, note: null }),
      store.decideRoleRequest({ id: r.id, status: "REJECTED", reviewerId: null, note: null }),
      store.decideRoleRequest({ id: r.id, status: "WITHDRAWN", reviewerId: null, note: null }),
    ]);
    expect(outcomes.filter(Boolean)).to.have.length(1);
  });

  it("World ID nullifiers are unique per action", async () => {
    const u = await store.upsertGoogleUser({ googleSub: "g-wid", email: "wid@example.org", name: null, image: null });
    expect(await store.claimWorldIdNullifier({ action: "act", nullifierHash: "0x1", userId: u.id })).to.equal(true);
    expect(await store.claimWorldIdNullifier({ action: "act", nullifierHash: "0x1", userId: u.id })).to.equal(false);
    expect(await store.claimWorldIdNullifier({ action: "other", nullifierHash: "0x1", userId: u.id })).to.equal(true);
  });

  it("runs the full NGO approval flow through the service with audit rows", async () => {
    const adminUser = await store.upsertGoogleUser({ googleSub: "g-admin", email: "admin@example.org", name: "Admin", image: null });
    await store.grantRole({ userId: adminUser.id, role: "ADMIN", grantedById: null, reason: "operator" });
    const admin = await principal(adminUser.id);
    const ngoUser = await store.upsertGoogleUser({ googleSub: "g-ngo", email: "ngo@example.org", name: "NGO", image: null });
    const ngo = await principal(ngoUser.id);

    const org = await createOrganization(store, ngo, { kind: "NGO", name: "Relief Org", country: "KE", description: "A registered relief organization for tests." });
    expect(org.ok).to.equal(true);
    const req = await requestRole(store, ngo, { role: "NGO", justification: "We distribute food aid in the region.", organizationId: org.ok ? org.data.id : "" });
    expect(req.ok && req.data.status).to.equal("PENDING");
    expect((await reviewRoleRequest(store, admin, req.ok ? req.data.id : "", { decision: "APPROVE" })).status).to.equal(409);
    expect((await reviewOrganization(store, admin, org.ok ? org.data.id : "", { decision: "APPROVE" })).ok).to.equal(true);
    expect((await reviewRoleRequest(store, admin, req.ok ? req.data.id : "", { decision: "APPROVE" })).ok).to.equal(true);
    expect((await principal(ngoUser.id)).roles).to.include("NGO");

    expect((await adminChangeRole(store, admin, ngoUser.id, { action: "REVOKE", role: "NGO", reason: "test revoke" })).ok).to.equal(true);
    expect((await principal(ngoUser.id)).roles).to.not.include("NGO");

    const audit = await store.listAudit({ limit: 50, targetId: ngoUser.id });
    expect(audit.map((a) => a.action)).to.include.members(["role.granted", "role.revoked"]);
    expect(audit.find((a) => a.action === "role.granted")?.actorId).to.equal(admin.id);
  });

  it("ping succeeds", async () => {
    expect(await store.ping()).to.equal(true);
  });
});
