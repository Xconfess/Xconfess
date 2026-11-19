'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Report, adminApi } from '@/app/lib/api/admin';
import { MODERATION_TEMPLATES } from '@/app/lib/utils/moderationTemplates';
import {
  ReportModerationTimeline,
  buildReportModerationTimeline,
} from '@/app/components/admin/ReportModerationTimeline';
import { queryKeys } from '@/app/lib/api/queryKeys';
import { useAdminConfirmation } from '@/app/components/admin/useAdminConfirmation';

interface ReportDetailProps {
  report: Report;
  onBack: () => void;
  onActionSuccess: () => void;
}
export default function ReportDetail({
  report,
  onBack,
  onActionSuccess,
}: ReportDetailProps) {
  const [resolutionNotes, setResolutionNotes] = useState('');
  const queryClient = useQueryClient();
  const { openConfirmation, confirmDialog } = useAdminConfirmation();

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      adminApi.resolveReport(id, notes),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-reports'] });
      const previousData = queryClient.getQueryData(['admin-reports']);
      queryClient.setQueriesData({ queryKey: ['admin-reports'] }, (old: any) => {
        if (!old?.reports) return old;
        return {
          ...old,
          reports: old.reports.map((r: Report) =>
            r.id === id ? { ...r, status: 'resolved' } : r,
          ),
        };
      });
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueriesData({ queryKey: ['admin-reports'] }, context.previousData);
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.reports.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.auditLogs.byEntity('report', id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.auditLogs.byEntity('confession', report.confessionId) });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      adminApi.dismissReport(id, notes),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-reports'] });
      const previousData = queryClient.getQueryData(['admin-reports']);
      queryClient.setQueriesData({ queryKey: ['admin-reports'] }, (old: any) => {
        if (!old?.reports) return old;
        return {
          ...old,
          reports: old.reports.map((r: Report) =>
            r.id === id ? { ...r, status: 'dismissed' } : r,
          ),
        };
      });
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueriesData({ queryKey: ['admin-reports'] }, context.previousData);
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.reports.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.auditLogs.byEntity('report', id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.auditLogs.byEntity('confession', report.confessionId) });
    },
  });

  const [reportAuditQ, confessionAuditQ] = useQueries({
    queries: [
      {
        queryKey: queryKeys.admin.auditLogs.byEntity('report', report.id),
        queryFn: () =>
          adminApi.getAuditLogs({
            entityType: 'report',
            entityId: report.id,
            limit: 50,
          }),
      },
      {
        queryKey: queryKeys.admin.auditLogs.byEntity('confession', report.confessionId),
        queryFn: () =>
          adminApi.getAuditLogs({
            entityType: 'confession',
            entityId: report.confessionId,
            limit: 80,
          }),
        enabled: Boolean(report.confessionId),
      },
    ],
  });

  const timelineEntries = useMemo(
    () =>
      buildReportModerationTimeline(
        report,
        reportAuditQ.data?.logs,
        confessionAuditQ.data?.logs,
      ),
    [report, reportAuditQ.data?.logs, confessionAuditQ.data?.logs],
  );

  const timelineLoading =
    reportAuditQ.isPending || (Boolean(report.confessionId) && confessionAuditQ.isPending);

  const timelineError =
    reportAuditQ.isError &&
    (!report.confessionId || confessionAuditQ.isError);

  const confirmResolve = () => {
    openConfirmation({
      title: 'Resolve report?',
      description:
        'Resolve this report and record your moderation notes against it.',
      consequences: [
        'The report is closed and leaves the pending queue.',
        'Your moderation notes are saved to the audit log.',
        'The reported confession stays visible unless you also hide or delete it.',
      ],
      confirmLabel: 'Resolve',
      action: () =>
        resolveMutation.mutateAsync({
          id: report.id,
          notes: resolutionNotes || undefined,
        }),
      successMessage: 'Report resolved.',
      errorMessage: 'Failed to resolve report',
      onSuccess: () => {
        onActionSuccess();
      },
    });
  };

  const confirmDismiss = () => {
    openConfirmation({
      title: 'Dismiss report?',
      description:
        'Dismiss this report and record your moderation notes against it.',
      consequences: [
        'The report is closed and leaves the pending queue.',
        'Your dismissal notes are saved to the audit log.',
        'The reported confession stays visible and unchanged.',
      ],
      confirmLabel: 'Dismiss',
      action: () =>
        dismissMutation.mutateAsync({
          id: report.id,
          notes: resolutionNotes || undefined,
        }),
      successMessage: 'Report dismissed.',
      errorMessage: 'Failed to dismiss report',
      onSuccess: () => {
        onActionSuccess();
      },
    });
  };

  const confirmDelete = () => {
    openConfirmation({
      title: 'Delete confession?',
      description:
        'Permanently delete the reported confession. This removes the content for every user.',
      consequences: [
        'The confession and its comments are permanently removed for everyone.',
        'This cannot be undone — the content cannot be restored.',
        'The report stays open until you resolve or dismiss it.',
      ],
      confirmLabel: 'Delete',
      variant: 'danger',
      action: () =>
        adminApi.deleteConfession(
          report.confessionId,
          'Deleted via report resolution',
        ),
      successMessage: 'Confession deleted successfully',
      errorMessage: 'Failed to delete confession',
      onSuccess: () => {
        onBack();
      },
    });
  };

  const confirmHide = () => {
    openConfirmation({
      title: 'Hide confession?',
      description:
        'Hide the reported confession from the public feed. Moderators keep access to it.',
      consequences: [
        'The confession disappears from the feed and from search results.',
        'It is kept for moderators and can be restored later.',
        'The report stays open until you resolve or dismiss it.',
      ],
      confirmLabel: 'Hide',
      variant: 'danger',
      action: () =>
        adminApi.hideConfession(
          report.confessionId,
          'Hidden via report resolution',
        ),
      successMessage: 'Confession hidden successfully',
      errorMessage: 'Failed to hide confession',
      onSuccess: () => {
        onBack();
      },
    });
  };

  const pending = report.status === 'pending';

  return (
    <div className="space-y-6">
      {confirmDialog}

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-[var(--primary-deep)] hover:text-[var(--primary-deep)]"
        >
          Back to Reports
        </button>
      </div>

      <div
        className={
          pending
            ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_min(100%,22rem)] lg:items-start lg:gap-8'
            : ''
        }
      >
        <div className="min-w-0 space-y-6">
          <div className="border border-[var(--border)] space-y-6 rounded-lg bg-[var(--surface)] p-6">
            <div>
              <h3 className="mb-4 text-lg font-medium text-[var(--foreground)]">
                Report Details
              </h3>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-[var(--text-muted)]">ID</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">{report.id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-[var(--text-muted)]">Type</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">{report.type}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-[var(--text-muted)]">Status</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        report.status === 'pending'
                          ? 'bg-[var(--warning)]/10 text-[var(--foreground)]'
                          : report.status === 'resolved'
                            ? 'bg-[var(--success)]/10 text-[var(--foreground)]'
                            : 'bg-[var(--surface-muted)] text-[var(--foreground)]'
                      }`}
                    >
                      {report.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-[var(--text-muted)]">Reporter</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {report.reporter?.username || 'Anonymous'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-[var(--text-muted)]">Created</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {new Date(report.createdAt).toLocaleString()}
                  </dd>
                </div>
                {report.resolvedAt && (
                  <div>
                    <dt className="text-sm font-medium text-[var(--text-muted)]">
                      Resolved
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--foreground)]">
                      {new Date(report.resolvedAt).toLocaleString()}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {report.reason && (
              <div>
                <dt className="mb-2 text-sm font-medium text-[var(--text-muted)]">
                  Reason
                </dt>
                <dd className="rounded bg-[var(--surface-muted)] p-3 text-sm text-[var(--foreground)]">
                  {report.reason}
                </dd>
              </div>
            )}

            {report.resolutionNotes && (
              <div>
                <dt className="mb-2 text-sm font-medium text-[var(--text-muted)]">
                  Resolution Notes
                </dt>
                <dd className="rounded bg-[var(--surface-muted)] p-3 text-sm text-[var(--foreground)]">
                  {report.resolutionNotes}
                </dd>
              </div>
            )}

            <div>
              <h4 className="text-md mb-2 font-medium text-[var(--foreground)]">
                Confession Content
              </h4>
              {report.confession?.isDeleted && (
                <p
                  role="status"
                  className="mb-2 rounded bg-[var(--danger)]/10 px-3 py-2 text-xs font-medium text-[var(--danger)]"
                >
                  This confession has been deleted. The content below reflects the
                  message at the time it was reported.
                </p>
              )}
              {!report.confession?.isDeleted && report.confession?.isHidden && (
                <p
                  role="status"
                  className="mb-2 rounded bg-[var(--warning)]/10 px-3 py-2 text-xs font-medium text-[var(--warning)]"
                >
                  This confession is currently hidden from other users.
                </p>
              )}
              <div className="rounded bg-[var(--surface-muted)] p-4">
                <p className="whitespace-pre-wrap break-words text-sm text-[var(--foreground)]">
                  {report.confession?.message || 'Confession not available'}
                </p>
              </div>
            </div>
          </div>

          <ReportModerationTimeline
            entries={timelineEntries}
            isLoading={timelineLoading}
            isError={timelineError}
          />
        </div>

        {pending && (
          <aside className="mt-6 min-w-0 space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow lg:sticky lg:top-4 lg:mt-0 lg:self-start">
            <h3 className="text-base font-semibold text-[var(--foreground)]">Actions</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--secondary)]">
                  Resolution Notes (optional)
                </label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border-[var(--accent-border)] shadow-sm focus:border-[var(--focus-ring)] focus:ring-[var(--focus-ring)]"
                  placeholder="Add notes about this resolution..."
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {MODERATION_TEMPLATES.report_resolved.map((template, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setResolutionNotes(template)}
                      className="rounded bg-[var(--surface-muted)] px-2 py-1 text-xs hover:bg-[var(--skeleton)]"
                    >
                      {template}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MODERATION_TEMPLATES.report_dismissed.map((template, idx) => (
                    <button
                      key={`dismiss-${idx}`}
                      type="button"
                      onClick={() => setResolutionNotes(template)}
                      className="rounded bg-[var(--surface-muted)] px-2 py-1 text-xs hover:bg-[var(--skeleton)]"
                    >
                      {template}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <button
                  type="button"
                  onClick={confirmResolve}
                  className="flex-1 rounded-md bg-[var(--success)] px-4 py-2 text-white hover:opacity-90"
                >
                  Resolve Report
                </button>
                <button
                  type="button"
                  onClick={confirmDismiss}
                  className="flex-1 rounded-md bg-[var(--text-muted)] px-4 py-2 text-[var(--foreground)] hover:bg-[var(--surface-elevated)]"
                >
                  Dismiss Report
                </button>
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <h4 className="text-md mb-2 font-medium text-[var(--foreground)]">
                  Quick Actions
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="rounded-md bg-[var(--danger)] px-4 py-2 text-sm text-white hover:opacity-90"
                  >
                    Delete Confession
                  </button>
                  <button
                    type="button"
                    onClick={confirmHide}
                    className="rounded-md bg-[var(--warning)] px-4 py-2 text-sm text-[#18181b] hover:opacity-90"
                  >
                    Hide Confession
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
