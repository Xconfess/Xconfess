'use client';

import type { AuditLog } from '@/app/lib/api/admin';

export type ModerationTimelineEntry = {
  id: string;
  at: string;
  title: string;
  actorLabel: string;
  role: 'reporter' | 'moderator';
  detail?: string | null;
};

const CONFESSION_TIMELINE_ACTIONS = new Set<string>([
  'confession_hidden',
  'confession_deleted',
  'confession_unhidden',
]);

export function buildReportModerationTimeline(
  report: {
    id: string;
    type: string;
    reason: string | null;
    createdAt: string;
    reporter?: { username: string };
  },
  reportLogs: AuditLog[] | undefined,
  confessionLogs: AuditLog[] | undefined,
): ModerationTimelineEntry[] {
  const submitted: ModerationTimelineEntry = {
    id: `synthetic:submitted:${report.id}`,
    at: report.createdAt,
    title: 'Report submitted',
    actorLabel: report.reporter?.username?.trim() || 'Anonymous',
    role: 'reporter',
    detail: [report.type, report.reason].filter(Boolean).join(' · ') || null,
  };

  const fromAudit = (log: AuditLog): ModerationTimelineEntry => ({
    id: log.id,
    at: log.createdAt,
    title: humanizeAuditAction(log.action),
    actorLabel: log.admin?.username?.trim() || 'Unknown moderator',
    role: 'moderator',
    detail: log.notes?.trim() || null,
  });

  const reportEntries = (reportLogs ?? []).map(fromAudit);

  const confessionEntries = (confessionLogs ?? [])
    .filter((l) => CONFESSION_TIMELINE_ACTIONS.has(l.action))
    .map(fromAudit);

  const merged = [submitted, ...reportEntries, ...confessionEntries];
  const seen = new Set<string>();
  const deduped: ModerationTimelineEntry[] = [];
  for (const e of merged) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    deduped.push(e);
  }

  deduped.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  return deduped;
}

function humanizeAuditAction(action: string): string {
  switch (action) {
    case 'report_created':
      return 'Report created (audit)';
    case 'report_resolved':
      return 'Report resolved';
    case 'report_dismissed':
      return 'Report dismissed';
    case 'confession_hidden':
      return 'Confession hidden';
    case 'confession_deleted':
      return 'Confession deleted';
    case 'confession_unhidden':
      return 'Confession unhidden';
    default:
      return action.replace(/_/g, ' ');
  }
}

type ReportModerationTimelineProps = {
  entries: ModerationTimelineEntry[];
  isLoading: boolean;
  isError: boolean;
};

export function ReportModerationTimeline({
  entries,
  isLoading,
  isError,
}: ReportModerationTimelineProps) {
  return (
    <section
      className="rounded-lg border border-gray-200 bg-gray-50/80 dark:border-gray-600 dark:bg-gray-900/40"
      aria-labelledby="report-moderation-history-heading"
    >
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-600">
        <h4
          id="report-moderation-history-heading"
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          Moderation history
        </h4>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Prior actions, times, and moderators for this report and its confession.
        </p>
      </div>

      <div className="max-h-[min(42vh,22rem)] overflow-y-auto overscroll-contain px-3 py-4 sm:max-h-[min(50vh,26rem)] lg:max-h-[min(70vh,32rem)]">
        {isLoading && (
          <ul className="space-y-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex gap-3 animate-pulse">
                <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-3 w-full max-w-md rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {!isLoading && isError && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Could not load full audit history. Submission time and report details
            above are still accurate.
          </p>
        )}

        {!isLoading && !isError && entries.length === 0 && (
          <p className="text-sm text-gray-600 dark:text-gray-400">No history entries.</p>
        )}

        {!isLoading && !isError && entries.length > 0 && (
          <ol className="space-y-0">
            {entries.map((e, idx) => (
              <li key={e.id} className="flex gap-3 pb-6 last:pb-0">
                <div
                  className="flex w-4 shrink-0 flex-col items-center pt-1"
                  aria-hidden
                >
                  <span className="z-[1] h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-gray-50 dark:bg-indigo-400 dark:ring-gray-900/40" />
                  {idx < entries.length - 1 ? (
                    <span className="mt-0.5 w-px flex-1 min-h-[1.25rem] bg-gray-200 dark:bg-gray-600" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <time
                    className="block text-xs font-medium text-gray-500 dark:text-gray-400"
                    dateTime={e.at}
                  >
                    {new Date(e.at).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                  <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                    {e.title}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-gray-700 dark:text-gray-200">
                      {e.actorLabel}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">
                      {' '}
                      · {e.role === 'reporter' ? 'Reporter' : 'Moderator'}
                    </span>
                  </p>
                  {e.detail ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-600 dark:text-gray-400">
                      {e.detail}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
