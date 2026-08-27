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
      xssFilter: true,
      noSniff: true,
      frameguard: { action: 'deny' },
    })(req, res, next);
  }
}
