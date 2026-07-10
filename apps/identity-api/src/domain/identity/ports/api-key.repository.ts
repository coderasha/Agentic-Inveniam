import type {
  ApiKeyResponse,
  CreateApiKeyInput,
  PaginationQuery,
} from '@gain/shared';

export interface ApiKeyListFilters extends PaginationQuery {
  organizationId?: string;
}

export interface ApiKeyRepository {
  create(params: {
    input: CreateApiKeyInput;
    keyPrefix: string;
    keyHash: string;
    createdByUserId: string;
    scopes: string[];
  }): Promise<ApiKeyResponse>;
  findById(id: string): Promise<ApiKeyResponse | null>;
  findByKeyHash(keyHash: string): Promise<{
    apiKey: ApiKeyResponse;
    organizationId: string;
    scopes: string[];
    roleSlugs: string[];
  } | null>;
  list(filters: ApiKeyListFilters): Promise<{
    items: ApiKeyResponse[];
    total: number;
  }>;
  revoke(id: string, revokedAt: Date): Promise<ApiKeyResponse>;
  touchLastUsed(id: string, at: Date): Promise<void>;
}
