import apiClient from './client';
import type {
  FailedJobsResponse,
  FailedJobsFilter,
  ReplayJobResponse,
} from '../types/notification-jobs';
import type { StellarDiagnosticsResponse } from '../types/stellar';

export interface Report {
  id: string;
  confessionId: string;
  confession?: {
    id: string;
    message: string;
    created_at: string;
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
  adminId: number;
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
  createdAt: string;
}

export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
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

export const adminApi = {
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

  // Confessions
  deleteConfession: async (id: string, reason?: string) => {
    const response = await apiClient.delete(`/api/admin/confessions/${id}`, {
      data: { reason },
    });
    return response.data;
  },

  hideConfession: async (id: string, reason?: string) => {
    const response = await apiClient.patch(`/api/admin/confessions/${id}/hide`, {
      reason,
    });
    return response.data;
  },

  unhideConfession: async (id: string) => {
    const response = await apiClient.patch(`/api/admin/confessions/${id}/unhide`);
    return response.data;
  },

  // Users
  searchUsers: async (query: string, limit = 50, offset = 0) => {
    const response = await apiClient.get('/api/admin/users/search', {
      params: { q: query, limit, offset },
    });
    return response.data;
  },

  getUserHistory: async (id: string) => {
    const response = await apiClient.get(`/api/admin/users/${id}/history`);
    return response.data;
  },

  banUser: async (id: string, reason?: string) => {
    const response = await apiClient.patch(`/api/admin/users/${id}/ban`, {
      reason,
    });
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

  getStellarDiagnostics: async (): Promise<StellarDiagnosticsResponse> => {
    const response = await apiClient.get('/api/stellar/admin/diagnostics');
    return response.data;
  },

  // Audit Logs
  getAuditLogs: async (params?: {
    adminId?: number;
    action?: string;
    entityType?: string;
    entityId?: string;
    requestId?: string;
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

    const response = await apiClient.get('/admin/notifications/dlq', { params });
    return response.data;
  },

  replayFailedNotificationJob: async (jobId: string, reason?: string): Promise<ReplayJobResponse> => {
    const response = await apiClient.post(`/admin/notifications/dlq/${jobId}/replay`, {
      reason,
    });
    return response.data;
  },
};
