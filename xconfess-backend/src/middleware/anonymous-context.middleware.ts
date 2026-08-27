import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AnonymousUserService } from '../user/anonymous-user.service';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class AnonymousContextMiddleware implements NestMiddleware {
  private readonly ANONYMOUS_CONTEXT_HEADER = 'x-anonymous-context-id';
  private readonly ANONYMOUS_CONTEXT_PREFIX = 'anon_';
  private readonly SESSION_WINDOW_HOURS = 24; // Configurable session window

  constructor(
    @Inject(AnonymousUserService)
    private readonly anonymousUserService: AnonymousUserService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Only add anonymous context for authenticated users
    const authReq = req as Request & { 
      user?: RequestUser;
      anonymousContextId?: string;
      anonymousUser?: any;
    };
    if (authReq.user) {
      try {
        // Get or create anonymous context for this user session
        const anonymousUser = await this.getOrCreateAnonymousContext(
          authReq.user.id,
        );
        const anonymousContextId = `${this.ANONYMOUS_CONTEXT_PREFIX}${anonymousUser.id}`;

        // Add the header to the response (instead of mutating request headers)
        res.setHeader(this.ANONYMOUS_CONTEXT_HEADER, anonymousContextId);

        // Store the anonymous context ID in the request object for later use
        authReq['anonymousContextId'] = anonymousContextId;
        authReq['anonymousUser'] = anonymousUser;
      } catch (error) {
        // Fallback: generate a temporary context ID if service fails
        const fallbackId = this.generateAnonymousContextId();
        res.setHeader(this.ANONYMOUS_CONTEXT_HEADER, fallbackId);
        authReq['anonymousContextId'] = fallbackId;
      }
    }

    next();
  }

  private async getOrCreateAnonymousContext(userId: number) {
    return this.anonymousUserService.getOrCreateForUserSession(
      userId,
      this.SESSION_WINDOW_HOURS,
    );
  }

  private generateAnonymousContextId(): string {
    // Fallback UUID generation for error scenarios
    return `${this.ANONYMOUS_CONTEXT_PREFIX}${uuidv4()}`;
  }
}
