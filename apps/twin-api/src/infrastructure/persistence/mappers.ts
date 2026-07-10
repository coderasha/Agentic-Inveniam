import type {
  DigitalTwin, TwinAttribute, TwinInsight, TwinRelationship, TwinSignal,
} from '../../domain/twin/models';

export const mapTwin = (row: any): DigitalTwin => ({
  ...row, metadata: row.metadata as Record<string, unknown>,
});
export const mapAttribute = (row: any): TwinAttribute => ({
  ...row, value: row.value as unknown,
});
export const mapRelationship = (row: any): TwinRelationship => ({
  ...row, metadata: row.metadata as Record<string, unknown>,
});
export const mapSignal = (row: any): TwinSignal => ({
  ...row, payload: row.payload as Record<string, unknown>,
});
export const mapInsight = (row: any): TwinInsight => ({
  ...row, evidence: row.evidence as Record<string, unknown>,
});
