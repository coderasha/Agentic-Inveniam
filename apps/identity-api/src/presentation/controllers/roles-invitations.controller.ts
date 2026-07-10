import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RoleService } from '../../application/identity/role.service';
import {
  ApiKeyService,
  InvitationService,
} from '../../application/identity/invitation-api-key.service';
import {
  AbacPolicyService,
  AuditService,
} from '../../application/identity/audit-abac.service';
import { CurrentContext } from '../decorators/current-context.decorator';
import { Public } from '../decorators/public.decorator';
import type { RequestContext } from '../../domain/identity/auth.types';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(private readonly roles: RoleService) {}

  @Get('permissions')
  @ApiOperation({ summary: 'List permission catalog' })
  listPermissions(@CurrentContext() ctx: RequestContext) {
    return this.roles.listPermissions(ctx);
  }

  @Post()
  @ApiOperation({ summary: 'Create custom role' })
  create(@Body() body: unknown, @CurrentContext() ctx: RequestContext) {
    return this.roles.create(body, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List roles' })
  list(@Query() query: unknown, @CurrentContext() ctx: RequestContext) {
    return this.roles.list(query, ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by id' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.roles.getById(id, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update role' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.roles.update(id, body, ctx);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete role' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { version: number },
    @CurrentContext() ctx: RequestContext,
  ) {
    await this.roles.softDelete(id, body.version, ctx);
  }
}

@ApiTags('Invitations')
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(private readonly invitations: InvitationService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create invitation' })
  create(@Body() body: unknown, @CurrentContext() ctx: RequestContext) {
    return this.invitations.create(body, ctx);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List invitations' })
  list(@Query() query: unknown, @CurrentContext() ctx: RequestContext) {
    return this.invitations.list(query, ctx);
  }

  @Post('accept')
  @Public()
  @ApiOperation({ summary: 'Accept invitation (public)' })
  accept(@Body() body: unknown, @CurrentContext() ctx: RequestContext) {
    return this.invitations.accept(body, ctx);
  }

  @Post(':id/revoke')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke invitation' })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.invitations.revoke(id, ctx);
  }
}

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller({ path: 'api-keys', version: '1' })
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Post()
  @ApiOperation({ summary: 'Create API key (secret returned once)' })
  create(@Body() body: unknown, @CurrentContext() ctx: RequestContext) {
    return this.apiKeys.create(body, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List API keys' })
  list(@Query() query: unknown, @CurrentContext() ctx: RequestContext) {
    return this.apiKeys.list(query, ctx);
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoke API key' })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.apiKeys.revoke(id, ctx);
  }
}

@ApiTags('Audit')
@ApiBearerAuth()
@Controller({ path: 'audit-logs', version: '1' })
export class AuditLogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Query audit logs' })
  list(@Query() query: unknown, @CurrentContext() ctx: RequestContext) {
    return this.audit.list(query, ctx);
  }
}

@ApiTags('ABAC Policies')
@ApiBearerAuth()
@Controller({ path: 'abac-policies', version: '1' })
export class AbacPoliciesController {
  constructor(private readonly policies: AbacPolicyService) {}

  @Post()
  @ApiOperation({ summary: 'Create ABAC policy' })
  create(@Body() body: unknown, @CurrentContext() ctx: RequestContext) {
    return this.policies.create(body, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List ABAC policies' })
  list(@Query() query: unknown, @CurrentContext() ctx: RequestContext) {
    return this.policies.list(query, ctx);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete ABAC policy' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { version: number },
    @CurrentContext() ctx: RequestContext,
  ) {
    await this.policies.softDelete(id, body.version, ctx);
  }
}
