import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.use(helmet());
  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins'),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GAIN Identity API')
    .setDescription(
      'Global Asset Intelligence Network — Identity, Organizations, RBAC/ABAC, Invitations, API Keys, Audit',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', name: 'x-api-key', in: 'header' },
      'api-key',
    )
    .addServer('http://localhost:3001', 'Local')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get<number>('app.port') ?? 3001;
  const host = config.get<string>('app.host') ?? '0.0.0.0';
  await app.listen(port, host);
  logger.log(`GAIN Identity API listening on http://${host}:${port}`);
  logger.log(`OpenAPI docs at http://${host}:${port}/api/docs`);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap Identity API', error);
  process.exit(1);
});
