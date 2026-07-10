import {
  ArgumentsHost, Catch, Controller, ExceptionFilter, Get, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { KafkaPublisher, PrismaService, RedisService } from '../infrastructure/services';
import { DomainError } from './errors';
import { Public } from './auth';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request & { correlationId?: string }>();
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'An unexpected error occurred';
    let details: Record<string, unknown>[] | undefined;
    if (exception instanceof DomainError) {
      ({ statusCode, code: error, message, details } = exception);
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else {
        const value = body as Record<string, unknown>;
        message = Array.isArray(value.message) ? value.message.join(', ') : String(value.message ?? message);
        error = String(value.error ?? error);
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }
    response.status(statusCode).json({
      statusCode, error, message, details, correlationId: request.correlationId ?? uuidv4(),
      timestamp: new Date().toISOString(), path: request.url,
    });
  }
}

@ApiTags('Health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: PrismaHealthIndicator,
    private readonly db: PrismaService,
    private readonly redis: RedisService,
    private readonly kafka: KafkaPublisher,
  ) {}
  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.indicator.pingCheck('database', this.db),
      async () => ({ redis: { status: await this.redis.ping() ? 'up' : 'down' } }),
      async () => ({ kafka: { status: await this.kafka.isHealthy() ? 'up' : 'down' } }),
    ]);
  }
  @Get('live')
  @Public()
  live() { return { status: 'ok', service: 'gain-platform-api' }; }
  @Get('ready')
  @Public()
  @HealthCheck()
  ready() { return this.health.check([() => this.indicator.pingCheck('database', this.db)]); }
}
