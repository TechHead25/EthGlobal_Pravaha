import type { AccountStatus, Role } from "../../lib/auth/roles";

export type RoleRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
export type OrganizationKind = "NGO" | "VENDOR";
export type OrganizationStatus = "PENDING_REVIEW" | "VERIFIED" | "REJECTED";

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  status: AccountStatus;
  worldIdVerifiedAt: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface UserWithRoles extends UserRecord {
  roles: Role[];
}

export interface RoleRequestRecord {
  id: string;
  userId: string;
  role: Role;
  status: RoleRequestStatus;
  justification: string;
  walletAddress: string | null;
  organizationId: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}

export interface OrganizationRecord {
  id: string;
  ownerId: string;
  kind: OrganizationKind;
  name: string;
  website: string | null;
  registrationNumber: string | null;
  country: string;
  description: string;
  status: OrganizationStatus;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}

export interface AuditEventRecord {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditEventInput {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export interface GoogleProfileInput {
  googleSub: string;
  email: string;
  name: string | null;
  image: string | null;
}

/**
 * Persistence boundary for identity & authorization. Production uses PrismaAuthzStore
 * (PostgreSQL). Tests use an in-memory implementation that lives under test/ only.
 */
export interface AuthzStore {
  upsertGoogleUser(profile: GoogleProfileInput): Promise<UserRecord>;
  getUserWithRoles(userId: string): Promise<UserWithRoles | null>;
  listUsers(opts: { query?: string; limit: number }): Promise<UserWithRoles[]>;
  setUserStatus(userId: string, status: AccountStatus): Promise<void>;
  markWorldIdVerified(userId: string, at: Date): Promise<void>;

  grantRole(input: { userId: string; role: Role; grantedById: string | null; reason: string | null }): Promise<boolean>;
  revokeRole(input: { userId: string; role: Role; revokedById: string; reason: string }): Promise<boolean>;

  createRoleRequest(input: Omit<RoleRequestRecord, "id" | "status" | "reviewedById" | "reviewedAt" | "reviewNote" | "createdAt">): Promise<RoleRequestRecord>;
  getRoleRequest(id: string): Promise<RoleRequestRecord | null>;
  findPendingRoleRequest(userId: string, role: Role): Promise<RoleRequestRecord | null>;
  listRoleRequests(opts: { userId?: string; status?: RoleRequestStatus; limit: number }): Promise<RoleRequestRecord[]>;
  /** Atomically transitions PENDING -> status. Returns null if no longer pending. */
  decideRoleRequest(input: { id: string; status: "APPROVED" | "REJECTED" | "WITHDRAWN"; reviewerId: string | null; note: string | null }): Promise<RoleRequestRecord | null>;

  createOrganization(input: Omit<OrganizationRecord, "id" | "status" | "reviewedById" | "reviewedAt" | "reviewNote" | "createdAt">): Promise<OrganizationRecord>;
  getOrganization(id: string): Promise<OrganizationRecord | null>;
  listOrganizations(opts: { ownerId?: string; status?: OrganizationStatus; limit: number }): Promise<OrganizationRecord[]>;
  setOrganizationStatus(input: { id: string; status: OrganizationStatus; reviewerId: string; note: string | null }): Promise<OrganizationRecord | null>;

  /** Returns false if this nullifier was already used for this action (by anyone). */
  claimWorldIdNullifier(input: { action: string; nullifierHash: string; userId: string }): Promise<boolean>;

  recordAudit(event: AuditEventInput): Promise<void>;
  listAudit(opts: { limit: number; actorId?: string; targetId?: string }): Promise<AuditEventRecord[]>;

  ping(): Promise<boolean>;
}
