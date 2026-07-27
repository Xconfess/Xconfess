import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { StepUpService } from '../step-up.service';
import { AuthenticatedRequest } from '../interfaces/jwt-payload.interface';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';

/**
 * Header carrying the step-up proof issued by `POST /auth/step-up`.
 */
export const STEP_UP_TOKEN_HEADER = 'x-step-up-token';

/**
 * Gates destructive endpoints behind a recent step-up proof. Must run after
 * {@link JwtAuthGuard} so `request.user` is populated.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(private readonly stepUpService: StepUpService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new AppException(
        'User is not authenticated',
        ErrorCode.AUTH_UNAUTHORIZED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const header = request.headers[STEP_UP_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;

    this.stepUpService.assertValidProof(request.user.id, token);

    return true;
  }
}
