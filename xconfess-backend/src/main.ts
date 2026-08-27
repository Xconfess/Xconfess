import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { WebSocketAdapter } from './websocket/websocket.adapter';
import { AppLogger } from './logger/logger.service';
import { configureRequestBodyParsing } from './common/request-body-limits';

import cookieParser from 'cookie-parser';
import {
  cookieParserMiddleware,
  csrfMiddleware,
  csrfCookieSetter,
} from './common/midleware/middleware';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);

  // â”€â”€ 1. Request-ID must be first so all downstream code sees it â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));

  // Apply targeted limits before Nest validation pipes and controller code.
  configureRequestBodyParsing(app);

  app.enableShutdownHooks();

  // â”€â”€ 2. Security headers â€” single authoritative path for all HTTP responses â”€â”€
  //    SecurityMiddleware is intentionally NOT registered as a Nest middleware
  //    because it was never wired into the middleware consumer.  Applying Helmet
  //    here in bootstrap ensures it runs on every request without exception.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      // helmet v7 removed the xssFilter / noSniff shorthand aliases;
      // xssProtection and noSniff are enabled by default â€” no need to re-declare.
      frameguard: { action: 'deny' },
    }),
  );

  // â”€â”€ 3. CORS â€” one allowed origin derived from config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //    Both HTTP and the WebSocket adapter read FRONTEND_URL so there is a
  //    single documented source of truth for allowed origins.
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  // â”€â”€ 4. WebSocket adapter â€” reads the same FRONTEND_URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.useWebSocketAdapter(new WebSocketAdapter(app, configService));

  // â”€â”€ 5. Compression â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.use(
    compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      threshold: 1024,
    }),
  );


  // ── 6. Cookie parser (required by csurf) ────────────────────────────────────
  app.use(cookieParserMiddleware);

  // ── 7. CSRF protection ────────────────────────────────────────────────────────
  //    Webhooks are exempt because they use HMAC signature verification instead.
  //    Public account-entry routes are exempt because the Next.js proxy calls
  //    them server-side before a browser CSRF cookie exists.
  const csrfExemptRoutes = new Set([
    'POST /api/auth/login',
    'POST /api/auth/2fa/login',
    'POST /api/auth/forgot-password',
    'POST /api/auth/reset-password',
    'POST /api/users/register',
  ]);

  app.use((req, res, next) => {
    const routeKey = `${req.method.toUpperCase()} ${req.path}`;
    if (
      req.path.startsWith('/api/webhooks/moderation') ||
      csrfExemptRoutes.has(routeKey)
    ) {
      return next();
    }
    csrfMiddleware(req as any, res as any, (err) => {
      if (err) return next(err);
      csrfCookieSetter(req as any, res as any, next);
    });
  });
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new HttpExceptionFilter(),
    new ThrottlerExceptionFilter(),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('xConfess API')
      .setDescription(
        'Anonymous confession platform API â€” confessions, reactions, messages, reports, admin, and Stellar integration.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Auth', 'Authentication endpoints')
      .addTag('Users', 'User registration, profile, and settings')
      .addTag(
        'Confessions',
        'Confession CRUD, search, tags, and Stellar anchoring',
      )
      .addTag('Comments', 'Comment CRUD and moderation')
      .addTag('Reactions', 'Emoji reactions on confessions')
      .addTag('Messages', 'Anonymous messaging between users')
      .addTag('Reports', 'Report creation and moderation')
      .addTag('Admin', 'Admin dashboard and RBAC operations')
      .addTag('Admin - Moderation', 'AI moderation review and configuration')
      .addTag('Admin - Comments', 'Admin comment approval and rejection')
      .addTag('Analytics', 'Platform analytics and trending')
      .addTag('Tipping', 'XLM micro-tipping on Stellar')
      .addTag('Stellar', 'Stellar blockchain integration')
      .addTag('Health', 'Health check endpoints')
      .addTag('Data Export', 'GDPR data export and download')
      .addTag('Search Discovery', 'Saved searches and search history')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);

  // â”€â”€ Startup Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const logger = app.get(AppLogger);
  const env = configService.get<string>('NODE_ENV', 'development');
  const dbHost = configService.get<string>('DB_HOST', 'localhost');
  const dbPort = configService.get<number>('DB_PORT', 55432);
  const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
  const redisPort = configService.get<number>('REDIS_PORT', 6379);
  const backgroundJobMode = configService.get<string>('ENABLE_BACKGROUND_JOBS', 'false');
  
  logger.log(
    `ðŸš€ Application started successfully`,
    'Bootstrap'
  );
  logger.log(
    `Environment: ${env} | Port: ${port} | DB: ${dbHost}:${dbPort} | Redis: ${redisHost}:${redisPort} | Background Jobs: ${backgroundJobMode}`,
    'Bootstrap'
  );
}
bootstrap();
