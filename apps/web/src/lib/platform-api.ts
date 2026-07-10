import { getSession } from 'next-auth/react';

const PLATFORM_API =
  process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? 'http://localhost:3003';

async function token(): Promise<string | undefined> {
  if (process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN) {
    return process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN;
  }
  const session = await getSession();
  return session?.accessToken;
}

export async function platformFetch<T>(
  path: string,
  init: RequestInit & { organizationId?: string } = {},
): Promise<T> {
  const access = await token();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (access) headers.set('Authorization', `Bearer ${access}`);
  if (init.organizationId) headers.set('x-organization-id', init.organizationId);

  const res = await fetch(`${PLATFORM_API}/api/v1${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (payload as { message?: string } | null)?.message ??
        `Platform API ${res.status}`,
    );
  }
  return payload as T;
}

export const platformApi = {
  listDocuments: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/documents?page=1&pageSize=50',
      { organizationId },
    ),
  createDocument: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/documents', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  listAssets: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/assets?page=1&pageSize=50',
      { organizationId },
    ),
  createAsset: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/assets', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  listWorkflows: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/workflows?page=1&pageSize=50',
      { organizationId },
    ),
  createWorkflow: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/workflows', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  myNotifications: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/notifications/me?page=1&pageSize=50',
      { organizationId },
    ),
  graphStats: (organizationId: string) =>
    platformFetch<{
      nodeCount: number;
      edgeCount: number;
      byKind: Record<string, number>;
      lastSync: Record<string, unknown> | null;
    }>('/graph/stats', { organizationId }),
  graphSubgraph: (organizationId: string) =>
    platformFetch<{
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    }>('/graph/subgraph?limit=200', { organizationId }),
  graphSync: (organizationId: string) =>
    platformFetch<Record<string, unknown>>('/graph/sync', {
      method: 'POST',
      organizationId,
    }),
  createGraphNode: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/graph/nodes', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  createGraphEdge: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/graph/edges', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  graphNeighborhood: (
    organizationId: string,
    nodeId: string,
    depth = 2,
  ) =>
    platformFetch<{
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
      depthByNodeId: Record<string, number>;
      rootNodeId: string;
    }>(`/graph/neighborhood?nodeId=${nodeId}&depth=${depth}&direction=both`, {
      organizationId,
    }),
  listProvenance: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/provenance/records?page=1&pageSize=50',
      { organizationId },
    ),
  createProvenance: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/provenance/records', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  verifyProvenance: (organizationId: string, id: string) =>
    platformFetch<Record<string, unknown>>(`/provenance/records/${id}/verify`, {
      method: 'POST',
      organizationId,
    }),
  verifySubjectChain: (
    organizationId: string,
    subjectType: string,
    subjectId: string,
  ) =>
    platformFetch<{
      valid: boolean;
      brokenAtId?: string;
      reason?: string;
      recordCount: number;
    }>(`/provenance/subjects/${subjectType}/${subjectId}/chain`, {
      organizationId,
    }),
  listAttestations: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/trust/attestations?page=1&pageSize=50',
      { organizationId },
    ),
  createAttestation: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/trust/attestations', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  computeTrustScore: (
    organizationId: string,
    subjectType: string,
    subjectId: string,
  ) =>
    platformFetch<Record<string, unknown>>(
      `/trust/scores/${subjectType}/${subjectId}/compute`,
      { method: 'POST', organizationId },
    ),
  listTrustScores: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/trust/scores?page=1&pageSize=50',
      { organizationId },
    ),
  createTrustAnchor: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/trust/anchors', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  listValuationModels: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/valuations/models?page=1&pageSize=50',
      { organizationId },
    ),
  createValuationModel: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/valuations/models', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  listValuationRuns: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/valuations/runs?page=1&pageSize=50',
      { organizationId },
    ),
  createValuationRun: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/valuations/runs', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  listTokenInstruments: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/tokenization/instruments?page=1&pageSize=50',
      { organizationId },
    ),
  createTokenInstrument: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/tokenization/instruments', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  mintTokens: (organizationId: string, id: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>(`/tokenization/instruments/${id}/mint`, {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  transferTokens: (organizationId: string, id: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>(`/tokenization/instruments/${id}/transfer`, {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  listTokenHoldings: (organizationId: string, id: string) =>
    platformFetch<{ items: Array<Record<string, unknown>> }>(
      `/tokenization/instruments/${id}/holdings`,
      { organizationId },
    ),
  listTokenLedger: (organizationId: string, id: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      `/tokenization/instruments/${id}/ledger?page=1&pageSize=50`,
      { organizationId },
    ),
  listMarketplaceListings: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/marketplace/listings?page=1&pageSize=50',
      { organizationId },
    ),
  createMarketplaceListing: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/marketplace/listings', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  placeMarketplaceOrder: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/marketplace/orders', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  listMarketplaceOrders: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/marketplace/orders?page=1&pageSize=50',
      { organizationId },
    ),
  listMarketplaceTrades: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/marketplace/trades?page=1&pageSize=50',
      { organizationId },
    ),
  listPortfolios: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/portfolios?page=1&pageSize=50',
      { organizationId },
    ),
  createPortfolio: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/portfolios', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  getPortfolio: (organizationId: string, id: string) =>
    platformFetch<Record<string, unknown>>(`/portfolios/${id}`, { organizationId }),
  upsertPortfolioPosition: (
    organizationId: string,
    id: string,
    body: Record<string, unknown>,
  ) =>
    platformFetch<Record<string, unknown>>(`/portfolios/${id}/positions`, {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  getPortfolioNav: (organizationId: string, id: string) =>
    platformFetch<Record<string, unknown>>(`/portfolios/${id}/nav`, { organizationId }),
  createPortfolioSnapshot: (organizationId: string, id: string) =>
    platformFetch<Record<string, unknown>>(`/portfolios/${id}/snapshots`, {
      method: 'POST',
      organizationId,
      body: JSON.stringify({}),
    }),
  listPortfolioSnapshots: (organizationId: string, id: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      `/portfolios/${id}/snapshots?page=1&pageSize=20`,
      { organizationId },
    ),
  crmPipeline: (organizationId: string) =>
    platformFetch<{
      stages: Record<string, number>;
      commitments: Record<string, number | string>;
      investorCount: number;
    }>('/crm/pipeline', { organizationId }),
  listInvestors: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/crm/investors?page=1&pageSize=50',
      { organizationId },
    ),
  createInvestor: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/crm/investors', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  updateInvestor: (
    organizationId: string,
    id: string,
    body: Record<string, unknown>,
  ) =>
    platformFetch<Record<string, unknown>>(`/crm/investors/${id}`, {
      method: 'PATCH',
      organizationId,
      body: JSON.stringify(body),
    }),
  createCrmInteraction: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/crm/interactions', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  createCrmCommitment: (organizationId: string, body: Record<string, unknown>) =>
    platformFetch<Record<string, unknown>>('/crm/commitments', {
      method: 'POST',
      organizationId,
      body: JSON.stringify(body),
    }),
  listCrmCommitments: (organizationId: string) =>
    platformFetch<{ items: Array<Record<string, unknown>>; total: number }>(
      '/crm/commitments?page=1&pageSize=50',
      { organizationId },
    ),
};
