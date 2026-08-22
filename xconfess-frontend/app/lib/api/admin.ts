import apiClient from './client';
import { stepUpHeader } from './stepUp';
import type {
  FailedJobsResponse,
  FailedJobsFilter,
  ReplayJobResponse,
  BulkReplayResponse,
} from '../types/notification-jobs';

export interface Report {
  id: string;
  confessionId: string;
  confession?: {
    id: string;
    message: string;
    created_at: string;
    isDeleted?: boolean;
    isHidden?: boolean;
  };
  reporterId: number | null;
  reporter?: {
    id: number;
    username: string;
  };
  type: 'spam' | 'harassment' | 'hate_speech' | 'inappropriate_content' | 'copyright' | 'other';
  reason: string | null;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  resolvedBy: number | null;
  resolver?: {
    id: number;
    username: string;
  };
  resolvedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  adminId: number | null;
  admin?: {
    id: number;
    username: string;
  };
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, any> | null;
  notes: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

export type AdminUserRole = 'user' | 'moderator' | 'admin';

export interface User {
  id: number;
  username: string;
  role: AdminUserRole;
  isAdmin: boolean;
  is_active: boolean;
  confessionCount?: number;
  reportsReceived?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserHistoryResponse {
  user: User;
  summary?: {
    confessionCount: number;
    reportsFiled: number;
    reportsReceived: number;
  };
  confessions: Array<Record<string, any>>;
  reports: Array<Record<string, any>>;
  activityTimeline?: Array<{
    id: string;
    type: string;
    label: string;
    createdAt: string;
    summary?: string;
  }>;
  note?: string;
}

export interface Analytics {
  overview: {
    totalUsers: number;
    activeUsers: number;
    totalConfessions: number;
    totalReports: number;
    bannedUsers: number;
    hiddenConfessions: number;
    deletedConfessions: number;
  };
  reports: {
    byStatus: Array<{ status: string; count: string }>;
    byType: Array<{ type: string; count: string }>;
  };
  trends: {
    confessionsOverTime: Array<{ date: string; count: string }>;
  };
  period: {
    start: string;
    end: string;
  };
}

export interface AdminObservabilityResponse {
  audit: {
    totalLogs: number;
    actionTypeCounts: Array<{ actionType: string; count: number }>;
  };
  notifications: {
    main: {
      active: number;
      waiting: number;
      failed: number;
    };
    dlq: {
      failed: number;
      waiting: number;
      delayed: number;
    };
  };
  generatedAt: string;
}

export interface ReportStats {
  pendingCount: number;
  oldestUnresolvedAge: number | null;
  resolvedTodayCount: number;
}

export interface SystemHealthResponse {
  status: 'ok' | 'error';
  details?: Record<string, { status: string; [key: string]: any }>;
  error?: string;
}

export const adminApi = {
  getSystemHealth: async (): Promise<SystemHealthResponse> => {
    const response = await apiClient.get('/api/health/ready');
    return response.data;
  },

  requestStepUp: async (payload: { password?: string; totpToken?: string }) => {
    const response = await apiClient.post('/api/auth/step-up', payload);
    return response.data as { stepUpToken: string; expiresIn: number };
  },

  // Reports
  getReports: async (params?: {
    status?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get('/api/admin/reports', { params });
    return response.data;
  },

  getReport: async (id: string) => {
    const response = await apiClient.get(`/api/admin/reports/${id}`);
    return response.data;
  },

  resolveReport: async (id: string, resolutionNotes?: string) => {
    const response = await apiClient.patch(`/api/admin/reports/${id}/resolve`, {
      resolutionNotes,
    });
    return response.data;
  },

  dismissReport: async (id: string, notes?: string) => {
    const response = await apiClient.patch(`/api/admin/reports/${id}/dismiss`, {
      resolutionNotes: notes,
    });
    return response.data;
  },

  bulkResolveReports: async (reportIds: string[], notes?: string) => {
    const response = await apiClient.patch('/api/admin/reports/bulk-resolve', {
      reportIds,
      notes,
    });
    return response.data;
  },

  // Report stats
  getReportStats: async () => {
    const response = await apiClient.get('/api/admin/reports/stats');
    return response.data as ReportStats;
  },


  // Destructive actions require a recent step-up proof (see requestStepUp).
  deleteConfession: async (id: string, reason?: string, stepUpToken?: string) => {
    const response = await apiClient.delete(`/api/admin/confessions/${id}`, {
      data: { reason },
      headers: stepUpHeader(stepUpToken),
    });
    return response.data;
  },

  hideConfession: async (id: string, reason?: string, stepUpToken?: string) => {
    const response = await apiClient.patch(
      `/api/admin/confessions/${id}/hide`,
      { reason },
      { headers: stepUpHeader(stepUpToken) },
    );

    return response.data;
  },

  unhideConfession: async (id: string) => {
    const response = await apiClient.patch(`/api/admin/confessions/${id}/unhide`);
    return response.data;
  },

  // Users
  searchUsers: async (
    query: string,
    limit = 50,
    offset = 0,
    sortBy: 'createdAt' | 'username' | 'role' | 'status' = 'createdAt',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ) => {
    const response = await apiClient.get('/api/admin/users/search', {
      params: { q: query || undefined, limit, offset, sortBy, sortOrder },
    });
    return response.data;
  },

  getUserHistory: async (id: string): Promise<UserHistoryResponse> => {
    const response = await apiClient.get(`/api/admin/users/${id}/history`);
    return response.data;
  },

  updateUserRole: async (
    id: string,
    role: AdminUserRole,
    stepUpToken?: string,
  ) => {
    const response = await apiClient.patch(
      `/api/admin/users/${id}/role`,
      { role },
      { headers: stepUpHeader(stepUpToken) },
    );
    return response.data;
  },

  banUser: async (
    id: string,
    reason?: string,
    durationDays?: number | null,
    stepUpToken?: string,
  ) => {
    const response = await apiClient.patch(
      `/api/admin/users/${id}/ban`,
      { reason, durationDays },
      { headers: stepUpHeader(stepUpToken) },
    );

    return response.data;
  },

  unbanUser: async (id: string) => {
    const response = await apiClient.patch(`/api/admin/users/${id}/unban`);
    return response.data;
  },

  // Analytics
  getAnalytics: async (startDate?: string, endDate?: string) => {
    const response = await apiClient.get('/api/admin/analytics', {
      params: { startDate, endDate },
    });
    return response.data;
  },

  getObservability: async (startDate?: string, endDate?: string) => {
    const response = await apiClient.get('/api/admin/observability', {
      params: { startDate, endDate },
    });
    return response.data as AdminObservabilityResponse;
  },

  // Audit Logs
  getAuditLogs: async (params?: {
    adminId?: number;
    action?: string;
    entityType?: string;
    entityId?: string;
    requestId?: string;
    actor?: string;
    search?: string;
    sortBy?: 'createdAt' | 'actor' | 'action' | 'target';
    sortOrder?: 'ASC' | 'DESC';
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get('/api/admin/audit-logs', {
      params: {
        ...params,
        startDate: params?.startDate || undefined,
        endDate: params?.endDate || undefined,
      },
    });
    return response.data;
  },

  // Failed Notification Jobs
  getFailedNotificationJobs: async (filter?: FailedJobsFilter): Promise<FailedJobsResponse> => {
    const params: Record<string, any> = {
      page: filter?.page ?? 1,
      limit: filter?.limit ?? 20,
    };

    if (filter?.startDate) {
      params.failedAfter = new Date(filter.startDate).toISOString();
    }
    if (filter?.endDate) {
      params.failedBefore = new Date(filter.endDate).toISOString();
    }

    const response = await apiClient.get('/api/admin/dlq', { params });
    return response.data;
  },

  replayFailedNotificationJob: async (jobId: string, reason?: string): Promise<ReplayJobResponse> => {
    const response = await apiClient.post(`/api/admin/dlq/${jobId}/retry`, {
      reason,
    });
    return response.data;
  },

  bulkReplayJobs: async (jobIds: string[]): Promise<BulkReplayResponse> => {
    const response = await apiClient.post('/api/admin/dlq/replay', { jobIds });
    return response.data;
  },

  exportDlqCsv: async (filter?: FailedJobsFilter): Promise<void> => {
    const params: Record<string, any> = {};
    if (filter?.startDate) {
      params.failedAfter = new Date(filter.startDate).toISOString();
    }
    if (filter?.endDate) {
      params.failedBefore = new Date(filter.endDate).toISOString();
    }

    const response = await apiClient.get('/api/admin/dlq/export-csv', {
      params,
      responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dlq-jobs-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};