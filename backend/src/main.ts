import { setDefaultResultOrder } from 'dns';
import { setDefaultAutoSelectFamily } from 'net';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

// Managed Postgres hosts (Neon/RDS) publish BOTH A and AAAA records. Where IPv6 is advertised but not
// routable, Node's dual-stack "happy eyeballs" connect stalls on the AAAA addresses instead of failing
// over — the `AggregateError [ETIMEDOUT] at internalConnectMultiple` seen on login, analytics and lead
// calls. Measured on this network: connecting by hostname times out after 12s, while the same host with
// autoSelectFamily disabled connects in ~275ms. Pin lookups to IPv4 and connect to the first address.
setDefaultResultOrder('ipv4first');
setDefaultAutoSelectFamily(false);

async function bootstrap() {
  // Fail fast: the app must never boot without a JWT secret (no insecure fallback).
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');

  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.use(helmet());
  app.setGlobalPrefix(process.env.API_PREFIX || 'api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('Lead360 API')
    .setDescription('AI proposal & budget studio')
    .setVersion('0.1.0')
    .addCookieAuth('access_token')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
