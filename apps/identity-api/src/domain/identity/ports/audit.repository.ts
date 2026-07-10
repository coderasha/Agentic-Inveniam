import type { AuditAction, AuditLogResponse, PaginationQuery } from '@gain/shared';

export interface AuditListFilters extends PaginationQuery {
  organizationId?: string;
  actorUserId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: AuditAction;
}

export interface CreateAuditEntryInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  actorType: 'user' | 'api_key' | 'system' | 'service';
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  correlationId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  changes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface AuditRepository {
  create(input: CreateAuditEntryInput): Promise<AuditLogResponse>;
  list(filters: AuditListFilters): Promise<{
    items: AuditLogResponse[];
    total: number;
  }>;
}
