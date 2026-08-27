'use client';

import React, { useState } from 'react';

interface RetryButtonProps {
  onRetry: () => Promise<void>;
  error?: string;
  label?: string;
  variant?: 'default' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const RetryButton: React.FC<RetryButtonProps> = ({
  onRetry,
  error,
  label = 'Retry',
  variant = 'default',
  size = 'md',
}) => {
  const [loading, setLoading] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const handleRetry = async () => {
    try {
      setLoading(true);
      setRetryError(null);
      await onRetry();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setLoading(false);
    }
  };

  const variantClasses = {
    default:
      'bg-gray-700 hover:bg-gray-600 text-white disabled:bg-gray-800 disabled:text-gray-500',
    primary:
      'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-800 disabled:text-blue-300',
    danger:
      'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-800 disabled:text-red-300',
  };

  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleRetry}
        disabled={loading}
        className={`
          rounded font-medium transition-colors disabled:cursor-not-allowed
          flex items-center justify-center gap-2
          ${sizeClasses[size]}
          ${variantClasses[variant]}
        `}
      >
        {loading ? (
          <>
            <div className="w-4 h-4">
              <svg
                className="animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            Retrying...
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {label}
          </>
        )}
      </button>
      {(error || retryError) && (
        <p className="text-xs text-red-400">{retryError || error}</p>
      )}
    </div>
  );
};

export default RetryButton;
