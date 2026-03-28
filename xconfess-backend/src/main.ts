import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { WebSocketAdapter } from './websocket/websocket.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // ── 1. Request-ID must be first so all downstream code sees it ──────────────
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));

  app.enableShutdownHooks();

  // ── 2. Security headers — single authoritative path for all HTTP responses ──
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
      // xssProtection and noSniff are enabled by default — no need to re-declare.
      frameguard: { action: 'deny' },
    }),
  );

  // ── 3. CORS — one allowed origin derived from config ────────────────────────
  //    Both HTTP and the WebSocket adapter read FRONTEND_URL so there is a
  //    single documented source of truth for allowed origins.
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  // ── 4. WebSocket adapter — reads the same FRONTEND_URL ──────────────────────
  app.useWebSocketAdapter(new WebSocketAdapter(app, configService));

  // ── 5. Compression ──────────────────────────────────────────────────────────
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

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(
    new HttpExceptionFilter(),
    new ThrottlerExceptionFilter(),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('xConfess API')
      .setDescription(
        'Anonymous confession platform API — confessions, reactions, messages, reports, admin, and Stellar integration.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Auth', 'Authentication endpoints')
      .addTag(
        'Confessions',
        'Confession CRUD, search, tags, and Stellar anchoring',
      )
      .addTag('Reactions', 'Emoji reactions on confessions')
      .addTag('Messages', 'Anonymous messaging between users')
      .addTag('Reports', 'Report creation and moderation')
      .addTag('Admin', 'Admin dashboard and RBAC operations')
      .addTag('Tipping', 'XLM micro-tipping on Stellar')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/api-docs', app, document);
  }

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);
}
bootstrap();
