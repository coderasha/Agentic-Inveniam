import type {
  AbacPolicyResponse,
  CreateAbacPolicyInput,
  PaginationQuery,
} from '@gain/shared';

export interface AbacPolicyListFilters extends PaginationQuery {
  organizationId: string;
  resourceType?: string;
  enabled?: boolean;
}

export interface AbacPolicyRepository {
  create(input: CreateAbacPolicyInput): Promise<AbacPolicyResponse>;
  findById(id: string): Promise<AbacPolicyResponse | null>;
  list(filters: AbacPolicyListFilters): Promise<{
    items: AbacPolicyResponse[];
    total: number;
  }>;
  findApplicable(params: {
    organizationId: string;
    resourceType: string;
    action: string;
  }): Promise<AbacPolicyResponse[]>;
  softDelete(id: string, version: number): Promise<void>;
}
