import React from 'react';

interface AnalyticsErrorStateProps {
  onRetry: () => void;
  message?: string;
}

export const AnalyticsErrorState: React.FC<AnalyticsErrorStateProps> = ({
  onRetry,
  message = "Failed to load analytics data",
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow min-h-[300px]">
      <svg
        className="w-12 h-12 text-red-500 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{message}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        There was an error fetching the dashboard data. Please try again.
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
      >
        Retry
      </button>
    </div>
  );
};
