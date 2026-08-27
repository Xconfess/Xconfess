/**
 * Type definitions for failed notification jobs
 */

export interface FailedNotificationJob {
  id: string;
  name: string;
  attemptsMade: number;
  maxAttempts: number;
  failedReason: string | null;
  failedAt: string | null;
  createdAt: string | null;
  channel: string;
  recipientEmail?: string;
}

export interface FailedJobsResponse {
  jobs: FailedNotificationJob[];
  total: number;
  page: number;
  limit: number;
}

export interface FailedJobsFilter {
  status?: 'failed' | 'all';
  startDate?: string;
  endDate?: string;
  minRetries?: number;
  page?: number;
  limit?: number;
}

export interface ReplayJobResponse {
  id: string;
  outcome: 'replayed' | 'deduplicated' | 'failed';
  replayJobId: string;
  newJobId: string | null;
}

export interface BulkReplayResponse {
  operationId: string;
  attempted: number;
  replayed: number;
  deduplicated: number;
  failed: number;
  noOp: boolean;
  outcomes: Array<{
    jobId: string;
    originalJobId: string | null;
    replayJobId: string;
    outcome: 'replayed' | 'deduplicated' | 'failed';
    newJobId?: string;
    existingJobId?: string;
    error?: string;
  }>;
}