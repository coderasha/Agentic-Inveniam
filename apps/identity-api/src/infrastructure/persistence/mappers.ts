import type {
  ApiKeyResponse,
  InvitationResponse,
  MembershipResponse,
  OrganizationResponse,
  Permission,
  RoleResponse,
  UserResponse,
  AuditLogResponse,
  AbacPolicyResponse,
} from '@gain/shared';
import type {
  ApiKey,
  AuditLog,
  AbacPolicy,
  Invitation,
  Membership,
  Organization,
  Role,
  User,
} from '@gain/database';

function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export function mapOrganization(org: Organization): OrganizationResponse {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    legalName: org.legalName,
    description: org.description,
    website: org.website,
    industry: org.industry,
    countryCode: org.countryCode,
    timezone: org.timezone,
    status: org.status,
    parentOrganizationId: org.parentOrganizationId,
    settings: (org.settings as Record<string, unknown>) ?? {},
    version: org.version,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
    deletedAt: toIso(org.deletedAt),
  };
}

export function mapUser(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    phone: user.phone,
    locale: user.locale,
    timezone: user.timezone,
    status: user.status,
    emailVerified: user.emailVerified,
    keycloakSubjectId: user.keycloakSubjectId,
    lastLoginAt: toIso(user.lastLoginAt),
    metadata: (user.metadata as Record<string, unknown>) ?? {},
    version: user.version,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    deletedAt: toIso(user.deletedAt),
  };
}

export function mapRole(role: Role): RoleResponse {
  return {
    id: role.id,
    organizationId: role.organizationId,
    name: role.name,
    slug: role.slug,
    description: role.description,
    permissions: role.permissions as Permission[],
    isSystem: role.isSystem,
    version: role.version,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

export function mapMembership(
  membership: Membership & {
    roles: Array<{ role: Role }>;
  },
): MembershipResponse {
  const roles = membership.roles.map((mr) => ({
    id: mr.role.id,
    name: mr.role.name,
    slug: mr.role.slug,
  }));
  const permissions = [
    ...new Set(membership.roles.flatMap((mr) => mr.role.permissions)),
  ] as Permission[];

  return {
    id: membership.id,
    userId: membership.userId,
    organizationId: membership.organizationId,
    title: membership.title,
    department: membership.department,
    status: membership.status,
    isPrimary: membership.isPrimary,
    roles,
    permissions,
    version: membership.version,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}

export function mapInvitation(
  invitation: Invitation & { roles: Array<{ roleId: string }> },
): InvitationResponse {
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    email: invitation.email,
    status: invitation.status,
    roleIds: invitation.roles.map((r) => r.roleId),
    invitedByUserId: invitation.invitedByUserId,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: toIso(invitation.acceptedAt),
    createdAt: invitation.createdAt.toISOString(),
    updatedAt: invitation.updatedAt.toISOString(),
  };
}

export function mapApiKey(apiKey: ApiKey): ApiKeyResponse {
  return {
    id: apiKey.id,
    organizationId: apiKey.organizationId,
    name: apiKey.name,
    description: apiKey.description,
    keyPrefix: apiKey.keyPrefix,
    status: apiKey.status,
    lastUsedAt: toIso(apiKey.lastUsedAt),
    expiresAt: toIso(apiKey.expiresAt),
    createdAt: apiKey.createdAt.toISOString(),
    revokedAt: toIso(apiKey.revokedAt),
  };
}

export function mapAuditLog(log: AuditLog): AuditLogResponse {
  return {
    id: log.id,
    organizationId: log.organizationId,
    actorUserId: log.actorUserId,
    actorType: log.actorType,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    correlationId: log.correlationId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    changes: (log.changes as Record<string, unknown> | null) ?? null,
    metadata: (log.metadata as Record<string, unknown>) ?? {},
    createdAt: log.createdAt.toISOString(),
  };
}

export function mapAbacPolicy(policy: AbacPolicy): AbacPolicyResponse {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    name: policy.name,
    description: policy.description ?? undefined,
    effect: policy.effect,
    resourceType: policy.resourceType,
    actions: policy.actions,
    conditions: (policy.conditions as Record<string, unknown>) ?? {},
    priority: policy.priority,
    enabled: policy.enabled,
    version: policy.version,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}
