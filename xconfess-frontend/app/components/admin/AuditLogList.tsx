"use client";

import { useMemo, useState } from "react";
import type React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { adminApi, AuditLog } from "@/app/lib/api/admin";
import { useExportCSV } from "@/app/lib/hooks/useExportCSV";
import { queryKeys } from "@/app/lib/api/queryKeys";
import { Button } from "@/app/components/ui/button";

const limit = 50;
type AuditSortField = "createdAt" | "actor" | "action" | "target";
type SortOrder = "ASC" | "DESC";

const actionOptions = [
  ["all", "All actions"],
  ["report_resolved", "Report Resolved"],
  ["report_dismissed", "Report Dismissed"],
  ["confession_deleted", "Confession Deleted"],
  ["confession_hidden", "Confession Hidden"],
  ["confession_unhidden", "Confession Unhidden"],
  ["comment_approved", "Comment Approved"],
  ["comment_rejected", "Comment Rejected"],
  ["user_banned", "User Banned"],
  ["user_unbanned", "User Unbanned"],
  ["user_admin_granted", "Admin Granted"],
  ["user_admin_revoked", "Admin Revoked"],
  ["admin_csv_export", "CSV Export"],
  ["bulk_action", "Bulk Action"],
  ["report_created", "Report Created"],
  ["failed_login", "Failed Login"],
  ["moderation_escalation", "Moderation Escalation"],
];

