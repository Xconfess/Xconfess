'use client';

import UserManagement from '@/app/components/admin/UserManagement';

export default function UsersPage() {
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--foreground)]">
          Users
        </h1>
      </div>
      <UserManagement />
    </div>
  );
}
