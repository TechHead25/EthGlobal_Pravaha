/**
 * TEST-ONLY in-memory AuthzStore. Lives under test/ so it can never be imported by the
 * application. Mirrors the semantics of PrismaAuthzStore (incl. partial unique constraints).
 */
import { normalizeRoles, type AccountStatus, type Role } from "../../src/lib/auth/roles";
import type {
  AuditEventInput,
  AuditEventRecord,
  AuthzStore,
  GoogleProfileInput,
  OrganizationRecord,
  OrganizationStatus,
  RoleRequestRecord,
  RoleRequestStatus,
  UserRecord,
  UserWithRoles,
} from "../../src/server/store/types";

let seq = 0;
const id = (p: string) => `${p}${(++seq).toString(36).padStart(10, "0")}`;

interface Grant {
  userId: string;
  role: Role;
  revokedAt: Date | null;
}

export class MemoryAuthzStore implements AuthzStore {
  users = new Map<string, UserRecord & { googleSub: string }>();
  grants: Grant[] = [];
  requests = new Map<string, RoleRequestRecord>();
  orgs = new Map<string, OrganizationRecord>();
  nullifiers = new Set<string>();
  audit: AuditEventRecord[] = [];

  async upsertGoogleUser(p: GoogleProfileInput): Promise<UserRecord> {
    const existing = [...this.users.values()].find((u) => u.googleSub === p.googleSub);
    if (existing) {
      Object.assign(existing, { email: p.email, name: p.name, image: p.image, lastLoginAt: new Date() });
      return existing;
    }
    const u = { id: id("u"), googleSub: p.googleSub, email: p.email, name: p.name, image: p.image, status: "ACTIVE" as AccountStatus, worldIdVerifiedAt: null, createdAt: new Date(), lastLoginAt: new Date() };
    this.users.set(u.id, u);
    return u;
  }
  private withRoles(u: UserRecord): UserWithRoles {
    return { ...u, roles: normalizeRoles(this.grants.filter((g) => g.userId === u.id && !g.revokedAt).map((g) => g.role)) };
  }
  async getUserWithRoles(userId: string) {
    const u = this.users.get(userId);
    return u ? this.withRoles(u) : null;
  }
  async listUsers({ query, limit }: { query?: string; limit: number }) {
    return [...this.users.values()].filter((u) => !query || u.email.includes(query)).slice(0, limit).map((u) => this.withRoles(u));
  }
  async setUserStatus(userId: string, status: AccountStatus) {
    this.users.get(userId)!.status = status;
  }
  async markWorldIdVerified(userId: string, at: Date) {
    this.users.get(userId)!.worldIdVerifiedAt = at;
  }
  async grantRole({ userId, role }: { userId: string; role: Role; grantedById: string | null; reason: string | null }) {
    if (this.grants.some((g) => g.userId === userId && g.role === role && !g.revokedAt)) return false;
    this.grants.push({ userId, role, revokedAt: null });
    return true;
  }
  async revokeRole({ userId, role }: { userId: string; role: Role; revokedById: string; reason: string }) {
    const g = this.grants.find((x) => x.userId === userId && x.role === role && !x.revokedAt);
    if (!g) return false;
    g.revokedAt = new Date();
    return true;
  }
  async createRoleRequest(input: Parameters<AuthzStore["createRoleRequest"]>[0]) {
    if ([...this.requests.values()].some((r) => r.userId === input.userId && r.role === input.role && r.status === "PENDING")) throw new Error("unique violation");
    const r: RoleRequestRecord = { ...input, id: id("r"), status: "PENDING", reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date() };
    this.requests.set(r.id, r);
    return r;
  }
  async getRoleRequest(rid: string) {
    return this.requests.get(rid) ?? null;
  }
  async findPendingRoleRequest(userId: string, role: Role) {
    return [...this.requests.values()].find((r) => r.userId === userId && r.role === role && r.status === "PENDING") ?? null;
  }
  async listRoleRequests({ userId, status, limit }: { userId?: string; status?: RoleRequestStatus; limit: number }) {
    return [...this.requests.values()].filter((r) => (!userId || r.userId === userId) && (!status || r.status === status)).slice(0, limit);
  }
  async decideRoleRequest({ id: rid, status, reviewerId, note }: { id: string; status: "APPROVED" | "REJECTED" | "WITHDRAWN"; reviewerId: string | null; note: string | null }) {
    const r = this.requests.get(rid);
    if (!r || r.status !== "PENDING") return null;
    Object.assign(r, { status, reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note });
    return r;
  }
  async createOrganization(input: Parameters<AuthzStore["createOrganization"]>[0]) {
    const o: OrganizationRecord = { ...input, id: id("o"), status: "PENDING_REVIEW", reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date() };
    this.orgs.set(o.id, o);
    return o;
  }
  async getOrganization(oid: string) {
    return this.orgs.get(oid) ?? null;
  }
  async listOrganizations({ ownerId, status, limit }: { ownerId?: string; status?: OrganizationStatus; limit: number }) {
    return [...this.orgs.values()].filter((o) => (!ownerId || o.ownerId === ownerId) && (!status || o.status === status)).slice(0, limit);
  }
  async setOrganizationStatus({ id: oid, status, reviewerId, note }: { id: string; status: OrganizationStatus; reviewerId: string; note: string | null }) {
    const o = this.orgs.get(oid);
    if (!o) return null;
    Object.assign(o, { status, reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note });
    return o;
  }
  async claimWorldIdNullifier({ action, nullifierHash }: { action: string; nullifierHash: string; userId: string }) {
    const k = `${action}:${nullifierHash}`;
    if (this.nullifiers.has(k)) return false;
    this.nullifiers.add(k);
    return true;
  }
  async recordAudit(e: AuditEventInput) {
    this.audit.unshift({ id: id("a"), actorId: e.actorId, action: e.action, targetType: e.targetType ?? null, targetId: e.targetId ?? null, metadata: e.metadata ?? null, createdAt: new Date() });
  }
  async listAudit({ limit, actorId, targetId }: { limit: number; actorId?: string; targetId?: string }) {
    return this.audit.filter((a) => (!actorId || a.actorId === actorId) && (!targetId || a.targetId === targetId)).slice(0, limit);
  }
  async ping() {
    return true;
  }
}