export default function AuditLogList() {
  const { triggerExport, isExporting } = useExportCSV({ label: "audit logs" });
  const [actionFilter, setActionFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [entityIdFilter, setEntityIdFilter] = useState("");
  const [requestIdFilter, setRequestIdFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [sortBy, setSortBy] = useState<AuditSortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("DESC");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isExportingAll, setIsExportingAll] = useState(false);

  const filters = useMemo(
    () => ({
      actionFilter,
      actorFilter,
      entityTypeFilter,
      entityIdFilter,
      requestIdFilter,
      searchQuery,
      startDateFilter,
      endDateFilter,
      sortBy,
      sortOrder,
      page,
    }),
    [
      actionFilter,
      actorFilter,
      entityTypeFilter,
      entityIdFilter,
      requestIdFilter,
      searchQuery,
      startDateFilter,
      endDateFilter,
      sortBy,
      sortOrder,
      page,
    ],
  );

  const params = {
    action: actionFilter !== "all" ? actionFilter : undefined,
    actor: actorFilter.trim() || undefined,
    entityType: entityTypeFilter !== "all" ? entityTypeFilter : undefined,
    entityId: entityIdFilter.trim() || undefined,
    requestId: requestIdFilter.trim() || undefined,
    search: searchQuery.trim() || undefined,
    startDate: startDateFilter || undefined,
    endDate: endDateFilter || undefined,
    sortBy,
    sortOrder,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.admin.auditLogs.list(filters),
    queryFn: () =>
      adminApi.getAuditLogs({
        ...params,
        limit,
        offset: (page - 1) * limit,
      }),
  });

  const logs: AuditLog[] = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasActiveFilters =
    actionFilter !== "all" ||
    actorFilter.trim() ||
    entityTypeFilter !== "all" ||
    entityIdFilter.trim() ||
    requestIdFilter.trim() ||
    searchQuery.trim() ||
    startDateFilter ||
    endDateFilter;

  const clearFilters = () => {
    setActionFilter("all");
    setActorFilter("");
    setEntityTypeFilter("all");
    setEntityIdFilter("");
    setRequestIdFilter("");
    setSearchQuery("");
    setStartDateFilter("");
    setEndDateFilter("");
    setPage(1);
  };

  const changeSort = (field: AuditSortField) => {
    if (sortBy === field) {
      setSortOrder((value) => (value === "ASC" ? "DESC" : "ASC"));
    } else {
      setSortBy(field);
      setSortOrder(field === "createdAt" ? "DESC" : "ASC");
    }
    setPage(1);
  };

  const exportLogs = async () => {
    setIsExportingAll(true);
    try {
      const exportLimit = Math.max(total, logs.length, limit);
      const exportData = await adminApi.getAuditLogs({
        ...params,
        limit: exportLimit,
        offset: 0,
      });
      triggerExport(
        (exportData.logs || []).map(formatExportRow),
        `audit-logs-${new Date().toISOString().split("T")[0]}.csv`,
      );
    } finally {
      setIsExportingAll(false);
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-300">
            {isFetching ? "Refreshing" : `${total} entries`}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Keyword"
                className="min-h-[44px] w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </Field>
          <Field label="Action">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {actionOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Actor">
            <input
              type="text"
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Username or ID"
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </Field>
          <Field label="Entity Type">
            <select
              value={entityTypeFilter}
              onChange={(e) => {
                setEntityTypeFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="all">All</option>
              <option value="report">Report</option>
              <option value="confession">Confession</option>
              <option value="user">User</option>
              <option value="comment">Comment</option>
              <option value="notification_dlq">Notification DLQ</option>
              <option value="data_export">Data Export</option>
              <option value="template_version">Template</option>
            </select>
          </Field>
          <Field label="Target ID">
            <input
              type="text"
              value={entityIdFilter}
              onChange={(e) => {
                setEntityIdFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Target identifier"
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </Field>
          <Field label="Request ID">
            <input
              type="text"
              value={requestIdFilter}
              onChange={(e) => {
                setRequestIdFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Correlation ID"
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </Field>
          <Field label="Start Date">
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => {
                setStartDateFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </Field>
          <Field label="End Date">
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => {
                setEndDateFilter(e.target.value);
                setPage(1);
              }}
              className="min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={exportLogs}
            isLoading={isExporting || isExportingAll}
            className="rounded-md"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="rounded-md px-3">
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
        <div className="max-w-full overflow-x-auto overscroll-x-contain">
          <table className="min-w-[72rem] divide-y divide-gray-200 dark:divide-gray-700 md:min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <SortableHeader label="Timestamp" field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                <SortableHeader label="Actor" field="actor" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                <SortableHeader label="Action" field="action" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                <SortableHeader label="Target" field="target" sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} />
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
                  Details
                </th>
                <th className="sticky right-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                  Payload
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
                    Loading audit logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
                    {hasActiveFilters
                      ? "No audit logs match your filters."
                      : "No audit logs recorded yet."}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/60">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {actorLabel(log)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm capitalize text-gray-900 dark:text-white">
                      {log.action.replace(/_/g, " ")}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {targetLabel(log)}
                    </td>
                    <td className="max-w-sm px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="truncate">{detailsLabel(log)}</div>
                    </td>
                    <td className="sticky right-0 bg-white px-6 py-4 dark:bg-gray-800">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                        aria-label={`View audit payload ${log.id}`}
                        className="rounded-md px-3"
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          Showing {total === 0 ? 0 : (page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
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
            className="rounded-md"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Audit Payload
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLog(null)}
                className="rounded-md px-3"
              >
                x
              </Button>
            </div>
            <pre className="max-h-[70vh] overflow-auto p-5 text-xs leading-5 text-gray-800 dark:text-gray-100">
              {JSON.stringify(selectedLog, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
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
  field: AuditSortField;
  sortBy: AuditSortField;
  sortOrder: SortOrder;
  onSort: (field: AuditSortField) => void;
}) {
  return (
    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-300">
      <button type="button" onClick={() => onSort(field)} className="min-h-[32px]">
        {label} {sortBy === field ? (sortOrder === "ASC" ? "A-Z" : "Z-A") : ""}
      </button>
    </th>
  );
}

function actorLabel(log: AuditLog) {
  return (
    log.admin?.username ||
    String(log.metadata?.actorLabel || log.metadata?.actorId || log.adminId || "System")
  );
}

function targetLabel(log: AuditLog) {
  if (!log.entityType && !log.entityId) return "-";
  return [log.entityType, log.entityId].filter(Boolean).join(" #");
}

function detailsLabel(log: AuditLog) {
  return (
    log.notes ||
    String(log.metadata?.reason || log.metadata?.label || log.metadata?.outcome || "")
  );
}

function formatExportRow(log: AuditLog) {
  return {
    timestamp: new Date(log.createdAt).toISOString(),
    actor: actorLabel(log),
    action: log.action,
    target: targetLabel(log),
    details: detailsLabel(log),
    requestId: log.requestId || "",
    metadata: JSON.stringify(log.metadata || {}),
  };
}
