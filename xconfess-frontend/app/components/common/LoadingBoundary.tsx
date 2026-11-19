"use client";

import React from "react";
import {
  LoadingBoundaryType,
  getLoadingBoundaryConfig,
} from "@/app/lib/hooks/useLoadingBoundary";

interface LoadingBoundaryProps {
  isLoading: boolean;
  type: LoadingBoundaryType;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

function Spinner({
  className = "w-8 h-8",
}: { className?: string } = {}) {
  return (
    <div className={`${className} animate-spin`}>
      <svg
        className="w-full h-full"
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
  );
}

function SkeletonLoader() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-24 w-full animate-pulse rounded-lg bg-[var(--skeleton)]"
        />
      ))}
    </div>
  );
}

export const LoadingBoundary: React.FC<LoadingBoundaryProps> = ({
  isLoading,
  type,
  children,
  fallback,
}) => {
  const config = getLoadingBoundaryConfig(type);

  if (!isLoading) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (config.type === "skeleton") {
    return (
      <div
        className={config.preserveLayout ? "invisible" : ""}
        aria-busy="true"
        aria-label={config.announcement}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center min-h-[200px]"
      aria-busy="true"
      aria-label={config.announcement}
    >
      <Spinner />
    </div>
  );
};

export default LoadingBoundary;
