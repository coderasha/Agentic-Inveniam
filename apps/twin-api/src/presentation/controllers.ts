import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AttributeService, AuthorizationService, InsightService, RelationshipService,
  SignalService, TwinService,
} from '../application/services';
import type { AuthenticatedPrincipal } from '../domain/twin/auth.types';
import type { CreateTwinInput, UpdateTwinInput, UpsertAttributeInput } from '../domain/twin/ports';
import type { RelationshipType, SignalSeverity } from '../domain/twin/models';
import { CurrentPrincipal } from './auth';

@ApiBearerAuth()
@ApiTags('Twins')
@Controller({ path: 'twins', version: '1' })
export class TwinsController {
  constructor(private readonly service: TwinService, private readonly authz: AuthorizationService) {}
  @Post()
  create(@Body() body: Omit<CreateTwinInput, 'organizationId'>, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:create');
    return this.service.create(body, p);
  }
  @Get()
  list(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    this.authz.require(p, 'twin:read');
    return this.service.list(p, { page: page ? Number(page) : undefined, pageSize: pageSize ? Number(pageSize) : undefined });
  }
  @Get(':id')
  get(@Param('id') id: string, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:read');
    return this.service.get(id, p);
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateTwinInput, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:update');
    return this.service.update(id, body, p);
  }
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:delete');
    return this.service.softDelete(id, p);
  }
  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:publish');
    return this.service.publish(id, p);
  }
}

@ApiBearerAuth()
@ApiTags('Twin attributes')
@Controller({ path: 'twins/:twinId/attributes', version: '1' })
export class AttributesController {
  constructor(private readonly service: AttributeService, private readonly authz: AuthorizationService) {}
  @Post()
  upsert(@Param('twinId') twinId: string, @Body() body: UpsertAttributeInput, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:update');
    return this.service.upsert(twinId, body, p);
  }
  @Get()
  list(@Param('twinId') twinId: string, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:read');
    return this.service.list(twinId, p);
  }
}

interface RelationshipBody {
  toTwinId: string; relationshipType: RelationshipType;
  label?: string; metadata?: Record<string, unknown>;
}
@ApiBearerAuth()
@ApiTags('Twin relationships')
@Controller({ path: 'twins/:twinId/relationships', version: '1' })
export class RelationshipsController {
  constructor(private readonly service: RelationshipService, private readonly authz: AuthorizationService) {}
  @Post()
  create(@Param('twinId') twinId: string, @Body() body: RelationshipBody, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:update');
    return this.service.create(twinId, body, p);
  }
  @Get()
  list(@Param('twinId') twinId: string, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:read');
    return this.service.list(twinId, p);
  }
}

interface SignalBody {
  signalType: string; severity: SignalSeverity; title: string;
  payload: Record<string, unknown>; source?: string; observedAt: string;
}
@ApiBearerAuth()
@ApiTags('Twin signals')
@Controller({ path: 'twins/:twinId/signals', version: '1' })
export class SignalsController {
  constructor(private readonly service: SignalService, private readonly authz: AuthorizationService) {}
  @Post()
  ingest(@Param('twinId') twinId: string, @Body() body: SignalBody, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:signal:ingest');
    return this.service.ingest(twinId, { ...body, observedAt: new Date(body.observedAt) }, p);
  }
  @Get()
  list(
    @Param('twinId') twinId: string, @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    this.authz.require(p, 'twin:read');
    return this.service.list(twinId, p, limit);
  }
}

@ApiBearerAuth()
@ApiTags('Twin insights')
@Controller({ path: 'twins/:twinId/insights', version: '1' })
export class InsightsController {
  constructor(private readonly service: InsightService, private readonly authz: AuthorizationService) {}
  @Post('generate')
  generate(@Param('twinId') twinId: string, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:insight:generate');
    return this.service.generate(twinId, p);
  }
  @Get()
  list(@Param('twinId') twinId: string, @CurrentPrincipal() p: AuthenticatedPrincipal) {
    this.authz.require(p, 'twin:read');
    return this.service.list(twinId, p);
  }
}
