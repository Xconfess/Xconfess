'use client';

import { Analytics } from '@/app/lib/api/admin';
import { useExportCSV } from '@/app/lib/hooks/useExportCSV';
import { ExportCsvButton } from '@/app/components/admin/ExportCsvButton';
import { AnalyticsEmptyState } from '@/app/components/analytics/AnalyticsEmptyState';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface AnalyticsDashboardProps {
  analytics: Analytics;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function AnalyticsDashboard({ analytics }: AnalyticsDashboardProps) {
  const { triggerExport, isExporting } = useExportCSV({ label: 'analytics' });
  const { overview, reports, trends } = analytics;

  const reportsByStatusData = reports.byStatus.map((item) => ({
    name: item.status,
    value: parseInt(item.count, 10),
  }));

  const reportsByTypeData = reports.byType.map((item) => ({
    name: item.type,
    value: parseInt(item.count, 10),
  }));

  const confessionsOverTimeData = trends.confessionsOverTime.map((item) => ({
    date: new Date(item.date).toLocaleDateString(),
    count: parseInt(item.count, 10),
  }));

  const handleExportAnalytics = () => {
    const exportData: Record<string, unknown>[] = [
      { metric: 'Total Users',           value: overview.totalUsers },
      { metric: 'Active Users (30d)',     value: overview.activeUsers },
      { metric: 'Total Confessions',      value: overview.totalConfessions },
      { metric: 'Total Reports',          value: overview.totalReports },
      { metric: 'Banned Users',           value: overview.bannedUsers },
      { metric: 'Hidden Confessions',     value: overview.hiddenConfessions },
      { metric: 'Deleted Confessions',    value: overview.deletedConfessions },
      ...reports.byStatus.map((item) => ({
        metric: `Reports - ${item.status}`,
        value: parseInt(item.count, 10),
      })),
      ...reports.byType.map((item) => ({
        metric: `Reports - ${item.type}`,
        value: parseInt(item.count, 10),
      })),
    ];

    triggerExport(exportData, `analytics-${new Date().toISOString().split('T')[0]}.csv`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportCsvButton
          onClick={handleExportAnalytics}
          isExporting={isExporting}
          label="Export Analytics CSV"
        />
      </div>
      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {overview.totalUsers.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Users</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {overview.activeUsers.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Active Users (30d)</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {overview.totalConfessions.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Confessions</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {overview.totalReports.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Reports</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Confessions Over Time */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 flex flex-col min-h-[380px]">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Confessions Over Time
          </h3>
          <div className="flex-grow">
            {confessionsOverTimeData.length === 0 ? (
              <AnalyticsEmptyState 
                message="No confession data yet" 
                description="Activity over time will appear here" 
              />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={confessionsOverTimeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="count" stroke="#8884d8" name="Confessions" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Reports by Status */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 flex flex-col min-h-[380px]">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Reports by Status
          </h3>
          <div className="flex-grow">
            {reportsByStatusData.length === 0 ? (
              <AnalyticsEmptyState 
                message="No reports yet" 
                description="Report distribution will appear here" 
              />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={reportsByStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} ${(((percent ?? 0) as number) * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {reportsByStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Reports by Type */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 flex flex-col min-h-[380px]">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Reports by Type
          </h3>
          <div className="flex-grow">
            {reportsByTypeData.length === 0 ? (
              <AnalyticsEmptyState 
                message="No reports yet" 
                description="Types of reports will appear here" 
              />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={reportsByTypeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#8884d8" name="Count" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Moderation Stats */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Moderation Statistics
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Banned Users</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {overview.bannedUsers}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Hidden Confessions</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {overview.hiddenConfessions}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Deleted Confessions</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {overview.deletedConfessions}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
