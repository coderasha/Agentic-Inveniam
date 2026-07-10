export type TwinStatus = 'draft' | 'active' | 'suspended' | 'archived';
export type TwinAssetClass =
  | 'real_estate' | 'private_equity' | 'private_credit' | 'infrastructure'
  | 'fund' | 'collectible' | 'operating_company' | 'other';
export type TwinLifecycleStage =
  | 'origination' | 'diligence' | 'under_management' | 'exit' | 'retired';
export type AttributeDataType =
  | 'string' | 'number' | 'boolean' | 'datetime' | 'json' | 'money' | 'percentage';
export type RelationshipType =
  | 'parent_of' | 'child_of' | 'related_to' | 'collateral_for'
  | 'owned_by' | 'managed_by' | 'depends_on';
export type SignalSeverity = 'info' | 'warning' | 'critical';
export type InsightKind = 'summary' | 'risk';

export interface DigitalTwin {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  assetClass: TwinAssetClass;
  lifecycleStage: TwinLifecycleStage;
  status: TwinStatus;
  externalReference: string | null;
  currencyCode: string;
  tags: string[];
  metadata: Record<string, unknown>;
  completenessScore: number;
  publishedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TwinAttribute {
  id: string; twinId: string; key: string; label: string;
  dataType: AttributeDataType; value: unknown; unit: string | null;
  source: string | null; confidence: number | null; effectiveAt: Date | null;
  version: number; createdAt: Date; updatedAt: Date; deletedAt: Date | null;
}

export interface TwinRelationship {
  id: string; organizationId: string; fromTwinId: string; toTwinId: string;
  relationshipType: RelationshipType; label: string | null;
  metadata: Record<string, unknown>; createdAt: Date; updatedAt: Date; deletedAt: Date | null;
}

export interface TwinSignal {
  id: string; twinId: string; signalType: string; severity: SignalSeverity;
  title: string; payload: Record<string, unknown>; source: string | null;
  observedAt: Date; createdAt: Date;
}

export interface TwinInsight {
  id: string; twinId: string; kind: InsightKind; title: string; summary: string;
  confidence: number; model: string | null; evidence: Record<string, unknown>;
  generatedAt: Date; createdAt: Date;
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface ListQuery { page?: number; pageSize?: number }
