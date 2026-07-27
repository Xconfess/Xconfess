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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
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
      description: 'This will mark the report as resolved and keep your moderation notes.',
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
      description: 'This will dismiss the report and keep your dismissal notes.',
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
      description: 'This action cannot be undone. The confession will be permanently deleted.',
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
        'This will hide the confession from regular users while preserving it for admins.',
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
          className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400"
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
          <div className="space-y-6 rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <div>
              <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                Report Details
              </h3>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">ID</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{report.id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Type</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">{report.type}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        report.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100'
                          : report.status === 'resolved'
                            ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {report.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Reporter</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {report.reporter?.username || 'Anonymous'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {new Date(report.createdAt).toLocaleString()}
                  </dd>
                </div>
                {report.resolvedAt && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Resolved
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                      {new Date(report.resolvedAt).toLocaleString()}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {report.reason && (
              <div>
                <dt className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Reason
                </dt>
                <dd className="rounded bg-gray-50 p-3 text-sm text-gray-900 dark:bg-gray-700 dark:text-white">
                  {report.reason}
                </dd>
              </div>
            )}

            {report.resolutionNotes && (
              <div>
                <dt className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Resolution Notes
                </dt>
                <dd className="rounded bg-gray-50 p-3 text-sm text-gray-900 dark:bg-gray-700 dark:text-white">
                  {report.resolutionNotes}
                </dd>
              </div>
            )}

            <div>
              <h4 className="text-md mb-2 font-medium text-gray-900 dark:text-white">
                Confession Content
              </h4>
              {report.confession?.isDeleted && (
                <p
                  role="status"
                  className="mb-2 rounded bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300"
                >
                  This confession has been deleted. The content below reflects the
                  message at the time it was reported.
                </p>
              )}
              {!report.confession?.isDeleted && report.confession?.isHidden && (
                <p
                  role="status"
                  className="mb-2 rounded bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                >
                  This confession is currently hidden from other users.
                </p>
              )}
              <div className="rounded bg-gray-50 p-4 dark:bg-gray-700">
                <p className="whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-white">
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
          <aside className="mt-6 min-w-0 space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800 lg:sticky lg:top-4 lg:mt-0 lg:self-start">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Actions</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Resolution Notes (optional)
                </label>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Add notes about this resolution..."
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {MODERATION_TEMPLATES.report_resolved.map((template, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setResolutionNotes(template)}
                      className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
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
                      className="rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
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
                  className="flex-1 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                >
                  Resolve Report
                </button>
                <button
                  type="button"
                  onClick={confirmDismiss}
                  className="flex-1 rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
                >
                  Dismiss Report
                </button>
              </div>

              <div className="border-t border-gray-200 pt-4 dark:border-gray-600">
                <h4 className="text-md mb-2 font-medium text-gray-900 dark:text-white">
                  Quick Actions
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirmDelete}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
                  >
                    Delete Confession
                  </button>
                  <button
                    type="button"
                    onClick={confirmHide}
                    className="rounded-md bg-yellow-600 px-4 py-2 text-sm text-white hover:bg-yellow-700"
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
