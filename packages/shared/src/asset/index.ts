export const ASSET_PERMISSIONS = [
  'asset:create',
  'asset:read',
  'asset:update',
  'asset:delete',
  'asset:valuate',
] as const;

export type AssetPermission = (typeof ASSET_PERMISSIONS)[number];
