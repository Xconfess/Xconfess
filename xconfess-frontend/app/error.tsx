"use client";

import { useEffect } from "react";
import Link from "next/link";
import { logError } from "@/app/lib/utils/errorHandler";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, "Global Error Boundary", {
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="bg-[var(--surface)] rounded-xl p-8 max-w-md w-full border border-[var(--danger)]/50 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-[var(--danger)]/10 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[var(--danger)]"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-[var(--danger)] mb-2">
          Something went wrong
        </h2>
        <p className="text-[var(--text-muted)] text-sm mb-6">
          An unexpected error occurred. Please try again or return to the home
          page.
        </p>

        {process.env.NODE_ENV === "development" && (
          <details className="mb-6 text-xs text-[var(--text-muted)] bg-[var(--surface-muted)] p-3 rounded-lg text-left">
            <summary className="cursor-pointer font-mono">
              Error Details
            </summary>
            <pre className="mt-2 overflow-auto max-h-32 whitespace-pre-wrap">
              {error.message}
              {"\n"}
              {error.stack}
            </pre>
          </details>
        )}

        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-4 py-2.5 rounded-lg text-sm transition-colors font-medium"
          >
            Try Again
          </button>
          {/*  FIXED: Using Link component for internal navigation */}
          <Link
            href="/"
            className="flex-1 bg-[var(--surface-elevated)] hover:bg-[var(--text-muted)] text-[var(--foreground)] px-4 py-2.5 rounded-lg text-sm transition-colors font-medium text-center"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
