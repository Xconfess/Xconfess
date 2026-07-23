import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { HttpStatus } from '@nestjs/common';

export interface StepUpPayload {
  sub: number;
  stepUp: true;
}

@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const stepUpToken = request.headers['x-step-up-token'];

    if (!stepUpToken) {
      throw new AppException(
        'This action requires recent re-authentication.',
        ErrorCode.AUTH_STEP_UP_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    let payload: StepUpPayload;
    try {
      payload = this.jwtService.verify(stepUpToken);
    } catch (err) {
      throw new AppException(
        'Step-up verification has expired. Please re-authenticate.',
        ErrorCode.AUTH_STEP_UP_EXPIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!payload.stepUp || payload.sub !== request.user?.userId) {
      throw new AppException(
        'This action requires recent re-authentication.',
        ErrorCode.AUTH_STEP_UP_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}