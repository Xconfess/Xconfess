'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/app/lib/api/admin';
import { queryKeys } from '@/app/lib/api/queryKeys';
import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';
import { TableSkeleton } from '@/app/components/common/SkeletonLoader';
import type { FailedNotificationJob, FailedJobsFilter } from '@/app/lib/types/notification-jobs';
import { useDebounce } from '@/app/lib/hooks/useDebounce';
import { useAdminConfirmation } from '@/app/components/admin/useAdminConfirmation';
import { useDLQFilterState } from '@/app/lib/hooks/useDLQFilterState';

export default function NotificationsPage() {
  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--foreground)]">
            Failed Notification Jobs
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Monitor and replay failed notification delivery attempts
          </p>
        </div>
        <FailedJobsList />
      </div>
    </ErrorBoundary>
  );
}

function FailedJobsList() {
  const queryClient = useQueryClient();
  const {
    page,
    setPage,
    statusFilter,
    setStatusFilter,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    minRetries,
    setMinRetries,
  } = useDLQFilterState();
  const [pendingReplays, setPendingReplays] = useState<Set<string>>(new Set());
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkReplaySummary, setBulkReplaySummary] = useState<string | null>(null);
  const { openConfirmation, confirmDialog } = useAdminConfirmation();

  const debouncedStartDate = useDebounce(startDate, 500);
  const debouncedEndDate = useDebounce(endDate, 500);

  const filter: FailedJobsFilter = useMemo(
    () => ({
      status: statusFilter,
      startDate: debouncedStartDate || undefined,
      endDate: debouncedEndDate || undefined,
      minRetries,
      page,
      limit: 20,
    }),
    [statusFilter, debouncedStartDate, debouncedEndDate, minRetries, page]
  );

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.admin.notificationJobs.list(filter as Record<string, unknown>),
    queryFn: () => adminApi.getFailedNotificationJobs(filter),
    staleTime: 30000,
  });

  const replayMutation = useMutation({
    mutationFn: (jobId: string) => adminApi.replayFailedNotificationJob(jobId),
    onMutate: async (jobId) => {
      setPendingReplays((prev) => new Set(prev).add(jobId));
      await queryClient.cancelQueries({ queryKey: queryKeys.admin.notificationJobs.all() });
      const previousData = queryClient.getQueryData(
        queryKeys.admin.notificationJobs.list(filter as Record<string, unknown>)
      );
      queryClient.setQueryData(
        queryKeys.admin.notificationJobs.list(filter as Record<string, unknown>),
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            jobs: old.jobs.map((job: FailedNotificationJob) =>
              job.id === jobId ? { ...job, _replaying: true } : job
            ),
          };
        }
      );
      return { previousData };
    },
    onSuccess: (_data, jobId) => {
      setPendingReplays((prev) => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
      refetch();
    },
    onError: (error, jobId, context) => {
      setPendingReplays((prev) => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
      if (context?.previousData) {
        queryClient.setQueryData(
          queryKeys.admin.notificationJobs.list(filter as Record<string, unknown>),
          context.previousData
        );
      }
      console.error('Failed to replay job:', error);
    },
  });

  const bulkReplayMutation = useMutation({
    mutationFn: (jobIds: string[]) => adminApi.bulkReplayJobs(jobIds),
    onSuccess: (result) => {
      const parts: string[] = [];
      if (result.replayed > 0) parts.push(`${result.replayed} replayed`);
      if (result.deduplicated > 0) parts.push(`${result.deduplicated} deduplicated`);
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      setBulkReplaySummary(parts.length > 0 ? parts.join(', ') + '.' : 'No jobs processed.');
      setSelectedJobIds(new Set());
      setTimeout(() => setBulkReplaySummary(null), 5000);
      refetch();
    },
    onError: () => {
      setBulkReplaySummary('Bulk replay failed. Please try again.');
      setTimeout(() => setBulkReplaySummary(null), 5000);
    },
  });

  const handleReplayClick = useCallback((jobId: string) => {
    if (pendingReplays.has(jobId)) return;
    openConfirmation({
      title: 'Replay Failed Job',
      description:
        'Are you sure you want to replay this failed notification job? This will attempt to resend the notification.',
      confirmLabel: 'Replay',
      action: () => replayMutation.mutateAsync(jobId),
      successMessage: 'Failed notification job replay queued.',
      errorMessage: 'Failed to replay notification job.',
    });
  }, [openConfirmation, pendingReplays, replayMutation]);

  const handleBulkReplayClick = useCallback(() => {
    if (selectedJobIds.size === 0) return;
    openConfirmation({
      title: `Replay ${selectedJobIds.size} Failed Job${selectedJobIds.size > 1 ? 's' : ''}`,
      description: `Are you sure you want to replay ${selectedJobIds.size} selected failed notification job${selectedJobIds.size > 1 ? 's' : ''}? This will attempt to resend each notification.`,
      confirmLabel: `Replay ${selectedJobIds.size}`,
      action: () => bulkReplayMutation.mutateAsync(Array.from(selectedJobIds)),
      successMessage: 'Bulk replay completed.',
      errorMessage: 'Bulk replay failed.',
    });
  }, [selectedJobIds, openConfirmation, bulkReplayMutation]);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (!data) return;
    if (checked) {
      setSelectedJobIds(new Set(data.jobs.map((job) => job.id)));
    } else {
      setSelectedJobIds(new Set());
    }
  }, [data]);

  const handleSelectJob = useCallback((jobId: string, checked: boolean) => {
    setSelectedJobIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(jobId);
      } else {
        newSet.delete(jobId);
      }
      return newSet;
    });
  }, []);

  const handleExportCsv = useCallback(() => {
    adminApi.exportDlqCsv(filter);
  }, [filter]);

  const totalPages = data ? Math.ceil(data.total / (filter.limit || 20)) : 0;
  const allSelected = data ? data.jobs.length > 0 && data.jobs.every((job) => selectedJobIds.has(job.id)) : false;

  if (error) {
    return (
      <div className="bg-[var(--danger)]/10 border border-[var(--danger)]/30 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[var(--danger)]" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="text-sm font-medium text-[var(--foreground)]">
            Failed to load notification jobs. Please try again.
          </p>
        </div>
        <button onClick={() => refetch()} className="mt-3 text-sm text-[var(--danger)] hover:text-[var(--foreground)] font-medium">
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Filters */}
      <div className="border border-[var(--border)] bg-[var(--surface)] rounded-lg p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="dlq-status" className="block text-sm font-medium text-[var(--secondary)] mb-2">Status</label>
            <select id="dlq-status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as 'failed' | 'all'); }}
              className="w-full rounded-md border-[var(--accent-border)] shadow-sm focus:border-[var(--focus-ring)] focus:ring-[var(--focus-ring)]">
              <option value="failed">Failed Only</option>
              <option value="all">All</option>
            </select>
          </div>
          <div>
            <label htmlFor="dlq-start-date" className="block text-sm font-medium text-[var(--secondary)] mb-2">Start Date</label>
            <input id="dlq-start-date" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); }}
              className="w-full rounded-md border-[var(--accent-border)] shadow-sm focus:border-[var(--focus-ring)] focus:ring-[var(--focus-ring)]" />
          </div>
          <div>
            <label htmlFor="dlq-end-date" className="block text-sm font-medium text-[var(--secondary)] mb-2">End Date</label>
            <input id="dlq-end-date" type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); }}
              className="w-full rounded-md border-[var(--accent-border)] shadow-sm focus:border-[var(--focus-ring)] focus:ring-[var(--focus-ring)]" />
          </div>
          <div>
            <label htmlFor="dlq-min-retries" className="block text-sm font-medium text-[var(--secondary)] mb-2">Min Retries</label>
            <input id="dlq-min-retries" type="number" min="0" value={minRetries ?? ''} onChange={(e) => { const val = e.target.value ? parseInt(e.target.value, 10) : undefined; setMinRetries(val); }} placeholder="Any"
              className="w-full rounded-md border-[var(--accent-border)] shadow-sm focus:border-[var(--focus-ring)] focus:ring-[var(--focus-ring)]" />
          </div>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {data && data.jobs.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-[var(--secondary)]">
            {selectedJobIds.size > 0
              ? `${selectedJobIds.size} of ${data.jobs.length} selected`
              : `${data.jobs.length} job${data.jobs.length > 1 ? 's' : ''} on this page`}
          </span>
          <button
            onClick={handleBulkReplayClick}
            disabled={selectedJobIds.size === 0 || bulkReplayMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--primary)] rounded-md hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {bulkReplayMutation.isPending ? (
              <>Replaying...</>
            ) : (
              <>Replay Selected ({selectedJobIds.size})</>
            )}
          </button>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--secondary)] bg-[var(--surface)] border border-[var(--accent-border)] rounded-md hover:bg-[var(--surface-muted)] transition"
          >
            Export CSV
          </button>
        </div>
      )}

      {/* Bulk replay summary toast */}
      {bulkReplaySummary && (
        <div className="bg-[var(--accent-soft)] border border-[var(--accent-border)] rounded-lg px-4 py-3 text-sm text-[var(--primary-deep)]">
          {bulkReplaySummary}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="border border-[var(--border)] bg-[var(--surface)] rounded-lg p-6">
          <TableSkeleton rows={5} cols={7} />
        </div>
      ) : !data || data.jobs.length === 0 ? (
        <div className="border border-[var(--border)] bg-[var(--surface)] rounded-lg p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-[var(--foreground)]">No failed jobs found</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">All notification jobs are processing successfully.</p>
        </div>
      ) : (
        <div className="bg-[var(--surface)] shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)]">
              <thead className="bg-[var(--surface-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-[var(--accent-border)] text-[var(--primary-deep)] focus:ring-[var(--focus-ring)]"
                      aria-label="Select all on page"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Job ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Channel</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Recipient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Retries</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Failure Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Failed At</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--surface)] divide-y divide-[var(--border)]">
                {data.jobs.map((job) => {
                  const isReplaying = pendingReplays.has(job.id);
                  const isSelected = selectedJobIds.has(job.id);
                  return (
                    <tr key={job.id} className={`hover:bg-[var(--surface-muted)] transition-colors ${isSelected ? 'bg-[var(--accent-soft)]' : ''}`}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectJob(job.id, e.target.checked)}
                          className="rounded border-[var(--accent-border)] text-[var(--primary-deep)] focus:ring-[var(--focus-ring)]"
                          aria-label={`Select job ${job.id.substring(0, 12)}`}
                        />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-mono text-[var(--foreground)]">
                        {job.id.substring(0, 12)}...
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-[var(--foreground)]">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-soft)] text-[var(--primary-deep)]">{job.channel}</span>
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--foreground)] max-w-xs truncate">
                        {sanitizeEmail(job.recipientEmail)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-[var(--foreground)]">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          job.attemptsMade >= job.maxAttempts
                            ? 'bg-[var(--danger)]/10 text-[var(--foreground)]'
                            : 'bg-[var(--warning)]/10 text-[var(--foreground)]'
                        }`}>
                          {job.attemptsMade}/{job.maxAttempts}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--foreground)] max-w-md">
                        <div className="truncate" title={job.failedReason || 'Unknown'}>{truncateText(job.failedReason || 'Unknown', 50)}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-[var(--text-muted)]">
                        {job.failedAt ? formatDate(job.failedAt) : 'N/A'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleReplayClick(job.id)}
                          disabled={isReplaying}
                          className="text-[var(--primary-deep)] hover:text-[var(--primary-deep)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isReplaying ? 'Replaying...' : 'Replay'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-between bg-[var(--surface)] px-4 py-3 rounded-lg shadow">
          <div className="text-sm text-[var(--secondary)]">
            Showing {(page - 1) * (filter.limit || 20) + 1} to {Math.min(page * (filter.limit || 20), data.total)} of {data.total} results
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              className="px-4 py-2 text-sm font-medium text-[var(--secondary)] bg-[var(--surface)] border border-[var(--accent-border)] rounded-md hover:bg-[var(--surface-muted)] disabled:opacity-50 disabled:cursor-not-allowed">
              Previous
            </button>
            <span className="px-4 py-2 text-sm text-[var(--secondary)]">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium text-[var(--secondary)] bg-[var(--surface)] border border-[var(--accent-border)] rounded-md hover:bg-[var(--surface-muted)] disabled:opacity-50 disabled:cursor-not-allowed">
              Next
            </button>
          </div>
        </div>
      )}

      {confirmDialog}
    </>
  );
}

function sanitizeEmail(email?: string): string {
  if (!email) return 'N/A';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.length > 1 ? `${local[0]}***` : local;
  return `${maskedLocal}@${domain}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}