'use client';

import AuditLogList from '@/app/components/admin/AuditLogList';

export default function AuditLogsPage() {
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--foreground)]">Audit Logs</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          View all moderation actions and their history
        </p>
      </div>
      <AuditLogList />
    </div>
  );
}
