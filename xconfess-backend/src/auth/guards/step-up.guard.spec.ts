import { ExecutionContext } from '@nestjs/common';
import { StepUpGuard, STEP_UP_TOKEN_HEADER } from './step-up.guard';
import { StepUpService } from '../step-up.service';
import { AppException } from '../../common/errors/app-exception';
import { ErrorCode } from '../../common/errors/error-codes';

describe('StepUpGuard', () => {
  let stepUpService: { assertValidProof: jest.Mock };
  let guard: StepUpGuard;

  const buildContext = (request: any): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    stepUpService = { assertValidProof: jest.fn() };
    guard = new StepUpGuard(stepUpService as unknown as StepUpService);
  });

  it('delegates the header token and user id to the service', () => {
    const request = {
      user: { id: 7 },
      headers: { [STEP_UP_TOKEN_HEADER]: 'proof-token' },
    };

    expect(guard.canActivate(buildContext(request))).toBe(true);
    expect(stepUpService.assertValidProof).toHaveBeenCalledWith(
      7,
      'proof-token',
    );
  });

  it('normalizes an array-valued header', () => {
    const request = {
      user: { id: 7 },
      headers: { [STEP_UP_TOKEN_HEADER]: ['first', 'second'] },
    };

    guard.canActivate(buildContext(request));
    expect(stepUpService.assertValidProof).toHaveBeenCalledWith(7, 'first');
  });

  it('rejects an unauthenticated request', () => {
    const request = { headers: {} };

    try {
      guard.canActivate(buildContext(request));
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).getResponse()).toMatchObject({
        code: ErrorCode.AUTH_UNAUTHORIZED,
      });
    }
    expect(stepUpService.assertValidProof).not.toHaveBeenCalled();
  });

  it('propagates the service rejection when the proof is missing', () => {
    stepUpService.assertValidProof.mockImplementation(() => {
      throw new AppException('required', ErrorCode.AUTH_STEP_UP_REQUIRED, 403);
    });
    const request = { user: { id: 7 }, headers: {} };

    expect(() => guard.canActivate(buildContext(request))).toThrow(
      AppException,
    );
    expect(stepUpService.assertValidProof).toHaveBeenCalledWith(7, undefined);
  });
});
