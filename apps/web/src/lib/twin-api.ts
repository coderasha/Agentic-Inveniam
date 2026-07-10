import { getSession } from 'next-auth/react';
import type { ApiError } from '@gain/shared';

const TWIN_API_BASE =
  process.env.NEXT_PUBLIC_TWIN_API_URL ?? 'http://localhost:3002';

export class TwinApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'TwinApiError';
  }
}

async function getAccessToken(): Promise<string | undefined> {
  const devToken = process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN;
  if (devToken) return devToken;
  const session = await getSession();
  return session?.accessToken;
}

export async function twinFetch<T>(
  path: string,
  init: RequestInit & { organizationId?: string } = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.organizationId) {
    headers.set('x-organization-id', init.organizationId);
  }

  const response = await fetch(`${TWIN_API_BASE}/api/v1${path}`, {
    ...init,
    headers,
  });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as T | ApiError | null;
  if (!response.ok) {
    const err = payload as ApiError | null;
    throw new TwinApiError(
      err?.message ?? `Request failed with ${response.status}`,
      response.status,
      err?.correlationId,
    );
  }
  return payload as T;
}

export type TwinRecord = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  assetClass: string;
  lifecycleStage: string;
  status: string;
  currencyCode: string;
  tags: string[];
  completenessScore: number;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type TwinPage = {
  data: TwinRecord[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export const twinApi = {
  list: (organizationId: string, query = '?page=1&pageSize=50') =>
    twinFetch<TwinPage>(`/twins${query}`, { organizationId }),
  create: (
    organizationId: string,
    body: {
      name: string;
      slug: string;
      assetClass: string;
      description?: string;
      currencyCode?: string;
      tags?: string[];
    },
  ) =>
    twinFetch<TwinRecord>('/twins', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  get: (organizationId: string, id: string) =>
    twinFetch<TwinRecord>(`/twins/${id}`, { organizationId }),
  publish: (organizationId: string, id: string) =>
    twinFetch<TwinRecord>(`/twins/${id}/publish`, {
      method: 'POST',
      organizationId,
    }),
  listAttributes: (organizationId: string, twinId: string) =>
    twinFetch<unknown[]>(`/twins/${twinId}/attributes`, { organizationId }),
  listInsights: (organizationId: string, twinId: string) =>
    twinFetch<unknown[]>(`/twins/${twinId}/insights`, { organizationId }),
  generateInsight: (organizationId: string, twinId: string) =>
    twinFetch<unknown>(`/twins/${twinId}/insights/generate`, {
      method: 'POST',
      organizationId,
      body: JSON.stringify({ kind: 'summary' }),
    }),
};
