"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, Report } from "@/app/lib/api/admin";
import { queryKeys } from "@/app/lib/api/queryKeys";
import ReportDetail from "./ReportDetail";
import { Button } from "@/app/components/ui/button";
import { useExportCSV } from "@/app/lib/hooks/useExportCSV";
import { ExportCsvButton } from "@/app/components/admin/ExportCsvButton";
import { useAdminConfirmation } from "@/app/components/admin/useAdminConfirmation";

export default function ReportList() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const queryClient = useQueryClient();
  const { triggerExport, isExporting: isExportingCsv } = useExportCSV({ label: 'reports' });
  const { openConfirmation, confirmDialog } = useAdminConfirmation();

  const reportListKey = queryKeys.admin.reports.list({
    statusFilter,
    typeFilter,
    startDate,
    endDate,
    page,
  });

  const { data, isLoading } = useQuery({
    queryKey: reportListKey,
    queryFn: () =>
      adminApi.getReports({
        status: statusFilter !== "all" ? statusFilter : undefined,
        type: typeFilter !== "all" ? typeFilter : undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        limit,
        offset: (page - 1) * limit,
      }),
  });

  const bulkResolveMutation = useMutation({
    mutationFn: ({ ids }: { ids: string[] }) => adminApi.bulkResolveReports(ids),
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.admin.reports.all() });
      const snapshots = queryClient.getQueriesData({ queryKey: queryKeys.admin.reports.all() });
      queryClient.setQueriesData(
        { queryKey: queryKeys.admin.reports.all() },
        (old: any) => {
          if (!old?.reports) return old;
          return {
            ...old,
            reports: old.reports.map((r: Report) =>
              ids.includes(r.id) ? { ...r, status: "resolved" } : r,
            ),
          };
        },
      );
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      context?.snapshots?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.reports.all() });
    },
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkResolve = () => {
    if (selectedIds.size === 0) return;
    const reportIds = Array.from(selectedIds);
    openConfirmation({
      title: 'Resolve selected reports?',
      description: `This will mark ${reportIds.length} selected reports as resolved.`,
      confirmLabel: 'Resolve',
      action: () => bulkResolveMutation.mutateAsync({ ids: reportIds }),
      successMessage: 'Selected reports resolved.',
      errorMessage: 'Failed to resolve selected reports.',
      onSuccess: () => {
        setSelectedIds(new Set());
      },
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500">Loading reports...</div>
    );
  }


  const reports = data?.reports || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const isFilterActive =
    statusFilter !== 'all' || typeFilter !== 'all' || startDate !== '' || endDate !== '';

  const statusClassMap: Record<string, string> = {
    pending:
      'px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100',
    reviewing:
      'px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100',
    resolved:
      'px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100',
    dismissed:
      'px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  };

  const humanizeStatus = (s: string) => {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  if (selectedReport) {
    const report = reports.find((r: Report) => r.id === selectedReport);
    if (report) {
      return (
        <ReportDetail
          report={report}
          onBack={() => setSelectedReport(null)}
          onActionSuccess={() => setSelectedReport(null)}
        />
      );
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      {confirmDialog}

      {/* Filters */}
      <div className="min-w-0 bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="reviewing">Reviewing</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="all">All</option>
              <option value="spam">Spam</option>
              <option value="harassment">Harassment</option>
              <option value="hate_speech">Hate Speech</option>
              <option value="inappropriate_content">
                Inappropriate Content
              </option>
              <option value="copyright">Copyright</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Start date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              End date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <ExportCsvButton
              onClick={() => {
                const exportData: Record<string, unknown>[] = reports.map((r: Report) => ({
                  id: r.id,
                  type: r.type,
                  status: r.status,
                  reporter: r.reporter?.username || "Anonymous",
                  reason: r.reason || "",
                  createdAt: new Date(r.createdAt).toLocaleString(),
                  resolvedAt: r.resolvedAt
                    ? new Date(r.resolvedAt).toLocaleString()
                    : "",
                }));
                triggerExport(
                  exportData,
                  `reports-${new Date().toISOString().split("T")[0]}.csv`,
                );
              }}
              isExporting={isExportingCsv}
              label="Export Reports CSV"
              className="min-h-[44px]"
            />
            {selectedIds.size > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={handleBulkResolve}
                aria-label={`Resolve ${selectedIds.size} selected reports`}
                className="min-h-[44px] rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
              >
                Resolve Selected ({selectedIds.size})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Reports Table */}
      {/* Empty state when filters match nothing */}
      {!isLoading && reports.length === 0 && isFilterActive ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-lg font-medium text-gray-900 dark:text-white">No reports match your filters</p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Try clearing filters to see all reports.</p>
          <div className="mt-4 flex justify-center">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-w-0 max-w-full overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
          <div className="max-w-full overflow-x-auto overscroll-x-contain">
            <table className="min-w-[48rem] divide-y divide-gray-200 dark:divide-gray-700 md:min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    aria-label="Select all reports"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(reports.map((r: Report) => r.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Reporter
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-700 after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-gray-300 dark:after:bg-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {reports.map((report: Report) => (
                <tr
                  key={report.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      aria-label={`Select report ${report.id}`}
                      checked={selectedIds.has(report.id)}
                      onChange={() => toggleSelect(report.id)}
                      className="min-h-[44px] min-w-[44px] rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {report.type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={statusClassMap[report.status] ?? statusClassMap['dismissed']}>
                      {humanizeStatus(report.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {report.reporter?.username || "Anonymous"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(report.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-gray-200 dark:after:bg-gray-700">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedReport(report.id)}
                      aria-label={`View report ${report.id}`}
                      className="min-h-[44px] min-w-[44px] rounded-md px-3 text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)}{" "}
            of {total} results
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous page"
              className="px-4 py-2 border rounded-md disabled:opacity-50"
            >
              Previous
            </Button>
            <Button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
              className="px-4 py-2 border rounded-md disabled:opacity-50"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
