import { Injectable } from '@nestjs/common';
import type { Permission } from '@gain/shared';
import type { RequestContext } from '../../domain/identity/auth.types';
import { ForbiddenError } from '../../domain/identity/errors';
import type { AbacPolicyRepository } from '../../domain/identity/ports/abac-policy.repository';
import { Inject } from '@nestjs/common';
import { ABAC_POLICY_REPOSITORY } from '../../domain/identity/tokens';

@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(ABAC_POLICY_REPOSITORY)
    private readonly abacPolicies: AbacPolicyRepository,
  ) {}

  hasPermission(ctx: RequestContext, permission: Permission): boolean {
    return ctx.principal.permissions.includes(permission);
  }

  requirePermission(ctx: RequestContext, permission: Permission): void {
    if (!this.hasPermission(ctx, permission)) {
      throw new ForbiddenError(
        `Missing required permission: ${permission}`,
      );
    }
  }

  requireAnyPermission(
    ctx: RequestContext,
    permissions: Permission[],
  ): void {
    if (!permissions.some((p) => this.hasPermission(ctx, p))) {
      throw new ForbiddenError(
        `Missing one of required permissions: ${permissions.join(', ')}`,
      );
    }
  }

  /**
   * Evaluates ABAC policies after RBAC. Deny overrides allow.
   * Conditions support simple equality checks against principal attributes.
   */
  async evaluateAbac(params: {
    ctx: RequestContext;
    organizationId: string;
    resourceType: string;
    action: string;
    resourceAttributes?: Record<string, unknown>;
  }): Promise<boolean> {
    const policies = await this.abacPolicies.findApplicable({
      organizationId: params.organizationId,
      resourceType: params.resourceType,
      action: params.action,
    });

    if (policies.length === 0) {
      return true;
    }

    let allowed = false;
    for (const policy of policies) {
      if (!this.matchesConditions(policy.conditions, params)) {
        continue;
      }
      if (policy.effect === 'deny') {
        return false;
      }
      allowed = true;
    }
    return allowed;
  }

  async requireAbac(params: {
    ctx: RequestContext;
    organizationId: string;
    resourceType: string;
    action: string;
    resourceAttributes?: Record<string, unknown>;
  }): Promise<void> {
    const ok = await this.evaluateAbac(params);
    if (!ok) {
      throw new ForbiddenError('Access denied by attribute-based policy');
    }
  }

  private matchesConditions(
    conditions: Record<string, unknown>,
    params: {
      ctx: RequestContext;
      resourceAttributes?: Record<string, unknown>;
    },
  ): boolean {
    const context: Record<string, unknown> = {
      userId: params.ctx.principal.userId,
      email: params.ctx.principal.email,
      organizationId: params.ctx.principal.organizationId,
      roles: params.ctx.principal.roles,
      ...(params.resourceAttributes ?? {}),
    };

    for (const [key, expected] of Object.entries(conditions)) {
      const actual = context[key];
      if (Array.isArray(expected)) {
        if (!expected.includes(actual)) {
          return false;
        }
      } else if (actual !== expected) {
        return false;
      }
    }
    return true;
  }
}
