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
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationService } from '../../application/identity/organization.service';
import { CurrentContext } from '../decorators/current-context.decorator';
import type { RequestContext } from '../../domain/identity/auth.types';

@ApiTags('Organizations')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: false })
@ApiHeader({ name: 'x-correlation-id', required: false })
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationService) {}

  @Post()
  @ApiOperation({ summary: 'Create organization' })
  create(@Body() body: unknown, @CurrentContext() ctx: RequestContext) {
    return this.organizations.create(body, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List organizations' })
  list(@Query() query: unknown, @CurrentContext() ctx: RequestContext) {
    return this.organizations.list(query, ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by id' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.organizations.getById(id, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update organization' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.organizations.update(id, body, ctx);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete organization' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { version: number },
    @CurrentContext() ctx: RequestContext,
  ) {
    await this.organizations.softDelete(id, body.version, ctx);
  }
}
