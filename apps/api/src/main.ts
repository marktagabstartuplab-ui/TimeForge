import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('[boot] starting NestFactory.create — about to instantiate all modules (DB/Redis connections happen here)');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  console.log('[boot] NestFactory.create resolved — all modules instantiated successfully');

  app.useLogger(app.get(Logger));
  console.log('[boot] logger attached');

  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  // Trust proxy for correct IP detection behind reverse proxies (affects rate limiting + security logs)
  (app as any).set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      errorHttpStatusCode: 422,
    }),
  );

  const originsStr = String(config.get('corsOrigins') ?? '').trim();
  if (!originsStr) {
    app.get(Logger).warn('CORS_ORIGINS is empty — CORS disabled');
  } else {
    const origins = originsStr.split(',').map((o) => o.trim()).filter(Boolean);
    app.enableCors({ origin: origins, credentials: true });
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TimeForge API')
    .setDescription('Workforce Performance, Timesheet and Daily Scrum Management System')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(config.get('apiPort') ?? 3000);
  console.log(`[boot] about to listen on port ${port}`);
  await app.listen(port);
  console.log('[boot] app.listen resolved — server is up');
  app.get(Logger).log(`TimeForge API listening on http://localhost:${port}/api/v1`);
  app.get(Logger).log(`Swagger docs at http://localhost:${port}/api/docs`);
}

process.on('unhandledRejection', (reason) => {
  console.error('[boot] unhandledRejection', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[boot] uncaughtException', err);
});

bootstrap().catch((err) => {
  console.error('[boot] bootstrap() rejected', err);
  process.exit(1);
});
