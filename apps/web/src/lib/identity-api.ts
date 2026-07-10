import { getSession } from 'next-auth/react';
import type {
  ApiError,
  OrganizationResponse,
  UserResponse,
  RoleResponse,
  InvitationResponse,
  ApiKeyResponse,
  AuditLogResponse,
  MembershipResponse,
} from '@gain/shared';

const API_BASE =
  process.env.NEXT_PUBLIC_IDENTITY_API_URL ?? 'http://localhost:3001';

export class IdentityApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly correlationId?: string,
    readonly details?: Record<string, unknown>[],
  ) {
    super(message);
    this.name = 'IdentityApiError';
  }
}

async function getAccessToken(): Promise<string | undefined> {
  const session = await getSession();
  return session?.accessToken;
}

export async function identityFetch<T>(
  path: string,
  init: RequestInit & { organizationId?: string } = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.organizationId) {
    headers.set('x-organization-id', init.organizationId);
  }

  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => null)) as
    | T
    | ApiError
    | null;

  if (!response.ok) {
    const err = payload as ApiError | null;
    throw new IdentityApiError(
      err?.message ?? `Request failed with ${response.status}`,
      response.status,
      err?.correlationId,
      err?.details,
    );
  }

  return payload as T;
}

export type Paginated<T> = {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

export const identityApi = {
  listOrganizations: (query = '') =>
    identityFetch<Paginated<OrganizationResponse>>(`/organizations${query}`),
  createOrganization: (body: unknown) =>
    identityFetch<OrganizationResponse>('/organizations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listUsers: (query = '', organizationId?: string) =>
    identityFetch<Paginated<UserResponse>>(`/users${query}`, {
      organizationId,
    }),
  listRoles: (query = '', organizationId?: string) =>
    identityFetch<Paginated<RoleResponse>>(`/roles${query}`, {
      organizationId,
    }),
  listMemberships: (query = '', organizationId?: string) =>
    identityFetch<Paginated<MembershipResponse>>(`/memberships${query}`, {
      organizationId,
    }),
  listInvitations: (query = '', organizationId?: string) =>
    identityFetch<Paginated<InvitationResponse>>(`/invitations${query}`, {
      organizationId,
    }),
  createInvitation: (body: unknown, organizationId?: string) =>
    identityFetch<InvitationResponse & { token: string }>('/invitations', {
      method: 'POST',
      body: JSON.stringify(body),
      organizationId,
    }),
  listApiKeys: (query = '', organizationId?: string) =>
    identityFetch<Paginated<ApiKeyResponse>>(`/api-keys${query}`, {
      organizationId,
    }),
  listAuditLogs: (query = '', organizationId?: string) =>
    identityFetch<Paginated<AuditLogResponse>>(`/audit-logs${query}`, {
      organizationId,
    }),
  me: (organizationId?: string) =>
    identityFetch<UserResponse>('/users/me', { organizationId }),
};
