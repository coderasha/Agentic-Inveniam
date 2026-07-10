import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { KafkaEventPublisher, RedisCacheService } from '../infrastructure/adapters';
import { PrismaService } from '../infrastructure/persistence/prisma.service';
import { Public } from './auth';

@ApiTags('Health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisCacheService,
    private readonly kafka: KafkaEventPublisher,
  ) {}
  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      async () => ({ redis: { status: await this.redis.ping() ? 'up' : 'down' } }),
      async () => ({ kafka: { status: await this.kafka.isHealthy() ? 'up' : 'down' } }),
    ]);
  }
  @Get('live')
  @Public()
  live() { return { status: 'ok', service: 'gain-twin-api' }; }
  @Get('ready')
  @Public()
  @HealthCheck()
  ready() { return this.health.check([() => this.prismaIndicator.pingCheck('database', this.prisma)]); }
}
