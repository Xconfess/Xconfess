'use client';

import React from 'react';
import RetryButton from './RetryButton';

interface ErrorStateProps {
  error?: string;
  onRetry?: () => void | Promise<void>;
  title?: string;
  description?: string;
  variant?: "error" | "warning";
  showIcon?: boolean;
  showRetry?: boolean;
  fullHeight?: boolean;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = ({
  error = 'An error occurred',
  onRetry,
  title = 'Error',
  description,
  variant = "error",
  showIcon = true,
  showRetry = true,
  fullHeight = false,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}) => {
  const containerClass = fullHeight
    ? 'min-h-screen flex items-center justify-center'
    : 'py-8 px-4';
  const isWarning = variant === "warning";
  const accentText = isWarning ? "text-[var(--foreground)]" : "text-red-700";
  const subtitleText = isWarning ? "text-[var(--secondary)]" : "text-red-600";
  const iconBg = isWarning ? "bg-[var(--accent-soft)]" : "bg-red-50";
  const iconColor = isWarning ? "text-[var(--primary-deep)]" : "text-red-600";

  return (
    <div className={containerClass}>
      <div className="luxury-panel mx-auto max-w-md rounded-[28px] px-6 py-8 text-center">
        {showIcon && (
          <div className="mb-4 flex justify-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-full ${iconBg}`}>
              <svg
                className={`h-8 w-8 ${iconColor}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                {isWarning ? (
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.721-1.36 3.486 0l6.518 11.59c.75 1.334-.213 2.996-1.742 2.996H3.48c-1.53 0-2.492-1.662-1.743-2.996l6.52-11.59zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-6a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                ) : (
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                )}
              </svg>
            </div>
          </div>
        )}

        <h3 className={`mb-2 font-editorial text-3xl ${accentText}`}>{title}</h3>

        {description && (
          <p className="mb-2 text-sm leading-7 text-[var(--secondary)]">{description}</p>
        )}

        <p className={`mb-6 text-sm leading-7 ${subtitleText}`}>{error}</p>

        <div className="flex flex-wrap justify-center gap-2">
          {showRetry && onRetry && (
            <RetryButton onRetry={() => Promise.resolve(onRetry())} variant="primary" />
          )}
          {primaryActionLabel && onPrimaryAction && (
            <button
              type="button"
              onClick={onPrimaryAction}
              className="rounded-full bg-[linear-gradient(135deg,var(--primary),var(--primary-deep))] px-4 py-2 text-sm font-medium text-white shadow-[0_18px_40px_-22px_rgba(88,105,125,0.55)] transition-colors hover:brightness-105"
            >
              {primaryActionLabel}
            </button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--secondary)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--foreground)]"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorState;
