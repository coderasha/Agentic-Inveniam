import { describe, expect, it, vi } from 'vitest';
import { AuthorizationService } from '../src/application/identity/authorization.service';
import type { AbacPolicyRepository } from '../src/domain/identity/ports/abac-policy.repository';
import type { RequestContext } from '../src/domain/identity/auth.types';
import { ForbiddenError } from '../src/domain/identity/errors';

function ctx(permissions: string[]): RequestContext {
  return {
    principal: {
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'admin@gain.network',
      organizationId: '22222222-2222-2222-2222-222222222222',
      permissions: permissions as never[],
      roles: ['org_owner'],
      correlationId: '33333333-3333-3333-3333-333333333333',
      actorType: 'user',
    },
  };
}

describe('AuthorizationService', () => {
  const abac: AbacPolicyRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    findApplicable: vi.fn().mockResolvedValue([]),
    softDelete: vi.fn(),
  };

  const authz = new AuthorizationService(abac);

  it('allows when permission is present', () => {
    expect(() =>
      authz.requirePermission(ctx(['identity:organization:read']), 'identity:organization:read'),
    ).not.toThrow();
  });

  it('denies when permission is missing', () => {
    expect(() =>
      authz.requirePermission(ctx([]), 'identity:organization:delete'),
    ).toThrow(ForbiddenError);
  });

  it('evaluates deny ABAC policies as blocking', async () => {
    vi.mocked(abac.findApplicable).mockResolvedValueOnce([
      {
        id: '44444444-4444-4444-4444-444444444444',
        organizationId: '22222222-2222-2222-2222-222222222222',
        name: 'deny-delete',
        effect: 'deny',
        resourceType: 'organization',
        actions: ['delete'],
        conditions: {},
        priority: 1,
        enabled: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const allowed = await authz.evaluateAbac({
      ctx: ctx(['identity:organization:delete']),
      organizationId: '22222222-2222-2222-2222-222222222222',
      resourceType: 'organization',
      action: 'delete',
    });
    expect(allowed).toBe(false);
  });
});
