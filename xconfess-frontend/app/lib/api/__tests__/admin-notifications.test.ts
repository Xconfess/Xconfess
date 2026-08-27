import { adminApi } from '../admin';
import apiClient from '../client';
import type { FailedJobsResponse, ReplayJobResponse } from '../../types/notification-jobs';

jest.mock('../client');

describe('Admin API - Notification Jobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFailedNotificationJobs', () => {
    it('should fetch failed notification jobs with default parameters', async () => {
      const mockResponse: FailedJobsResponse = {
        jobs: [
          {
            id: 'job-1',
            name: 'comment-notification',
            attemptsMade: 3,
            maxAttempts: 3,
            failedReason: 'SMTP timeout',
            failedAt: '2024-02-20T10:00:00Z',
            createdAt: '2024-02-20T09:00:00Z',
            channel: 'email',
            recipientEmail: 'user@example.com',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await adminApi.getFailedNotificationJobs();

      expect(apiClient.get).toHaveBeenCalledWith('/api/admin/dlq', {
        params: {
          page: 1,
          limit: 20,
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fetch failed notification jobs with custom filters', async () => {
      const mockResponse: FailedJobsResponse = {
        jobs: [],
        total: 0,
        page: 2,
        limit: 10,
      };

      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockResponse });

      const filter = {
        page: 2,
        limit: 10,
        startDate: '2024-02-01',
        endDate: '2024-02-28',
        minRetries: 2,
      };

      await adminApi.getFailedNotificationJobs(filter);

      expect(apiClient.get).toHaveBeenCalledWith('/api/admin/dlq', {
        params: {
          page: 2,
          limit: 10,
          failedAfter: new Date('2024-02-01').toISOString(),
          failedBefore: new Date('2024-02-28').toISOString(),
        },
      });
    });

    it('should handle API errors gracefully', async () => {
      const error = new Error('Network error');
      (apiClient.get as jest.Mock).mockRejectedValue(error);

      await expect(adminApi.getFailedNotificationJobs()).rejects.toThrow('Network error');
    });

    it('should not depend on localStorage admin mock toggles', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: { jobs: [], total: 0, page: 1, limit: 20 },
      });

      const getItem = jest.fn();
      Object.defineProperty(window, 'localStorage', {
        value: { getItem },
        writable: true,
      });

      await adminApi.getFailedNotificationJobs();

      expect(getItem).not.toHaveBeenCalled();
    });
  });

  describe('replayFailedNotificationJob', () => {
    it('should replay a failed notification job', async () => {
      const mockResponse: ReplayJobResponse = {
        id: 'job-123',
        outcome: 'replayed',
        replayJobId: 'dlq-replay:job-123',
        newJobId: 'dlq-replay:job-123',
      };

      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await adminApi.replayFailedNotificationJob('job-123');

      expect(apiClient.post).toHaveBeenCalledWith('/api/admin/dlq/job-123/retry', {
        reason: undefined,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should replay a failed notification job with reason', async () => {
      const mockResponse: ReplayJobResponse = {
        id: 'job-123',
        outcome: 'replayed',
        replayJobId: 'dlq-replay:job-123',
        newJobId: 'dlq-replay:job-123',
      };

      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      const reason = 'Manual retry after fixing SMTP configuration';
      await adminApi.replayFailedNotificationJob('job-123', reason);

      expect(apiClient.post).toHaveBeenCalledWith('/api/admin/dlq/job-123/retry', {
        reason,
      });
    });

    it('should handle replay errors', async () => {
      const error = new Error('Job not found');
      (apiClient.post as jest.Mock).mockRejectedValue(error);

      await expect(adminApi.replayFailedNotificationJob('invalid-job')).rejects.toThrow(
        'Job not found'
      );
    });

    it('should handle concurrent replay requests', async () => {
      const mockResponse: ReplayJobResponse = {
        id: 'job-123',
        outcome: 'replayed',
        replayJobId: 'dlq-replay:job-123',
        newJobId: 'dlq-replay:job-123',
      };

      (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

      // Fire multiple requests concurrently
      const promises = [
        adminApi.replayFailedNotificationJob('job-123'),
        adminApi.replayFailedNotificationJob('job-456'),
        adminApi.replayFailedNotificationJob('job-789'),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(apiClient.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('Type Safety', () => {
    it('should enforce correct filter types', async () => {
      const mockResponse: FailedJobsResponse = {
        jobs: [],
        total: 0,
        page: 1,
        limit: 20,
      };

      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockResponse });

      // TypeScript should enforce these types at compile time
      const validFilter = {
        status: 'failed' as const,
        page: 1,
        limit: 20,
        startDate: '2024-02-01',
        endDate: '2024-02-28',
        minRetries: 2,
      };

      await adminApi.getFailedNotificationJobs(validFilter);

      expect(apiClient.get).toHaveBeenCalled();
    });

    it('should return properly typed response', async () => {
      const mockResponse: FailedJobsResponse = {
        jobs: [
          {
            id: 'job-1',
            name: 'comment-notification',
            attemptsMade: 3,
            maxAttempts: 3,
            failedReason: 'SMTP timeout',
            failedAt: '2024-02-20T10:00:00Z',
            createdAt: '2024-02-20T09:00:00Z',
            channel: 'email',
            recipientEmail: 'user@example.com',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };

      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await adminApi.getFailedNotificationJobs();

      // TypeScript should infer these types correctly
      expect(typeof result.total).toBe('number');
      expect(typeof result.page).toBe('number');
      expect(typeof result.limit).toBe('number');
      expect(Array.isArray(result.jobs)).toBe(true);

      if (result.jobs.length > 0) {
        const job = result.jobs[0];
        expect(typeof job.id).toBe('string');
        expect(typeof job.attemptsMade).toBe('number');
        expect(typeof job.maxAttempts).toBe('number');
      }
    });
  });
});