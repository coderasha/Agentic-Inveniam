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
import { UserService } from '../../application/identity/user.service';
import { MembershipService } from '../../application/identity/membership.service';
import { CurrentContext } from '../decorators/current-context.decorator';
import type { RequestContext } from '../../domain/identity/auth.types';

@ApiTags('Users')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: false })
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UserService) {}

  @Post()
  @ApiOperation({ summary: 'Create user' })
  create(@Body() body: unknown, @CurrentContext() ctx: RequestContext) {
    return this.users.create(body, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List users' })
  list(@Query() query: unknown, @CurrentContext() ctx: RequestContext) {
    return this.users.list(query, ctx);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  me(@CurrentContext() ctx: RequestContext) {
    return this.users.getById(ctx.principal.userId, ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.users.getById(id, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.users.update(id, body, ctx);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete user' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { version: number },
    @CurrentContext() ctx: RequestContext,
  ) {
    await this.users.softDelete(id, body.version, ctx);
  }
}

@ApiTags('Memberships')
@ApiBearerAuth()
@Controller({ path: 'memberships', version: '1' })
export class MembershipsController {
  constructor(private readonly memberships: MembershipService) {}

  @Post()
  @ApiOperation({ summary: 'Create membership' })
  create(@Body() body: unknown, @CurrentContext() ctx: RequestContext) {
    return this.memberships.create(body, ctx);
  }

  @Get()
  @ApiOperation({ summary: 'List memberships' })
  list(@Query() query: unknown, @CurrentContext() ctx: RequestContext) {
    return this.memberships.list(query, ctx);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get membership by id' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.memberships.getById(id, ctx);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update membership' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentContext() ctx: RequestContext,
  ) {
    return this.memberships.update(id, body, ctx);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove membership' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { version: number },
    @CurrentContext() ctx: RequestContext,
  ) {
    await this.memberships.softDelete(id, body.version, ctx);
  }
}
