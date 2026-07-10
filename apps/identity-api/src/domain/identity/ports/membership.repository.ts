import type {
  CreateMembershipInput,
  MembershipResponse,
  PaginationQuery,
  UpdateMembershipInput,
} from '@gain/shared';

export interface MembershipListFilters extends PaginationQuery {
  organizationId?: string;
  userId?: string;
}

export interface MembershipRepository {
  create(input: CreateMembershipInput): Promise<MembershipResponse>;
  findById(id: string): Promise<MembershipResponse | null>;
  findByUserAndOrg(
    userId: string,
    organizationId: string,
  ): Promise<MembershipResponse | null>;
  list(filters: MembershipListFilters): Promise<{
    items: MembershipResponse[];
    total: number;
  }>;
  update(id: string, input: UpdateMembershipInput): Promise<MembershipResponse>;
  softDelete(id: string, version: number): Promise<void>;
  getEffectivePermissions(
    userId: string,
    organizationId: string,
  ): Promise<string[]>;
}
