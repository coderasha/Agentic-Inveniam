import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.use(helmet());
  app.enableCors({ origin: config.get<string[]>('app.corsOrigins'), credentials: true });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.enableShutdownHooks();
  const swagger = new DocumentBuilder()
    .setTitle('GAIN Digital Twin API')
    .setDescription('Digital twins, attributes, relationships, signals, and deterministic insights')
    .setVersion('1.0.0').addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-organization-id', in: 'header' }, 'organization')
    .addServer('http://localhost:3002', 'Local').build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger), {
    swaggerOptions: { persistAuthorization: true },
  });
  const port = config.get<number>('app.port') ?? 3002;
  const host = config.get<string>('app.host') ?? '0.0.0.0';
  await app.listen(port, host);
  logger.log(`GAIN Twin API listening on http://${host}:${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap Twin API', error);
  process.exit(1);
});
