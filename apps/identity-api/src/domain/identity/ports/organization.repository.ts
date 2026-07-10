import type {
  CreateOrganizationInput,
  OrganizationResponse,
  OrganizationStatus,
  PaginationQuery,
  UpdateOrganizationInput,
} from '@gain/shared';

export interface OrganizationListFilters extends PaginationQuery {
  status?: OrganizationStatus;
  parentOrganizationId?: string;
}

export interface OrganizationRepository {
  create(
    input: CreateOrganizationInput,
    actorUserId: string | null,
  ): Promise<OrganizationResponse>;
  findById(id: string, includeDeleted?: boolean): Promise<OrganizationResponse | null>;
  findBySlug(slug: string): Promise<OrganizationResponse | null>;
  list(filters: OrganizationListFilters): Promise<{
    items: OrganizationResponse[];
    total: number;
  }>;
  update(
    id: string,
    input: UpdateOrganizationInput,
    actorUserId: string | null,
  ): Promise<OrganizationResponse>;
  softDelete(id: string, version: number, actorUserId: string | null): Promise<void>;
}
