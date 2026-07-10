import { Body, Controller, Get, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { PrismaService } from '../infrastructure/services';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

@Injectable()
export class NotificationService {
  constructor(private readonly db: PrismaService) {}
  create(input: Record<string, unknown>, p: Principal) {
    if (typeof input.userId !== 'string' || typeof input.title !== 'string' ||
      typeof input.body !== 'string') throw new ValidationError('userId, title and body are required');
    return this.db.notification.create({ data: {
      organizationId: p.organizationId, userId: input.userId, channel: 'in_app', status: 'sent',
      title: input.title, body: input.body, payload: json(input.payload ?? {}), sentAt: new Date(),
    } });
  }
  async mine(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where = {
      userId: p.userId, organizationId: p.organizationId,
      status: query.status as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.notification.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.notification.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  async read(id: string, p: Principal) {
    const item = await this.db.notification.findFirst({
      where: { id, userId: p.userId, organizationId: p.organizationId },
    });
    if (!item) throw new NotFoundError('Notification', id);
    if (item.status === 'failed') throw new ConflictError('Failed notification cannot be marked read');
    if (item.status === 'read') return item;
    return this.db.notification.update({
      where: { id }, data: { status: 'read', readAt: new Date() },
    });
  }
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationController {
  constructor(private readonly service: NotificationService, private readonly auth: AuthorizationService) {}
  @Post()
  create(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'notification:create'); return this.service.create(body, p);
  }
  @Get('me')
  mine(@Query() q: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    return this.service.mine(p, q);
  }
  @Post(':id/read')
  read(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'notification:read', false); return this.service.read(id, p);
  }
}

@Module({ controllers: [NotificationController], providers: [NotificationService] })
export class NotificationModule {}
