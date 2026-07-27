import {
  requestStepUp,
  isStepUpError,
  getErrorCode,
  stepUpHeader,
  StepUpErrorCode,
  STEP_UP_TOKEN_HEADER,
} from '../stepUp';
import { adminApi } from '../admin';
import apiClient from '../client';

jest.mock('../client');

describe('stepUp API', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('requestStepUp', () => {
    it('posts the credential and returns the proof', async () => {
      const proof = { stepUpToken: 'proof-123', expiresIn: 300 };
      (apiClient.post as jest.Mock).mockResolvedValue({ data: proof });

      const result = await requestStepUp({ password: 'hunter2' });

      expect(apiClient.post).toHaveBeenCalledWith('/api/auth/step-up', {
        password: 'hunter2',
      });
      expect(result).toEqual(proof);
    });
  });

  describe('isStepUpError / getErrorCode', () => {
    it.each([
      StepUpErrorCode.REQUIRED,
      StepUpErrorCode.EXPIRED,
      StepUpErrorCode.INVALID,
    ])('detects the %s step-up error code', (code) => {
      const error = { response: { data: { code } } };
      expect(getErrorCode(error)).toBe(code);
      expect(isStepUpError(error)).toBe(true);
    });

    it('ignores unrelated errors', () => {
      expect(isStepUpError({ response: { data: { code: 'NOT_FOUND' } } })).toBe(
        false,
      );
      expect(isStepUpError(new Error('network'))).toBe(false);
      expect(isStepUpError(undefined)).toBe(false);
    });
  });

  describe('stepUpHeader', () => {
    it('builds the header when a token is present', () => {
      expect(stepUpHeader('proof-123')).toEqual({
        [STEP_UP_TOKEN_HEADER]: 'proof-123',
      });
    });

    it('returns undefined when no token is provided', () => {
      expect(stepUpHeader()).toBeUndefined();
    });
  });

  describe('adminApi destructive actions attach the step-up proof', () => {
    it('sends the proof header when deleting a confession', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      await adminApi.deleteConfession('c-1', 'spam', 'proof-123');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/admin/confessions/c-1', {
        data: { reason: 'spam' },
        headers: { [STEP_UP_TOKEN_HEADER]: 'proof-123' },
      });
    });

    it('sends the proof header when banning a user', async () => {
      (apiClient.patch as jest.Mock).mockResolvedValue({ data: {} });

      await adminApi.banUser('7', 'abuse', 30, 'proof-123');

      expect(apiClient.patch).toHaveBeenCalledWith(
        '/api/admin/users/7/ban',
        { reason: 'abuse', durationDays: 30 },
        { headers: { [STEP_UP_TOKEN_HEADER]: 'proof-123' } },
      );
    });

    it('omits the proof header when no token is supplied', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      await adminApi.deleteConfession('c-1', 'spam');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/admin/confessions/c-1', {
        data: { reason: 'spam' },
        headers: undefined,
      });
    });
  });
});
