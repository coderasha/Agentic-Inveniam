import type {
  CreateRoleInput,
  PaginationQuery,
  RoleResponse,
  UpdateRoleInput,
} from '@gain/shared';

export interface RoleListFilters extends PaginationQuery {
  organizationId?: string | null;
  includeSystem?: boolean;
}

export interface RoleRepository {
  create(input: CreateRoleInput): Promise<RoleResponse>;
  findById(id: string): Promise<RoleResponse | null>;
  findByIds(ids: string[]): Promise<RoleResponse[]>;
  list(filters: RoleListFilters): Promise<{ items: RoleResponse[]; total: number }>;
  update(id: string, input: UpdateRoleInput): Promise<RoleResponse>;
  softDelete(id: string, version: number): Promise<void>;
}
