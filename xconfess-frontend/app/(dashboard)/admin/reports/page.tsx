'use client';

import ReportList from '@/app/components/admin/ReportList';

export default function ReportsPage() {
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <p className="eyebrow">Moderation</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--foreground)]">
          Reports
        </h1>
      </div>
      <ReportList />
    </div>
  );
}
