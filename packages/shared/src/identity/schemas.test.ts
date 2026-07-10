import { describe, expect, it } from 'vitest';
import {
  SYSTEM_ROLE_PERMISSIONS,
  buildPaginationMeta,
  createOrganizationSchema,
  createUserSchema,
} from './identity/schemas.js';

describe('Identity schemas', () => {
  it('validates organization creation', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'Acme Capital',
      slug: 'acme-capital',
      countryCode: 'US',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid organization slug', () => {
    const result = createOrganizationSchema.safeParse({
      name: 'Acme',
      slug: 'Acme Capital',
    });
    expect(result.success).toBe(false);
  });

  it('validates user creation with E.164 phone', () => {
    const result = createUserSchema.safeParse({
      email: 'jane@acme.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+14155552671',
    });
    expect(result.success).toBe(true);
  });

  it('org_owner has invitation permissions', () => {
    expect(SYSTEM_ROLE_PERMISSIONS.org_owner).toContain(
      'identity:invitation:create',
    );
  });

  it('builds pagination meta correctly', () => {
    const meta = buildPaginationMeta(2, 20, 45);
    expect(meta.totalPages).toBe(3);
    expect(meta.hasNextPage).toBe(true);
    expect(meta.hasPreviousPage).toBe(true);
  });
});
