/**
 * SecurityMiddleware — SUPERSEDED
 *
 * Helmet security headers are now applied directly in main.ts via
 * `app.use(helmet(...))` so they are guaranteed to run on every HTTP request
 * regardless of which routes are mounted.
 *
 * This class is retained only to avoid a breaking change for any external code
 * that may import it.  Do NOT register it in AppModule or any middleware
 * consumer — doing so would apply headers twice and could conflict with the
 * bootstrap-level Helmet configuration.
 *
 * @deprecated Use the Helmet call in bootstrap() (src/main.ts) instead.
 */
import helmet from 'helmet';
import { NestMiddleware } from '@nestjs/common';

export class SecurityMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      frameguard: { action: 'deny' },
    })(req, res, next);
  }
}
