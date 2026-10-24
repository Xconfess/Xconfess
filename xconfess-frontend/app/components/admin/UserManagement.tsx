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
      <div className="border border-[var(--border)] rounded-lg bg-[var(--surface)] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search users"
              className="min-h-[44px] w-full rounded-md border border-[var(--accent-border)] bg-[var(--surface)] pl-9 pr-3 text-sm shadow-sm focus:border-[var(--focus-ring)] focus:ring-[var(--focus-ring)]"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <UserCog className="h-4 w-4" />
            {isFetching ? 'Refreshing' : `${total} users`}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 overflow-hidden rounded-lg bg-[var(--surface)] shadow">
          <div className="max-w-full overflow-x-auto overscroll-x-contain">
            <table className="min-w-[62rem] divide-y divide-[var(--border)] md:min-w-full">
              <thead className="bg-[var(--surface-muted)]">
                <tr>
                  <SortableHeader label="Username" field="username" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                  <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                  <SortableHeader label="Role" field="role" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                  <SortableHeader label="Created" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                  <th className="sticky right-0 bg-[var(--surface-muted)] px-6 py-3 text-left text-xs font-medium uppercase text-[var(--text-muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
                {isLoading ? (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-[var(--text-muted)]" colSpan={5}>
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-[var(--text-muted)]" colSpan={5}>
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-[var(--surface-muted)]"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-[var(--foreground)]">
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
                          className="min-h-[40px] rounded-md border border-[var(--accent-border)] bg-[var(--surface)] px-2 text-sm capitalize text-[var(--foreground)]"
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--text-muted)]">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="sticky right-0 bg-[var(--surface)] px-6 py-4">
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
                              className="rounded-md px-3 text-[var(--danger)]"
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
                              className="rounded-md px-3 text-[var(--success)]"
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

          <div className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-[var(--secondary)]">
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
          <div className="border border-[var(--border)] w-full max-w-md rounded-lg bg-[var(--surface)] p-5 outline-none">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
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
              <label className="block text-sm font-medium text-[var(--secondary)]">
                Reason
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="mt-1 min-h-24 w-full rounded-md border border-[var(--accent-border)] px-3 py-2 text-sm"
                  maxLength={500}
                />
              </label>
              <label className="block text-sm font-medium text-[var(--secondary)]">
                Duration
                <select
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-md border border-[var(--accent-border)] bg-[var(--surface)] px-3 text-sm"
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
    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-[var(--text-muted)]">
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
          ? 'bg-[var(--success)]/10 text-[var(--foreground)]'
          : 'bg-[var(--danger)]/10 text-[var(--foreground)]'
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
      <aside className="border border-[var(--border)] rounded-lg bg-[var(--surface)] p-5 text-sm text-[var(--text-muted)]">
        Select a user to view profile and activity.
      </aside>
    );
  }

  const profile = data?.user || user;
  const summary = data?.summary;
  const timeline = data?.activityTimeline || [];

  return (
    <aside className="border border-[var(--border)] min-w-0 rounded-lg bg-[var(--surface)] p-5 xl:sticky xl:top-4 xl:self-start">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-[var(--foreground)]">
            {profile.username}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge active={profile.is_active} />
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs capitalize text-[var(--secondary)]">
              <Shield className="h-3 w-3" />
              {displayRole(profile)}
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">Loading profile...</div>
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
            <h4 className="mb-2 text-sm font-semibold text-[var(--foreground)]">
              Activity
            </h4>
            {timeline.length ? (
              <div className="space-y-2">
                {timeline.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="rounded-md border border-[var(--border)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-[var(--foreground)]">
                        {item.label}
                      </div>
                      <div className="whitespace-nowrap text-xs text-[var(--text-muted)]">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {item.summary && (
                      <div className="mt-1 line-clamp-2 text-sm text-[var(--secondary)]">
                        {item.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-[var(--accent-border)] p-4 text-sm text-[var(--text-muted)]">
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
    <div className="rounded-md bg-[var(--surface-muted)] p-3">
      <div className="text-lg font-semibold text-[var(--foreground)]">{value}</div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[var(--border)] py-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="max-w-[60%] truncate text-right text-[var(--foreground)]">{value}</span>
    </div>
  );
}