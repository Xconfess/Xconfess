'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Eye,
  RotateCcw,
  Search,
  Shield,
  UserCog,
} from 'lucide-react';
import { adminApi, AdminUserRole, User } from '@/app/lib/api/admin';
import { queryKeys } from '@/app/lib/api/queryKeys';
import { Button } from '@/app/components/ui/button';
import { useStepUp } from '@/app/hooks/useStepUp';
import StepUpModal from './StepUpModal';

const roles: AdminUserRole[] = ['user', 'moderator', 'admin'];
const limit = 20;

type UserSortField = 'createdAt' | 'username' | 'role' | 'status';
type SortOrder = 'ASC' | 'DESC';

function displayRole(user: User): AdminUserRole {
  return user.role || (user.isAdmin ? 'admin' : 'user');
}

export default function UserManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [banTarget, setBanTarget] = useState<User | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('');
  const [sortBy, setSortBy] = useState<UserSortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESC');
  const [page, setPage] = useState(1);

  const stepUp = useStepUp();
  const queryClient = useQueryClient();
  const filters = useMemo(
    () => ({ query: searchQuery, page, sortBy, sortOrder }),
    [searchQuery, page, sortBy, sortOrder],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.admin.users.search(JSON.stringify(filters), page),
    queryFn: () =>
      adminApi.searchUsers(
        searchQuery.trim(),
        limit,
        (page - 1) * limit,
        sortBy,
        sortOrder,
      ),
  });

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.users.all() });
    if (selectedUser) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.users.history(selectedUser.id.toString()),
      });
    }
  };

  const roleMutation = useMutation({
    mutationFn: ({
      id,
      role,
      stepUpToken,
    }: {
      id: string;
      role: AdminUserRole;
      stepUpToken?: string;
    }) => adminApi.updateUserRole(id, role, stepUpToken),
    onSuccess: (updated: User) => {
      invalidateUsers();
      setSelectedUser((current) =>
        current && current.id === updated.id ? { ...current, ...updated } : current,
      );
    },
    onError: (err: any, variables) => {
      if (err?.response?.data?.code === 'AUTH_STEP_UP_REQUIRED' || err?.response?.data?.code === 'AUTH_STEP_UP_EXPIRED') {
        stepUp.requestStepUp((token) => {
          roleMutation.mutate({ ...variables, stepUpToken: token });
        });
      }
    },
  });

  const banMutation = useMutation({
    mutationFn: ({
      id,
      reason,
      durationDays,
      stepUpToken,
    }: {
      id: string;
      reason?: string;
      durationDays?: number | null;
      stepUpToken?: string;
    }) => adminApi.banUser(id, reason, durationDays, stepUpToken),
    onSuccess: (updated: User) => {
      invalidateUsers();
      setBanTarget(null);
      setBanReason('');
      setBanDuration('');
      setSelectedUser((current) =>
        current && current.id === updated.id ? { ...current, ...updated } : current,
      );
    },
    onError: (err: any, variables) => {
      if (err?.response?.data?.code === 'AUTH_STEP_UP_REQUIRED' || err?.response?.data?.code === 'AUTH_STEP_UP_EXPIRED') {
        stepUp.requestStepUp((token) => {
          banMutation.mutate({ ...variables, stepUpToken: token });
        });
      }
    },
  });

  const unbanMutation = useMutation({
    mutationFn: (id: string) => adminApi.unbanUser(id),
    onSuccess: (updated: User) => {
      invalidateUsers();
      setSelectedUser((current) =>
        current && current.id === updated.id ? { ...current, ...updated } : current,
      );
    },
  });

  const users: User[] = data?.users || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const changeSort = (field: UserSortField) => {
    if (sortBy === field) {
      setSortOrder((value) => (value === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(field);
      setSortOrder(field === 'username' ? 'ASC' : 'DESC');
    }
    setPage(1);
  };

  const submitBan = () => {
    if (!banTarget) return;
    const durationDays = banDuration ? Number.parseInt(banDuration, 10) : null;
    banMutation.mutate({
      id: banTarget.id.toString(),
      reason: banReason.trim() || undefined,
      durationDays: Number.isFinite(durationDays) ? durationDays : null,
    });
  };
  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search users"
              className="min-h-[44px] w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
            <UserCog className="h-4 w-4" />
            {isFetching ? 'Refreshing' : `${total} users`}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
          <div className="max-w-full overflow-x-auto overscroll-x-contain">
            <table className="min-w-[62rem] divide-y divide-gray-200 dark:divide-gray-700 md:min-w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <SortableHeader label="Username" field="username" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                  <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                  <SortableHeader label="Role" field="role" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                  <SortableHeader label="Created" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                  <th className="sticky right-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {isLoading ? (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={5}>
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={5}>
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/60"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                        <button
                          type="button"
                          onClick={() => setSelectedUser(user)}
                          className="text-left hover:underline"
                        >
                          {user.username}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge active={user.is_active} />
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={displayRole(user)}
                          onChange={(e) =>
                            roleMutation.mutate({
                              id: user.id.toString(),
                              role: e.target.value as AdminUserRole,
                            })
                          }
                          disabled={roleMutation.isPending}
                          aria-label={`Change role for ${user.username}`}
                          className="min-h-[40px] rounded-md border border-gray-300 bg-white px-2 text-sm capitalize text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="sticky right-0 bg-white px-6 py-4 dark:bg-gray-800">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedUser(user)}
                            aria-label={`View ${user.username}`}
                            className="rounded-md px-3"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                          {user.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setBanTarget(user)}
                              aria-label={`Ban ${user.username}`}
                              className="rounded-md px-3 text-red-600 dark:text-red-400"
                            >
                              <Ban className="h-4 w-4" />
                              Ban
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => unbanMutation.mutate(user.id.toString())}
                              aria-label={`Unban ${user.username}`}
                              className="rounded-md px-3 text-green-600 dark:text-green-400"
                            >
                              <RotateCcw className="h-4 w-4" />
                              Unban
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Showing {total === 0 ? 0 : (page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label="Previous page"
                className="rounded-md"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="rounded-md"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <UserDetailPanel user={selectedUser || users[0] || null} />
      </div>

      {banTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ban user dialog"
          onKeyDown={(e) => e.key === 'Escape' && setBanTarget(null)}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl outline-none dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Ban {banTarget.username}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBanTarget(null)}
                aria-label="Close ban dialog"
                className="rounded-md px-3"
              >
                x
              </Button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Reason
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="mt-1 min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  maxLength={500}
                />
              </label>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Duration
                <select
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Indefinite</option>
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setBanTarget(null)}
                className="rounded-md"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={submitBan}
                isLoading={banMutation.isPending}
                className="rounded-md"
              >
                <Ban className="h-4 w-4" />
                Ban User
              </Button>
            </div>
          </div>
        </div>
      )}

      <StepUpModal
        isOpen={stepUp.isModalOpen}
        onVerify={stepUp.verify}
        onCancel={stepUp.cancel}
        error={stepUp.error}
        isVerifying={stepUp.isVerifying}
      />
    </div>
  );
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  field: UserSortField;
  sortBy: UserSortField;
  sortOrder: SortOrder;
  onSort: (field: UserSortField) => void;
}) {
  return (
    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex min-h-[32px] items-center gap-1"
      >
        {label}
        {sortBy === field ? (sortOrder === 'ASC' ? 'A-Z' : 'Z-A') : ''}
      </button>
    </th>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
        active
          ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
          : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
      }`}
    >
      {active ? 'Active' : 'Banned'}
    </span>
  );
}
function UserDetailPanel({ user }: { user: User | null }) {
  const userId = user?.id.toString();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.users.history(userId || 'none'),
    queryFn: () => adminApi.getUserHistory(userId || ''),
    enabled: Boolean(userId),
  });

  if (!user) {
    return (
      <aside className="rounded-lg bg-white p-5 text-sm text-gray-500 shadow dark:bg-gray-800">
        Select a user to view profile and activity.
      </aside>
    );
  }

  const profile = data?.user || user;
  const summary = data?.summary;
  const timeline = data?.activityTimeline || [];

  return (
    <aside className="min-w-0 rounded-lg bg-white p-5 shadow dark:bg-gray-800 xl:sticky xl:top-4 xl:self-start">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-white">
            {profile.username}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge active={profile.is_active} />
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-700 dark:bg-gray-700 dark:text-gray-200">
              <Shield className="h-3 w-3" />
              {displayRole(profile)}
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-gray-500">Loading profile...</div>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Confessions" value={summary?.confessionCount ?? 0} />
            <Metric label="Reports In" value={summary?.reportsReceived ?? 0} />
            <Metric label="Reports Out" value={summary?.reportsFiled ?? 0} />
          </dl>

          <div className="space-y-2 text-sm">
            <InfoRow label="User ID" value={String(profile.id)} />
            <InfoRow label="Created" value={new Date(profile.createdAt).toLocaleString()} />
            <InfoRow label="Updated" value={new Date(profile.updatedAt).toLocaleString()} />
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
              Activity
            </h4>
            {timeline.length ? (
              <div className="space-y-2">
                {timeline.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.label}
                      </div>
                      <div className="whitespace-nowrap text-xs text-gray-500">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {item.summary && (
                      <div className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                        {item.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700">
                No recent activity.
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-700/60">
      <div className="text-lg font-semibold text-gray-900 dark:text-white">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-300">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-gray-100 py-2 dark:border-gray-700">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="max-w-[60%] truncate text-right text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}