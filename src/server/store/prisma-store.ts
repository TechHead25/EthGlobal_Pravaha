import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeRoles, type AccountStatus, type Role } from "../../lib/auth/roles";
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
} from "./types";

type UserRow = Prisma.UserGetPayload<{ include: { roleGrants: true } }>;

function toUser(u: Prisma.UserGetPayload<object>): UserRecord {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image,
    status: u.status as AccountStatus,
    worldIdVerifiedAt: u.worldIdVerifiedAt,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

function toUserWithRoles(u: UserRow): UserWithRoles {
  return {
    ...toUser(u),
    roles: normalizeRoles(u.roleGrants.filter((g) => g.revokedAt === null).map((g) => g.role)),
  };
}

const activeGrants = { where: { revokedAt: null } } as const;

export class PrismaAuthzStore implements AuthzStore {
  constructor(private readonly db: PrismaClient) {}

  async upsertGoogleUser(p: GoogleProfileInput): Promise<UserRecord> {
    // Keyed on Google's stable `sub`, never on email alone.
    const user = await this.db.user.upsert({
      where: { googleSub: p.googleSub },
      create: { googleSub: p.googleSub, email: p.email, name: p.name, image: p.image, lastLoginAt: new Date() },
      update: { email: p.email, name: p.name, image: p.image, lastLoginAt: new Date() },
    });
    return toUser(user);
  }

  async getUserWithRoles(userId: string): Promise<UserWithRoles | null> {
    const u = await this.db.user.findUnique({ where: { id: userId }, include: { roleGrants: activeGrants } });
    return u ? toUserWithRoles(u) : null;
  }

  async listUsers({ query, limit }: { query?: string; limit: number }): Promise<UserWithRoles[]> {
    const where: Prisma.UserWhereInput = query
      ? { OR: [{ email: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }] }
      : {};
    const rows = await this.db.user.findMany({ where, include: { roleGrants: activeGrants }, orderBy: { createdAt: "desc" }, take: limit });
    return rows.map(toUserWithRoles);
  }

  async setUserStatus(userId: string, status: AccountStatus): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { status } });
  }

  async markWorldIdVerified(userId: string, at: Date): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { worldIdVerifiedAt: at } });
  }

  async grantRole({ userId, role, grantedById, reason }: { userId: string; role: Role; grantedById: string | null; reason: string | null }) {
    const existing = await this.db.roleGrant.findFirst({ where: { userId, role, revokedAt: null } });
    if (existing) return false;
    try {
      await this.db.roleGrant.create({ data: { userId, role, grantedById, reason } });
      return true;
    } catch (e) {
      // Partial unique index "RoleGrant_one_active_per_role" closes the check-then-insert race.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
      throw e;
    }
  }

  async revokeRole({ userId, role, revokedById, reason }: { userId: string; role: Role; revokedById: string; reason: string }) {
    const res = await this.db.roleGrant.updateMany({
      where: { userId, role, revokedAt: null },
      data: { revokedAt: new Date(), revokedById, revokeReason: reason },
    });
    return res.count > 0;
  }

  async createRoleRequest(input: Parameters<AuthzStore["createRoleRequest"]>[0]): Promise<RoleRequestRecord> {
    const r = await this.db.roleRequest.create({ data: input });
    return r as RoleRequestRecord;
  }

  async getRoleRequest(id: string) {
    return (await this.db.roleRequest.findUnique({ where: { id } })) as RoleRequestRecord | null;
  }

  async findPendingRoleRequest(userId: string, role: Role) {
    return (await this.db.roleRequest.findFirst({ where: { userId, role, status: "PENDING" } })) as RoleRequestRecord | null;
  }

  async listRoleRequests({ userId, status, limit }: { userId?: string; status?: RoleRequestStatus; limit: number }) {
    const rows = await this.db.roleRequest.findMany({
      where: { ...(userId ? { userId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows as RoleRequestRecord[];
  }

  async decideRoleRequest({ id, status, reviewerId, note }: { id: string; status: "APPROVED" | "REJECTED" | "WITHDRAWN"; reviewerId: string | null; note: string | null }) {
    // Conditional update makes the PENDING -> decided transition race-safe.
    const res = await this.db.roleRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status, reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note },
    });
    if (res.count === 0) return null;
    return this.getRoleRequest(id);
  }

  async createOrganization(input: Parameters<AuthzStore["createOrganization"]>[0]): Promise<OrganizationRecord> {
    return (await this.db.organization.create({ data: input })) as OrganizationRecord;
  }

  async getOrganization(id: string) {
    return (await this.db.organization.findUnique({ where: { id } })) as OrganizationRecord | null;
  }

  async listOrganizations({ ownerId, status, limit }: { ownerId?: string; status?: OrganizationStatus; limit: number }) {
    const rows = await this.db.organization.findMany({
      where: { ...(ownerId ? { ownerId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows as OrganizationRecord[];
  }

  async setOrganizationStatus({ id, status, reviewerId, note }: { id: string; status: OrganizationStatus; reviewerId: string; note: string | null }) {
    try {
      return (await this.db.organization.update({
        where: { id },
        data: { status, reviewedById: reviewerId, reviewedAt: new Date(), reviewNote: note },
      })) as OrganizationRecord;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return null;
      throw e;
    }
  }

  async claimWorldIdNullifier({ action, nullifierHash, userId }: { action: string; nullifierHash: string; userId: string }) {
    try {
      await this.db.worldIdNullifier.create({ data: { action, nullifierHash, userId } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
      throw e;
    }
  }

  async recordAudit(event: AuditEventInput): Promise<void> {
    await this.db.auditEvent.create({
      data: {
        actorId: event.actorId,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        metadata: (event.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listAudit({ limit, actorId, targetId }: { limit: number; actorId?: string; targetId?: string }): Promise<AuditEventRecord[]> {
    const rows = await this.db.auditEvent.findMany({
      where: { ...(actorId ? { actorId } : {}), ...(targetId ? { targetId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({ ...r, metadata: (r.metadata as Record<string, unknown> | null) ?? null }));
  }

  async ping(): Promise<boolean> {
    await this.db.$queryRaw`SELECT 1`;
    return true;
  }
}
