import React from 'react';

interface AnalyticsEmptyStateProps {
  message?: string;
  description?: string;
}

export const AnalyticsEmptyState: React.FC<AnalyticsEmptyStateProps> = ({
  message = "No analytics data available yet",
  description = "Charts will appear after user activity is recorded",
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow min-h-[300px]">
      <svg
        className="w-16 h-16 text-gray-400 dark:text-gray-500 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{message}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">{description}</p>
    </div>
  );
};
