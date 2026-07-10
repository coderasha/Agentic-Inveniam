import type {
  CreateInvitationInput,
  InvitationResponse,
  InvitationStatus,
  PaginationQuery,
} from '@gain/shared';

export interface InvitationListFilters extends PaginationQuery {
  organizationId?: string;
  status?: InvitationStatus;
  email?: string;
}

export interface InvitationRecord extends InvitationResponse {
  tokenHash: string;
}

export interface InvitationRepository {
  create(
    input: CreateInvitationInput,
    tokenHash: string,
    invitedByUserId: string,
    expiresAt: Date,
  ): Promise<InvitationResponse>;
  findById(id: string): Promise<InvitationRecord | null>;
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  list(filters: InvitationListFilters): Promise<{
    items: InvitationResponse[];
    total: number;
  }>;
  accept(
    id: string,
    acceptedAt: Date,
  ): Promise<InvitationResponse>;
  revoke(id: string, revokedAt: Date): Promise<InvitationResponse>;
  expireStale(now: Date): Promise<number>;
}
